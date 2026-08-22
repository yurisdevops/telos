import type { ComponentProps } from 'react';
import { and, eq, gte, lt } from 'drizzle-orm';
import Ionicons from '@expo/vector-icons/Ionicons';

import { db } from './index';
import { cardioLogs, cardioSessions, sessions, type CardioLog } from './schema';
import { MODALIDADES_CARDIO, type ModalidadeCardio } from '@/lib/cardio';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

export type CardioWeekSummary = {
  totalMinutos: number;
  porModalidade: { modalidade: ModalidadeCardio; minutos: number; label: string; icon: IoniconsName }[];
  totalSessoes: number;
};

/**
 * Resumo de cardio da janela [startIso, endIso) — quem chama decide os
 * limites (ver CardioSection, que passa a semana atual, mesmo cálculo de
 * boundary já usado por computeCurrentWeekVolume em db/stats.ts). UNION EM
 * MEMÓRIA dos dois modos, já que não há uma tabela/coluna única que os junte:
 * modo A (dentro de um treino de força — cardioLogs.sessionId, filtra por
 * sessions.data/concluida) e modo B (sessão separada só de cardio —
 * cardioLogs.cardioSessionId, filtra por cardioSessions.data/concluida).
 * Cada bloco pertence a exatamente um dos dois modos (nunca os dois, nunca
 * nenhum — mesmo invariante da Etapa A), então não há risco de contar um
 * bloco 2x ao somar os dois resultados.
 */
export async function getCardioWeekSummary(startIso: string, endIso: string): Promise<CardioWeekSummary> {
  const modoARows = await db
    .select({
      sessionId: cardioLogs.sessionId,
      modalidade: cardioLogs.modalidade,
      duracaoMin: cardioLogs.duracaoMin,
    })
    .from(cardioLogs)
    .innerJoin(sessions, eq(cardioLogs.sessionId, sessions.id))
    .where(and(eq(sessions.concluida, true), gte(sessions.data, startIso), lt(sessions.data, endIso)));

  const modoBRows = await db
    .select({
      cardioSessionId: cardioLogs.cardioSessionId,
      modalidade: cardioLogs.modalidade,
      duracaoMin: cardioLogs.duracaoMin,
    })
    .from(cardioLogs)
    .innerJoin(cardioSessions, eq(cardioLogs.cardioSessionId, cardioSessions.id))
    .where(and(eq(cardioSessions.concluida, true), gte(cardioSessions.data, startIso), lt(cardioSessions.data, endIso)));

  const allRows = [
    ...modoARows.map((r) => ({ modalidade: r.modalidade, duracaoMin: r.duracaoMin, sessionKey: `a-${r.sessionId}` })),
    ...modoBRows.map((r) => ({
      modalidade: r.modalidade,
      duracaoMin: r.duracaoMin,
      sessionKey: `b-${r.cardioSessionId}`,
    })),
  ];

  const totalMinutos = allRows.reduce((sum, r) => sum + r.duracaoMin, 0);

  const minutosByModalidade = new Map<string, number>();
  for (const r of allRows) {
    minutosByModalidade.set(r.modalidade, (minutosByModalidade.get(r.modalidade) ?? 0) + r.duracaoMin);
  }
  const porModalidade = [...minutosByModalidade.entries()]
    .map(([modalidadeKey, minutos]) => {
      const meta = MODALIDADES_CARDIO.find((m) => m.key === modalidadeKey);
      return {
        modalidade: (meta?.key ?? modalidadeKey) as ModalidadeCardio,
        minutos,
        label: meta?.label ?? modalidadeKey,
        icon: (meta?.icon ?? 'fitness-outline') as IoniconsName,
      };
    })
    .sort((a, b) => b.minutos - a.minutos);

  const totalSessoes = new Set(allRows.map((r) => r.sessionKey)).size;

  return { totalMinutos, porModalidade, totalSessoes };
}

export type CardioHistoryItem = {
  data: string;
  tipo: 'forca_com_cardio' | 'cardio_puro';
  blocos: CardioLog[];
  duracaoTotalMin: number;
};

