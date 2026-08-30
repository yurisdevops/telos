import { and, desc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';

import { db } from './index';
import { cardioSessions, exercises, sessions, setLogs, workoutDayExercises, workoutDays, workoutPlans } from './schema';
import { findSessionPrs, type SessionPr } from '@/lib/personal-records';
import { getTodayDateString, getWeekStartIso, parseLocalIsoDate, toLocalIsoDate } from '@/lib/date';
import { computeTrainedDaysInMonth, getCurrentMonthPrefix } from '@/lib/stats';

// Mesma lista de MONTHS em lib/date.ts (privada, não exportada de lá) —
// duplicada aqui pro nome do mês anterior (computeMonthlyTrainingCounts) e
// pro cabeçalho do calendário no dashboard (index.tsx importa `MESES_PT`
// daqui em vez de duplicar uma 3ª cópia); exportar de date.ts ficaria fora
// do escopo combinado desta etapa (arquivos já definidos no pedido).
export const MESES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Fallback quando não há nenhum plano ativo (getActivePlanFrequency) — mesmo
// valor default já usado antes de existir essa função (META_SEMANAL_PADRAO,
// que morava em index.tsx).
const META_SEMANAL_FALLBACK = 3;

/**
 * Id do "plano ativo" — o que tem a sessão concluída mais recente, entre
 * planos reais (`tipo !== 'Treino pronto'`, mesmo filtro do DayPicker em
 * hoje.tsx: treino pronto é efêmero/um-uso-só, não conta como "o plano que
 * o usuário está seguindo"). `null` se não existir nenhum. Extraído de
 * `getNextSuggestedWorkout` (que já fazia exatamente essa consulta) pra
 * `getActivePlanFrequency` e `getActivePlanDays` reusarem sem duplicar SQL.
 */
async function getActivePlanId(): Promise<number | null> {
  const planLastTrainedRows = await db
    .select({ planId: workoutDays.planId, lastData: sql<string>`max(${sessions.data})` })
    .from(sessions)
    .innerJoin(workoutDays, eq(sessions.workoutDayId, workoutDays.id))
    .innerJoin(workoutPlans, eq(workoutDays.planId, workoutPlans.id))
    .where(and(eq(sessions.concluida, true), ne(workoutPlans.tipo, 'Treino pronto')))
    .groupBy(workoutDays.planId);

  if (planLastTrainedRows.length === 0) return null;
  return planLastTrainedRows.reduce((best, row) => (row.lastData > best.lastData ? row : best)).planId;
}

/**
 * Meta semanal = quantos dias (workoutDays) o plano ativo tem — um plano de
 * 6 dias (Push/Pull/Legs x2, por exemplo) tem meta 6, não o "3" fixo de
 * antes. `META_SEMANAL_FALLBACK` cobre tanto "nenhum plano ativo" quanto
 * (defensivamente) um plano ativo sem nenhum dia cadastrado — caso que não
 * deveria existir na prática (todo plano nasce com pelo menos 1 dia), mas
 * evita meta=0 (barra de progresso sempre "cheia", divisão por zero) se
 * acontecer.
 */
export async function getActivePlanFrequency(): Promise<number> {
  const activePlanId = await getActivePlanId();
  if (activePlanId === null) return META_SEMANAL_FALLBACK;

  const days = await db.select({ id: workoutDays.id }).from(workoutDays).where(eq(workoutDays.planId, activePlanId));
  return days.length > 0 ? days.length : META_SEMANAL_FALLBACK;
}

export type PlanDay = { id: number; label: string };

/** Todos os dias do plano ativo, na ordem do plano — alimenta os chips do
 * botão "Trocar" no card Próximo Treino (index.tsx filtra o dia sugerido
 * fora da lista). `[]` se não houver plano ativo. */
export async function getActivePlanDays(): Promise<PlanDay[]> {
  const activePlanId = await getActivePlanId();
  if (activePlanId === null) return [];

  return db
    .select({ id: workoutDays.id, label: workoutDays.label })
    .from(workoutDays)
    .where(eq(workoutDays.planId, activePlanId))
    .orderBy(workoutDays.ordem);
}

/**
 * Datas (ISO) com QUALQUER treino concluído — musculação (`sessions`) OU
 * cardio (`cardioSessions`, os dois modos já unidos por cardio-stats.ts na
 * origem: aqui só interessa a DATA, não o modo) — deduplicadas por data via
 * `Set`, então um dia com os dois nunca conta 2x. Fonte única reaproveitada
 * por todo agregado abaixo que deveria refletir "dia treinado" incluindo
 * cardio (frequência semanal/mensal, calendário, barras de meses) — mesmo
 * espírito de união em memória que `getCardioWeekSummary`/`getCardioHistory`
 * (cardio-stats.ts) já usam pros 2 modos internos do cardio, só que aqui
 * unindo cardio com FORÇA em vez dos 2 modos de cardio entre si.
 *
 * Sem filtro de período (busca tudo) — os agregados que precisam de uma
 * janela filtram o array resultante em memória (comparação de string ISO
 * funciona igual à cronológica); pro volume de dados de um único usuário
 * (dezenas a poucos milhares de sessões ao longo de anos), isso é mais
 * simples e barato que uma query SQL por período por chamador, e faz cada
 * função abaixo precisar de só 1 chamada em vez de repetir a união.
 */
export async function getAllTrainedDates(): Promise<string[]> {
  const [sessionRows, cardioRows] = await Promise.all([
    db.select({ data: sessions.data }).from(sessions).where(eq(sessions.concluida, true)),
    db.select({ data: cardioSessions.data }).from(cardioSessions).where(eq(cardioSessions.concluida, true)),
  ]);
  return [...new Set([...sessionRows.map((r) => r.data), ...cardioRows.map((r) => r.data)])];
}

/**
 * Treinos concluídos na semana atual (count de DIAS distintos, não de
 * sessões — um dia com força E cardio conta 1x, não 2x) — mesmo boundary
 * [início, +7 dias) de `computeCurrentWeekVolume` (stats.ts). Conta cardio
 * (ver `getAllTrainedDates`): é a "frequência" que a barra de progresso da
 * meta semanal mostra, e um dia só de cardio é, pro usuário, um dia
 * treinado igual.
 */
export async function computeWeekTrainingCount(): Promise<number> {
  const weekStartIso = getWeekStartIso(getTodayDateString());
  const weekStart = parseLocalIsoDate(weekStartIso);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndIso = toLocalIsoDate(weekEnd);

  const allDates = await getAllTrainedDates();
  return allDates.filter((data) => data >= weekStartIso && data < weekEndIso).length;
}

/** Primeiro dia (ISO) do mês que contém hoje, deslocado por `monthOffset`
 * meses (negativo = meses atrás) — `Date` estoura mês/ano sozinho (mês -1 em
 * janeiro vira dezembro do ano anterior), sem aritmética manual aqui. */
function startOfMonthIso(monthOffset: number): string {
  const now = new Date();
  return toLocalIsoDate(new Date(now.getFullYear(), now.getMonth() + monthOffset, 1));
}

/** Treinos concluídos no mês atual e anterior (dias distintos, cardio
 * incluído — mesmo raciocínio de `computeWeekTrainingCount`), + nome do mês
 * anterior em português (pro texto comparativo "vs {mesAnterior}" do card
 * MÊS). */
export async function computeMonthlyTrainingCounts(): Promise<{
  atual: number;
  anterior: number;
  mesAnteriorNome: string;
}> {
  const inicioAnterior = startOfMonthIso(-1);
  const inicioAtual = startOfMonthIso(0);
  const inicioProximo = startOfMonthIso(1);

  const allDates = await getAllTrainedDates();
  const atual = allDates.filter((data) => data >= inicioAtual && data < inicioProximo).length;
  const anterior = allDates.filter((data) => data >= inicioAnterior && data < inicioAtual).length;

  const mesAnteriorIndex = (new Date().getMonth() + 11) % 12;
  return { atual, anterior, mesAnteriorNome: MESES_PT[mesAnteriorIndex] };
}

/**
 * Volume (reps × carga) da semana atual e da anterior, em kg — mesmo
 * critério de `computeCurrentWeekVolume` (stats.ts): só sessões concluídas,
 * excluindo séries de peso corporal e de aquecimento (nenhuma das duas é
 * carga de trabalho de verdade). Não reaproveita `computeCurrentWeekVolume`
 * diretamente (ela só devolve a semana atual) — `computeVolumeForRange` é a
 * mesma consulta parametrizada por boundary, chamada 2x.
 */
async function computeVolumeForRange(startIso: string, endIso: string): Promise<number> {
  const rows = await db
    .select({ volume: sql<number>`sum(${setLogs.reps} * ${setLogs.carga})` })
    .from(setLogs)
    .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.concluida, true),
        eq(setLogs.pesoCorporal, false),
        eq(setLogs.aquecimento, false),
        gte(sessions.data, startIso),
        lt(sessions.data, endIso)
      )
    );
  return Number(rows[0]?.volume ?? 0);
}

