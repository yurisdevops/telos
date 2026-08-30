import { sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from './index';
import { limparPlanosEfemerosOrfaos } from './ready-workouts';
import { sessionExtraExercises, sessionSkips, sessions, setLogs } from './schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Apaga TODO o histórico de treinos — sessões, séries, exercícios avulsos,
 * exercícios pulados, e os planos efêmeros (`'Treino pronto'`/`'Livre'`,
 * ver `TIPOS_PLANO_EFEMERO`) que ficam órfãos quando as sessões deles somem.
 * Numa única transação síncrona: ou apaga tudo, ou (erro no meio) reverte
 * por completo, banco fica exatamente como estava — mesmo padrão de
 * `treinarAgora`/`importBackupPayload`.
 *
 * NÃO toca em: `workoutPlans`/`workoutDays`/`workoutDayExercises` de tipo
 * que não seja efêmero (planos normais e `'Pronto'` salvos como planilha
 * continuam intactos), `bodyWeightLogs` (peso), `userProfile` (perfil
 * inteiro, **incluindo `pinHash`/`pinSalt`** — o PIN sobrevive ao reset,
 * precisa continuar valendo pro próximo reset), `exercises` (catálogo).
 * Nenhuma dessas tabelas é mencionada abaixo de propósito.
 */
export function resetHistory(): void {
  db.transaction((tx: Tx) => {
    // Ordem de FK, filhos antes dos pais — as 3 tabelas que têm FK pra
    // `sessions.id` são exatamente estas (conferido em schema.ts: nenhuma
    // outra tabela referencia `sessions`). `sessionSkips` também referencia
    // `workoutDayExercises.id`, mas como TODAS as skips são apagadas aqui
    // (não só as de planos 'Treino pronto'), isso nunca vira um problema pro
    // passo seguinte.
    tx.delete(setLogs).run();
    tx.delete(sessionExtraExercises).run();
    tx.delete(sessionSkips).run();
    tx.delete(sessions).run();

    // Só DEPOIS de `sessions` estar vazia: reaproveita a limpeza de planos
    // efêmeros órfãos (ready-workouts.ts) — com nenhuma sessão sobrando,
    // todo plano `'Treino pronto'`/`'Livre'` fica sem referência nenhuma ao
    // seu dia, então a função apaga todos eles (e só eles — filtra
    // estritamente por `tipo` em `TIPOS_PLANO_EFEMERO`, nunca toca em
    // planos normais/'Pronto').
    limparPlanosEfemerosOrfaos(tx);
  });
}

/** Contagem reativa de sessões — usada só pra compor o texto da confirmação
 * final ("isso apaga N treinos"), antes do usuário confirmar o reset. */
export function useSessionCount(): number {
  const { data } = useLiveQuery(db.select({ count: sql<number>`count(*)` }).from(sessions));
  return Number(data?.[0]?.count ?? 0);
}
