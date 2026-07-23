import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { and, eq, gte, isNotNull, sql } from 'drizzle-orm';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { db } from '@/db';
import { sessions, setLogs, workoutDays, workoutPlans } from '@/db/schema';
import { formatElapsed } from '@/lib/duration';
import { formatVolumeKg } from '@/lib/format';
import { useDbQuery } from '@/lib/use-db-query';
import { weeksBetween } from '@/lib/weeks';

const ADHERENCE_WEEKS_WINDOW = 10;

type AdherenceResult = {
  planNome: string;
  completedInWindow: number;
  expectedInWindow: number;
  numWeeks: number;
  dayCount: number;
} | null;

async function computeAdherence(cutoffIso: string, todayIso: string): Promise<AdherenceResult> {
  const rows = await db
    .select({ sessionId: sessions.id, data: sessions.data, planId: workoutDays.planId })
    .from(sessions)
    .innerJoin(workoutDays, eq(sessions.workoutDayId, workoutDays.id))
    .where(and(eq(sessions.concluida, true), gte(sessions.data, cutoffIso)));

  if (rows.length === 0) return null;

  const countByPlan = new Map<number, number>();
  const mostRecentByPlan = new Map<number, string>();
  for (const row of rows) {
    countByPlan.set(row.planId, (countByPlan.get(row.planId) ?? 0) + 1);
    const current = mostRecentByPlan.get(row.planId);
    if (!current || row.data > current) mostRecentByPlan.set(row.planId, row.data);
  }

  let bestPlanId = rows[0].planId;
  let bestCount = -1;
  for (const [planId, count] of countByPlan) {
    if (
      count > bestCount ||
      (count === bestCount && (mostRecentByPlan.get(planId) ?? '') > (mostRecentByPlan.get(bestPlanId) ?? ''))
    ) {
      bestCount = count;
      bestPlanId = planId;
    }
  }

  const planRows = await db.select().from(workoutPlans).where(eq(workoutPlans.id, bestPlanId)).limit(1);
  const plan = planRows[0];
  if (!plan) return null;

  const daysInPlan = await db
    .select({ id: workoutDays.id })
    .from(workoutDays)
    .where(eq(workoutDays.planId, bestPlanId));
  const dayCount = daysInPlan.length;
  if (dayCount === 0) return null;

  const weeksSincePlanCreated = weeksBetween(plan.criadoEm.slice(0, 10), todayIso);
  const numWeeks = Math.max(1, Math.min(ADHERENCE_WEEKS_WINDOW, weeksSincePlanCreated));

  return {
    planNome: plan.nome,
    completedInWindow: bestCount,
    expectedInWindow: dayCount * numWeeks,
    numWeeks,
    dayCount,
  };
}

type PeriodComparison = { thisMonth: number; prevMonth: number };

async function computePeriodComparison(thisMonthPrefix: string, prevMonthPrefix: string): Promise<PeriodComparison> {
  const rows = await db
    .select({ data: sessions.data, volume: sql<number>`sum(${setLogs.reps} * ${setLogs.carga})` })
    .from(setLogs)
    .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
    .where(eq(sessions.concluida, true))
    .groupBy(sessions.data);

  let thisMonth = 0;
  let prevMonth = 0;
  for (const row of rows) {
    if (row.data.startsWith(thisMonthPrefix)) thisMonth += Number(row.volume);
    else if (row.data.startsWith(prevMonthPrefix)) prevMonth += Number(row.volume);
  }
  return { thisMonth, prevMonth };
}

type DurationByDay = { label: string; avgMs: number };

async function computeAvgDurationByDay(): Promise<DurationByDay[]> {
  const rows = await db
    .select({ label: workoutDays.label, horaInicio: sessions.horaInicio, horaFim: sessions.horaFim })
    .from(sessions)
    .innerJoin(workoutDays, eq(sessions.workoutDayId, workoutDays.id))
    .where(and(eq(sessions.concluida, true), isNotNull(sessions.horaInicio), isNotNull(sessions.horaFim)));

  const byLabel = new Map<string, number[]>();
  for (const row of rows) {
    if (row.horaInicio == null || row.horaFim == null) continue;
    const ms = row.horaFim - row.horaInicio;
    if (ms <= 0) continue;
    const list = byLabel.get(row.label) ?? [];
    list.push(ms);
    byLabel.set(row.label, list);
  }

  return [...byLabel.entries()]
    .map(([label, list]) => ({ label, avgMs: list.reduce((sum, v) => sum + v, 0) / list.length }))
    .sort((a, b) => b.avgMs - a.avgMs);
}