export async function computeWeeklyVolumeKg(): Promise<{ atual: number; anterior: number }> {
  const weekStartIso = getWeekStartIso(getTodayDateString());
  const weekStart = parseLocalIsoDate(weekStartIso);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndIso = toLocalIsoDate(weekEnd);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekStartIso = toLocalIsoDate(prevWeekStart);

  const [atual, anterior] = await Promise.all([
    computeVolumeForRange(weekStartIso, weekEndIso),
    computeVolumeForRange(prevWeekStartIso, weekStartIso),
  ]);
  return { atual, anterior };
}

/** Dias do mês atual (1-31) com treino concluído — força OU cardio (ver
 * `getAllTrainedDates`), pros pontos do calendário refletirem um dia só de
 * cardio igual a um dia de musculação. Reusa
 * `computeTrainedDaysInMonth`/`getCurrentMonthPrefix` (lib/stats.ts, já
 * existentes, mesma lógica do FrequencySection no Progresso) em vez de
 * reimplementar o parse de dia-do-mês a partir da data ISO. */
export async function getMonthTrainingDays(): Promise<Set<number>> {
  const inicioAtual = startOfMonthIso(0);
  const inicioProximo = startOfMonthIso(1);

  const allDates = await getAllTrainedDates();
  const datasDoMes = allDates.filter((data) => data >= inicioAtual && data < inicioProximo);

  return computeTrainedDaysInMonth(datasDoMes, getCurrentMonthPrefix());
}

