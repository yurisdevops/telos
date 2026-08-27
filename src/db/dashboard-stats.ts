import { and, desc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';

import { db } from './index';
import { sessions, workoutDays, workoutPlans } from './schema';
import { findSessionPrs, type SessionPr } from '@/lib/personal-records';
import { getTodayDateString, getWeekStartIso, parseLocalIsoDate, toLocalIsoDate } from '@/lib/date';

/**
 * Treinos concluídos na semana atual (count) — mesmo boundary [início, +7
 * dias) de `computeCurrentWeekVolume` (stats.ts), só trocando o agregado de
 * soma de volume por contagem de sessões.
 */
export async function computeWeekTrainingCount(): Promise<number> {
  const weekStartIso = getWeekStartIso(getTodayDateString());
  const weekStart = parseLocalIsoDate(weekStartIso);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndIso = toLocalIsoDate(weekEnd);

  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(and(eq(sessions.concluida, true), gte(sessions.data, weekStartIso), lt(sessions.data, weekEndIso)));

  return Number(rows[0]?.count ?? 0);
}

/** Primeiro dia (ISO) do mês que contém `date`, com `date` já deslocada por
 * `monthOffset` meses (negativo = meses atrás) — `Date` estoura mês/ano
 * sozinho (mês -1 em janeiro vira dezembro do ano anterior), então não
 * precisa de aritmética manual de calendário aqui. */
function startOfMonthIso(monthOffset: number): string {
  const now = new Date();
  return toLocalIsoDate(new Date(now.getFullYear(), now.getMonth() + monthOffset, 1));
}

/** Treinos concluídos no mês atual e no mês anterior — boundary [início do
 * mês, início do mês seguinte), mesmo padrão de `computeWeekTrainingCount`
 * mas com fronteira de mês em vez de semana. */
export async function computeMonthlyTrainingCounts(): Promise<{ atual: number; anterior: number }> {
  const inicioAnterior = startOfMonthIso(-1);
  const inicioAtual = startOfMonthIso(0);
  const inicioProximo = startOfMonthIso(1);

  const [atualRows, anteriorRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(and(eq(sessions.concluida, true), gte(sessions.data, inicioAtual), lt(sessions.data, inicioProximo))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(and(eq(sessions.concluida, true), gte(sessions.data, inicioAnterior), lt(sessions.data, inicioAtual))),
  ]);

  return { atual: Number(atualRows[0]?.count ?? 0), anterior: Number(anteriorRows[0]?.count ?? 0) };
}

const LATEST_PR_SESSION_LOOKBACK = 5;

export type LatestPr = { exerciseNome: string; cargaNova: number; data: string };

/**
 * Último PR batido, em qualquer sessão recente — varre as
 * `LATEST_PR_SESSION_LOOKBACK` sessões concluídas mais recentes (mais nova
 * primeiro) chamando `findSessionPrs` (lib/personal-records.ts, já existente
 * — só olha PRs DENTRO de uma sessão específica) em cada uma, até achar a
 * primeira com pelo menos um PR. `null` se nenhuma das sessões olhadas tiver
 * batido recorde (não significa que não exista PR mais antigo, só que não
 * está entre as mais recentes — suficiente pro resumo do dashboard).
 */
export async function getLatestPR(): Promise<LatestPr | null> {
  const recentSessions = await db
    .select({ id: sessions.id, data: sessions.data })
    .from(sessions)
    .where(eq(sessions.concluida, true))
    .orderBy(desc(sessions.data), desc(sessions.id))
    .limit(LATEST_PR_SESSION_LOOKBACK);

  for (const session of recentSessions) {
    const prs: SessionPr[] = await findSessionPrs(session.id);
    if (prs.length > 0) {
      return { exerciseNome: prs[0].exerciseNome, cargaNova: prs[0].cargaNova, data: session.data };
    }
  }
  return null;
}

export type NextSuggestedWorkout = { planNome: string; dayNome: string; dayId: number };

/**
 * Próximo treino sugerido — heurística: acha o "plano ativo" (o que tem a
 * sessão concluída mais recente, entre planos reais — `tipo !== 'Treino
 * pronto'`, mesmo filtro de DayPicker em hoje.tsx, já que treino pronto é
 * efêmero/um-uso-só e não faz sentido "sugerir de novo"), depois escolhe
 * dentro dele o dia com `lastTrained` mais antigo (dia nunca treinado vence
 * qualquer data real, por convenção — string vazia ordena antes de qualquer
 * ISO date). `null` se não existir nenhum plano real com sessão concluída.
 */
export async function getNextSuggestedWorkout(): Promise<NextSuggestedWorkout | null> {
  const planLastTrainedRows = await db
    .select({ planId: workoutDays.planId, lastData: sql<string>`max(${sessions.data})` })
    .from(sessions)
    .innerJoin(workoutDays, eq(sessions.workoutDayId, workoutDays.id))
    .innerJoin(workoutPlans, eq(workoutDays.planId, workoutPlans.id))
    .where(and(eq(sessions.concluida, true), ne(workoutPlans.tipo, 'Treino pronto')))
    .groupBy(workoutDays.planId);

  if (planLastTrainedRows.length === 0) return null;

  const activePlanId = planLastTrainedRows.reduce((best, row) =>
    row.lastData > best.lastData ? row : best
  ).planId;

  const planRow = await db
    .select({ id: workoutPlans.id, nome: workoutPlans.nome })
    .from(workoutPlans)
    .where(eq(workoutPlans.id, activePlanId));
  const plan = planRow[0];
  if (!plan) return null;

  const days = await db
    .select({ id: workoutDays.id, label: workoutDays.label })
    .from(workoutDays)
    .where(eq(workoutDays.planId, activePlanId))
    .orderBy(workoutDays.ordem);
  if (days.length === 0) return null;

  const lastTrainedRows = await db
    .select({ dayId: sessions.workoutDayId, lastData: sql<string>`max(${sessions.data})` })
    .from(sessions)
    .where(and(eq(sessions.concluida, true), inArray(sessions.workoutDayId, days.map((d) => d.id))))
    .groupBy(sessions.workoutDayId);
  const lastTrainedByDay = new Map(lastTrainedRows.map((row) => [row.dayId, row.lastData]));

  const nextDay = days.reduce((best, day) => {
    const bestLast = lastTrainedByDay.get(best.id) ?? '';
    const dayLast = lastTrainedByDay.get(day.id) ?? '';
    return dayLast < bestLast ? day : best;
  });

  return { planNome: plan.nome, dayNome: nextDay.label, dayId: nextDay.id };
}
