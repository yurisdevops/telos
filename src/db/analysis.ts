import { and, eq, gte, lt, sql } from 'drizzle-orm';

import { db } from './index';
import { exercises, sessions, setLogs } from './schema';
import { classifyMovementPattern } from '@/lib/movement-pattern';
import { buildWeekWindow } from '@/lib/weeks';

const WEEKS_COUNT = 4;

/**
 * Janela das últimas `WEEKS_COUNT` semanas ISO **completas**, excluindo a
 * semana atual — reusa `buildWeekWindow` (mesma função da Etapa 6) pedindo
 * uma semana a mais só pra usar como limite superior exclusivo.
 *
 * Decisão: a semana atual (parcial, ainda em andamento) NÃO entra na média.
 * Incluí-la distorceria a média pra baixo dependendo de que dia da semana
 * é hoje (ex: consultar numa segunda-feira, com a semana atual quase vazia,
 * puxaria a média de todo mundo pra baixo à toa) — o objetivo da média de
 * 4 semanas é suavizar ruído, não introduzir um viés previsível. `endIso` é
 * exclusivo (dados com `data < endIso`), então a semana atual fica de fora
 * por completo.
 */
function getPriorCompleteWeeksRange(): { startIso: string; endIso: string } {
  const window = buildWeekWindow(WEEKS_COUNT + 1);
  return { startIso: window[0], endIso: window[WEEKS_COUNT] };
}

type SeriesRow = { exerciseId: number; nome: string; categoria: string; musculos: string; sets: number };

// Consulta compartilhada pelas duas análises abaixo — mesmo critério em
// ambas: sessões concluídas, janela de 4 semanas completas, contagem de
// SÉRIES (nunca volume-carga), sem filtrar `pesoCorporal` (série de peso
// corporal é série de trabalho pra essa contagem, mesmo critério de
// MuscleSeriesVolumeSection no Progresso).
async function fetchSeriesRowsForWindow(startIso: string, endIso: string): Promise<SeriesRow[]> {
  const rows = await db
    .select({
      exerciseId: setLogs.exerciseId,
      nome: exercises.nome,
      categoria: exercises.categoria,
      musculos: exercises.musculos,
      sets: sql<number>`count(*)`,
    })
    .from(setLogs)
    .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
    .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
    .where(and(eq(sessions.concluida, true), gte(sessions.data, startIso), lt(sessions.data, endIso)))
    .groupBy(setLogs.exerciseId);

  return rows.map((row) => ({ ...row, sets: Number(row.sets) }));
}

/**
 * Média semanal de séries por grupo muscular, nas últimas 4 semanas
 * completas. Mapeia só por `exercises.musculos` (músculo primário) — músculo
 * secundário NÃO entra, mesmo critério já usado em MuscleSeriesVolumeSection.
 * Um exercício com mais de um músculo primário soma a série inteira pra cada
 * um (não divide). Retorna todos os grupos que aparecerem, sem filtrar —
 * a UI decide o que exibir/destacar.
 */
export async function computeWeeklyMuscleSeries(): Promise<Record<string, number>> {
  const { startIso, endIso } = getPriorCompleteWeeksRange();
  const rows = await fetchSeriesRowsForWindow(startIso, endIso);

  const totalByMuscle = new Map<string, number>();
  for (const row of rows) {
    const musculos: string[] = JSON.parse(row.musculos);
    for (const muscle of musculos) {
      totalByMuscle.set(muscle, (totalByMuscle.get(muscle) ?? 0) + row.sets);
    }
  }

  const result: Record<string, number> = {};
  for (const [muscle, total] of totalByMuscle) {
    result[muscle] = total / WEEKS_COUNT;
  }
  return result;
}

export type WeeklyPushPull = { empurrarPorSemana: number; puxarPorSemana: number };

/**
 * Média semanal de séries de empurrar vs. puxar, mesma janela de 4 semanas.
 * Reusa `classifyMovementPattern` (mesma fonte de verdade do Progresso) —
 * agachar/dobradiça/isolado/cardio não entram nessa comparação, só o balanço
 * empurrar/puxar.
 */
export async function computeWeeklyPushPull(): Promise<WeeklyPushPull> {
  const { startIso, endIso } = getPriorCompleteWeeksRange();
  const rows = await fetchSeriesRowsForWindow(startIso, endIso);

  let empurrarTotal = 0;
  let puxarTotal = 0;
  for (const row of rows) {
    const pattern = classifyMovementPattern({ nome: row.nome, categoria: row.categoria });
    if (pattern === 'empurrar_horizontal' || pattern === 'empurrar_vertical') {
      empurrarTotal += row.sets;
    } else if (pattern === 'puxar_horizontal' || pattern === 'puxar_vertical') {
      puxarTotal += row.sets;
    }
  }

  return {
    empurrarPorSemana: empurrarTotal / WEEKS_COUNT,
    puxarPorSemana: puxarTotal / WEEKS_COUNT,
  };
}