/**
 * Contagem de treinos concluídos por mês (dias distintos, cardio incluído),
 * dos últimos `months` meses (incluindo o atual), do mais antigo pro mais
 * recente — alimenta as mini barras do card MÊS. Não fazia parte da lista
 * literal de funções do pedido (só as 4 nomeadas), mas o layout aprovado
 * pede "6 barras (últimos 6 meses)" — sem essa contagem elas seriam
 * decoração sem dado nenhum atrás. Mesmo arquivo, nenhum arquivo novo além
 * do combinado. Uma única chamada a `getAllTrainedDates` fora do loop (antes
 * eram `months` queries separadas ao banco, uma por mês).
 */
export async function computeLastMonthsTrainingCounts(months: number): Promise<number[]> {
  const allDates = await getAllTrainedDates();
  const counts: number[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const inicio = startOfMonthIso(-i);
    const fim = startOfMonthIso(-i + 1);
    counts.push(allDates.filter((data) => data >= inicio && data < fim).length);
  }
  return counts;
}

function formatPrDate(iso: string): string {
  const date = parseLocalIsoDate(iso);
  return `${date.getDate()} ${MESES_ABREV[date.getMonth()]}`;
}

const LATEST_PR_SESSION_LOOKBACK = 5;

export type LatestPr = { exerciseNome: string; cargaNova: number; data: string };

/**
 * Último PR batido, em qualquer sessão recente — varre as
 * `LATEST_PR_SESSION_LOOKBACK` sessões concluídas mais recentes (mais nova
 * primeiro) chamando `findSessionPrs` (lib/personal-records.ts, já existente
 * — só olha PRs DENTRO de uma sessão específica) em cada uma, até achar a
 * primeira com pelo menos um PR. `null` se nenhuma das sessões olhadas tiver
 * batido recorde. `data` já formatada como "25 ago" (dia + mês abreviado),
 * pro card do dashboard não precisar formatar de novo.
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
      return { exerciseNome: prs[0].exerciseNome, cargaNova: prs[0].cargaNova, data: formatPrDate(session.data) };
    }
  }
  return null;
}

export type NextSuggestedWorkout = { planNome: string; dayNome: string; dayId: number; musculos: string };

const MUSCULOS_TOP_N = 3;

/**
 * Próximo treino sugerido — heurística: acha o "plano ativo" (o que tem a
 * sessão concluída mais recente, entre planos reais — `tipo !== 'Treino
 * pronto'`, mesmo filtro de DayPicker em hoje.tsx, já que treino pronto é
 * efêmero/um-uso-só e não faz sentido "sugerir de novo"), depois escolhe
 * dentro dele o dia com `lastTrained` mais antigo (dia nunca treinado vence
 * qualquer data real, por convenção — string vazia ordena antes de qualquer
 * ISO date). `musculos`: grupos musculares dos exercícios DESSE dia (não de
 * séries feitas — o dia ainda não foi treinado hoje), contados por
 * frequência entre os exercícios do plano, top 3 mais comuns, unidos com
 * " · ". `null` se não existir nenhum plano real com sessão concluída.
 */
export async function getNextSuggestedWorkout(): Promise<NextSuggestedWorkout | null> {
  const activePlanId = await getActivePlanId();
  if (activePlanId === null) return null;

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

  const exerciseRows = await db
    .select({ musculos: exercises.musculos })
    .from(workoutDayExercises)
    .innerJoin(exercises, eq(workoutDayExercises.exerciseId, exercises.id))
    .where(eq(workoutDayExercises.dayId, nextDay.id));

  const musculoFreq = new Map<string, number>();
  for (const row of exerciseRows) {
    let lista: string[];
    try {
      lista = JSON.parse(row.musculos);
    } catch {
      lista = [];
    }
    for (const musculo of lista) musculoFreq.set(musculo, (musculoFreq.get(musculo) ?? 0) + 1);
  }
  const musculos = [...musculoFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MUSCULOS_TOP_N)
    .map(([musculo]) => musculo)
    .join(' · ');

  return { planNome: plan.nome, dayNome: nextDay.label, dayId: nextDay.id, musculos };
}