/**
 * As `limit` sessões/dias mais recentes com cardio — mesma união dos 2 modos
 * de `getCardioWeekSummary`, sem filtro de janela (histórico completo, só
 * limitado por quantidade). `cardio_puro` = sessão separada (modo B, sempre
 * concluída — sessões canceladas nunca ficam com `concluida=true`);
 * `forca_com_cardio` = treino de força concluído que teve pelo menos 1 bloco
 * de cardio dentro (modo A). Uma query só por modo (join direto, sem buscar
 * "todas as sessões" à parte) — cada linha já sai com a `data` da
 * sessão/cardioSession dona, agrupada em memória por id logo em seguida.
 */
export async function getCardioHistory(limit = 10): Promise<CardioHistoryItem[]> {
  const modoARows = await db
    .select({
      id: cardioLogs.id,
      sessionId: cardioLogs.sessionId,
      cardioSessionId: cardioLogs.cardioSessionId,
      modalidade: cardioLogs.modalidade,
      duracaoMin: cardioLogs.duracaoMin,
      distanciaKm: cardioLogs.distanciaKm,
      intensidade: cardioLogs.intensidade,
      data: sessions.data,
    })
    .from(cardioLogs)
    .innerJoin(sessions, eq(cardioLogs.sessionId, sessions.id))
    .where(eq(sessions.concluida, true));

  const groupsA = new Map<number, { data: string; blocos: CardioLog[] }>();
  for (const row of modoARows) {
    const { data, ...log } = row;
    if (log.sessionId == null) continue; // impossível dado o inner join, só satisfaz o TS
    const group = groupsA.get(log.sessionId) ?? { data, blocos: [] };
    group.blocos.push(log);
    groupsA.set(log.sessionId, group);
  }

  const modoBRows = await db
    .select({
      id: cardioLogs.id,
      sessionId: cardioLogs.sessionId,
      cardioSessionId: cardioLogs.cardioSessionId,
      modalidade: cardioLogs.modalidade,
      duracaoMin: cardioLogs.duracaoMin,
      distanciaKm: cardioLogs.distanciaKm,
      intensidade: cardioLogs.intensidade,
      data: cardioSessions.data,
    })
    .from(cardioLogs)
    .innerJoin(cardioSessions, eq(cardioLogs.cardioSessionId, cardioSessions.id))
    .where(eq(cardioSessions.concluida, true));

  const groupsB = new Map<number, { data: string; blocos: CardioLog[] }>();
  for (const row of modoBRows) {
    const { data, ...log } = row;
    if (log.cardioSessionId == null) continue;
    const group = groupsB.get(log.cardioSessionId) ?? { data, blocos: [] };
    group.blocos.push(log);
    groupsB.set(log.cardioSessionId, group);
  }

  const items: CardioHistoryItem[] = [
    ...[...groupsA.values()].map((g) => ({
      data: g.data,
      tipo: 'forca_com_cardio' as const,
      blocos: g.blocos,
      duracaoTotalMin: g.blocos.reduce((sum, b) => sum + b.duracaoMin, 0),
    })),
    ...[...groupsB.values()].map((g) => ({
      data: g.data,
      tipo: 'cardio_puro' as const,
      blocos: g.blocos,
      duracaoTotalMin: g.blocos.reduce((sum, b) => sum + b.duracaoMin, 0),
    })),
  ];

  return items.sort((a, b) => b.data.localeCompare(a.data)).slice(0, limit);
}

/**
 * Apaga uma sessão de cardio separada (modo B) inteira, blocos primeiro
 * (cardioLogs.cardioSessionId referencia cardioSessions, mesma ordem
 * filho-antes-do-pai já usada em toda deleção deste app) — reusada tanto
 * pelo histórico do Progresso (CardioSection) quanto por cardio/sessao.tsx
 * (que antes duplicava essas 2 chamadas inline).
 */
export async function deleteCardioSession(id: number): Promise<void> {
  await db.delete(cardioLogs).where(eq(cardioLogs.cardioSessionId, id));
  await db.delete(cardioSessions).where(eq(cardioSessions.id, id));
}

/**
 * Apaga só os blocos de cardio de UM treino de força (modo A) — nunca a
 * `sessions` em si, que continua existindo (o treino de musculação não é
 * cardio, só teve um bloco dentro dele). `sessionId` sozinho já identifica
 * exatamente os blocos certos (cada linha de cardioLogs pertence a uma única
 * sessão), sem precisar de filtro por data adicional.
 */
export async function deleteCardioLogsForSession(sessionId: number): Promise<void> {
  await db.delete(cardioLogs).where(eq(cardioLogs.sessionId, sessionId));
}
