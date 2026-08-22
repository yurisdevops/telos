import { and, eq, gte, lt, sql } from 'drizzle-orm';

import { db } from './index';
import { sessions, setLogs } from './schema';
import { getTodayDateString, getWeekStartIso, parseLocalIsoDate, toLocalIsoDate } from '@/lib/date';

/**
 * Volume (reps × carga) só da semana atual — query enxuta e independente,
 * não uma extração da pipeline de 10 semanas do WeeklyVolumeSection
 * (Progresso). Essa pipeline mistura concerns de gráfico (deload, cor de
 * barra, contagem por semana) que não têm nada a ver com um único número de
 * resumo; extrair dali arriscaria o comportamento do gráfico pra ganhar
 * pouco. Mesmo critério de volume que o resto do app: pesoCorporal=true
 * não entra (não é carga de verdade), aquecimento=true também não (não é
 * série de trabalho).
 */
export async function computeCurrentWeekVolume(): Promise<number> {
  const weekStartIso = getWeekStartIso(getTodayDateString());
  const weekStart = parseLocalIsoDate(weekStartIso);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndIso = toLocalIsoDate(weekEnd);

  const rows = await db
    .select({ volume: sql<number>`sum(${setLogs.reps} * ${setLogs.carga})` })
    .from(setLogs)
    .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.concluida, true),
        eq(setLogs.pesoCorporal, false),
        eq(setLogs.aquecimento, false),
        gte(sessions.data, weekStartIso),
        lt(sessions.data, weekEndIso)
      )
    );

  return Number(rows[0]?.volume ?? 0);
}

/** Total de sessões concluídas desde sempre. */
export async function computeTotalWorkouts(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(eq(sessions.concluida, true));
  return Number(rows[0]?.count ?? 0);
}
