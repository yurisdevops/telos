import { and, eq, ne, sql } from 'drizzle-orm';

import { db } from '@/db';
import { exercises, sessions, setLogs } from '@/db/schema';

export type SessionPr = {
  exerciseId: number;
  exerciseNome: string;
  /** null = primeira vez fazendo esse exercício (não existe histórico
   * anterior pra comparar) — ainda assim conta como PR. */
  cargaAnterior: number | null;
  cargaNova: number;
  reps: number;
};

/**
 * PRs batidos NESTA sessão: pra cada exercício com série de carga real
 * (`pesoCorporal = false`) na sessão, compara a maior carga feita aqui
 * contra a maior carga de TODAS as outras sessões concluídas — se a desta
 * sessão for maior (ou não houver histórico anterior nesse exercício), é PR.
 *
 * Função pura assíncrona (não é hook) e reutilizável de propósito: hoje
 * alimenta o card de compartilhamento (via hoje.tsx), e serve também pra uma
 * futura tela de celebração ao concluir treino — por isso devolve TODOS os
 * PRs da sessão, não só um; quem chama decide como resumir/exibir.
 *
 * Faz sua própria consulta (não reaproveita `logs` já carregado em memória
 * por quem chama) — é enxuta e sempre correta mesmo chamada fora do
 * contexto de SessionExecution.
 */
export async function findSessionPrs(sessionId: number): Promise<SessionPr[]> {
  // Sessão fora da academia nunca gera PR — não faz sentido bater recorde
  // num aparelho/carga que não é o padrão comparável.
  const sessionRow = await db
    .select({ foraDaAcademia: sessions.foraDaAcademia })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (sessionRow[0]?.foraDaAcademia) return [];

  const sessionMaxRows = await db
    .select({ exerciseId: setLogs.exerciseId, maxCarga: sql<number>`max(${setLogs.carga})` })
    .from(setLogs)
    .where(and(eq(setLogs.sessionId, sessionId), eq(setLogs.pesoCorporal, false)))
    .groupBy(setLogs.exerciseId);

  if (sessionMaxRows.length === 0) return [];

  const historicalMaxRows = await db
    .select({ exerciseId: setLogs.exerciseId, maxCarga: sql<number>`max(${setLogs.carga})` })
    .from(setLogs)
    .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.concluida, true),
        eq(setLogs.pesoCorporal, false),
        eq(sessions.foraDaAcademia, false),
        ne(sessions.id, sessionId)
      )
    )
    .groupBy(setLogs.exerciseId);
  const historicalMaxByExercise = new Map(historicalMaxRows.map((row) => [row.exerciseId, row.maxCarga]));

  const prs: SessionPr[] = [];
  for (const row of sessionMaxRows) {
    if (row.maxCarga == null) continue;

    const cargaAnterior = historicalMaxByExercise.get(row.exerciseId) ?? null;
    if (cargaAnterior != null && row.maxCarga <= cargaAnterior) continue;

    const detail = await db
      .select({ nome: exercises.nome, reps: setLogs.reps })
      .from(setLogs)
      .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
      .where(
        and(
          eq(setLogs.sessionId, sessionId),
          eq(setLogs.exerciseId, row.exerciseId),
          eq(setLogs.carga, row.maxCarga),
          eq(setLogs.pesoCorporal, false)
        )
      )
      .limit(1);
    if (!detail[0]) continue;

    prs.push({
      exerciseId: row.exerciseId,
      exerciseNome: detail[0].nome,
      cargaAnterior,
      cargaNova: row.maxCarga,
      reps: detail[0].reps,
    });
  }

  return prs;
}

/** Maior ganho RELATIVO sobre a carga anterior (não absoluto em kg) — um
 * salto de +2,5kg num exercício de 20kg (12,5%) é mais impressionante que
 * +2,5kg num de 100kg (2,5%). Primeira vez no exercício (sem histórico
 * anterior) sempre vence, por convenção (ganho "infinito"). `null` se a
 * lista estiver vazia. */
export function pickHighlightPr(prs: SessionPr[]): SessionPr | null {
  if (prs.length === 0) return null;
  return prs.reduce((best, current) => (relativeGain(current) > relativeGain(best) ? current : best));
}

function relativeGain(pr: SessionPr): number {
  if (pr.cargaAnterior == null || pr.cargaAnterior <= 0) return Infinity;
  return (pr.cargaNova - pr.cargaAnterior) / pr.cargaAnterior;
}