/** Aderência (baseada nos dias do plano mais treinado no período — não existe
 * conceito de "plano ativo" explícito, então é inferido pelo uso real),
 * comparação de volume entre meses, e duração média por tipo de dia. */
export function AdherenceSection() {
  const now = new Date();
  const todayIso = useMemo(() => now.toISOString().slice(0, 10), []);
  const cutoffIso = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - ADHERENCE_WEEKS_WINDOW * 7);
    return date.toISOString().slice(0, 10);
  }, []);
  const thisMonthPrefix = useMemo(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, []);
  const prevMonthPrefix = useMemo(() => {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const adherence = useDbQuery(
    () => computeAdherence(cutoffIso, todayIso),
    ['sessions'],
    [cutoffIso, todayIso]
  );
  const comparison = useDbQuery(
    () => computePeriodComparison(thisMonthPrefix, prevMonthPrefix),
    ['set_logs', 'sessions'],
    [thisMonthPrefix, prevMonthPrefix]
  );
  const durationByDay = useDbQuery(computeAvgDurationByDay, ['sessions'], []);

  const adherencePercent = adherence ? Math.round((adherence.completedInWindow / adherence.expectedInWindow) * 100) : null;
  const comparisonDelta =
    comparison && comparison.prevMonth > 0
      ? Math.round(((comparison.thisMonth - comparison.prevMonth) / comparison.prevMonth) * 100)
      : null;

  return (
    <Card className="mb-6">
      <Text className="mb-4 font-card-title text-lg text-text">Aderência e comparação</Text>

      <Label className="mb-1">Aderência ao plano em uso</Label>
      {adherence === undefined ? null : adherence === null ? (
        <Text className="mb-4 py-2 font-body text-muted">Sem sessões nesse período ainda.</Text>
      ) : (
        <View className="mb-4">
          <Text className="font-display text-4xl text-accent">
            {adherencePercent}
            <Text className="font-label text-sm text-muted"> %</Text>
          </Text>
          <Label>
            {`${adherence.planNome} · ${adherence.completedInWindow} de ${adherence.expectedInWindow} treinos esperados (${adherence.dayCount} ${adherence.dayCount === 1 ? 'dia' : 'dias'} × ${adherence.numWeeks} ${adherence.numWeeks === 1 ? 'semana' : 'semanas'})`}
          </Label>
        </View>
      )}

      <Label className="mb-1">Volume: este mês vs. anterior</Label>
      {comparison === undefined ? null : comparison.thisMonth === 0 && comparison.prevMonth === 0 ? (
        <Text className="mb-4 py-2 font-body text-muted">Sem volume registrado ainda.</Text>
      ) : (
        <View className="mb-4 flex-row items-baseline gap-2">
          <Text className="font-display text-2xl text-text">{formatVolumeKg(comparison.thisMonth)}</Text>
          {comparisonDelta !== null && (
            <Text className={`font-label text-sm ${comparisonDelta >= 0 ? 'text-success' : 'text-muted'}`}>
              {comparisonDelta >= 0 ? `+${comparisonDelta}%` : `${comparisonDelta}%`}
            </Text>
          )}
          <Label>{`vs. ${formatVolumeKg(comparison.prevMonth)} no mês anterior`}</Label>
        </View>
      )}

      <Label className="mb-1">Duração média por tipo de treino</Label>
      {durationByDay === undefined ? null : durationByDay.length === 0 ? (
        <Text className="py-2 font-body text-muted">Sem sessões com duração registrada ainda.</Text>
      ) : (
        durationByDay.map((row) => (
          <View key={row.label} className="flex-row items-center justify-between py-1">
            <Text className="font-body-medium text-sm text-text">{row.label}</Text>
            <Text className="font-label text-sm text-muted">{formatElapsed(row.avgMs)}</Text>
          </View>
        ))
      )}
    </Card>
  );
}
