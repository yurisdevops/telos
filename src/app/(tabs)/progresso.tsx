import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { BarChart } from 'react-native-gifted-charts';

import { Screen } from '@/components/screen';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { exercises, sessions, setLogs } from '@/db/schema';
import {
  computeWeekStreak,
  formatDayMonthLabel,
  formatShortDateLabel,
  getTodayDateString,
  getWeekStartIso,
  parseLocalIsoDate,
  toLocalIsoDate,
} from '@/lib/date';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

const WEEKS_WINDOW = 10;
const RECENT_DAYS_WINDOW = 56; // ~8 weeks, used for the muscle-volume breakdown
const MUSCLE_LABEL_COLUMN_WIDTH = 108;
const VOLUME_LEGEND = 'Volume = repetições × carga';

/** "7400" -> "7.400" (pt-BR thousands separator, no Intl dependency). */
function formatNumberPtBr(value: number): string {
  const rounded = Math.round(value);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatVolumeKg(value: number): string {
  return `${formatNumberPtBr(value)} kg`;
}

/** Rounds a rough axis step up to a "nice" 1/2/5×10^n number. */
function chooseNiceStep(roughStep: number): number {
  if (roughStep <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;
  let niceNormalized: number;
  if (normalized <= 1.5) niceNormalized = 1;
  else if (normalized <= 3.5) niceNormalized = 2;
  else if (normalized <= 7.5) niceNormalized = 5;
  else niceNormalized = 10;
  return niceNormalized * magnitude;
}

export default function ProgressoScreen() {
  return (
    <Screen edges={['top', 'left', 'right']} scrollable>
      <ScreenTitle title="Progresso" />

      <FrequencySection />
      <WeeklyVolumeSection />
      <MuscleVolumeSection />
      <PersonalRecordsSection />
    </Screen>
  );
}

function FrequencySection() {
  const sessionRows = useDbQuery(
    () => db.select({ data: sessions.data }).from(sessions).where(eq(sessions.concluida, true)),
    ['sessions'],
    []
  );

  const allDates = useMemo(() => (sessionRows ?? []).map((row) => row.data), [sessionRows]);
  const streak = useMemo(() => computeWeekStreak(allDates), [allDates]);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;

  const trainedDays = useMemo(() => {
    const set = new Set<number>();
    for (const date of allDates) {
      if (date.startsWith(monthPrefix)) set.add(Number(date.slice(8, 10)));
    }
    return set;
  }, [allDates, monthPrefix]);

  const leadingOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: Array<number | null> = [
    ...Array.from({ length: leadingOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <Card className="mb-6">
      <Text className="font-display text-5xl text-accent">{streak}</Text>
      <Label className="mb-4">{streak === 1 ? 'semana treinada seguida' : 'semanas treinadas seguidas'}</Label>

      <View className="flex-row flex-wrap gap-1">
        {cells.map((day, index) => (
          <View
            key={index}
            className={`h-8 w-8 items-center justify-center rounded ${
              day === null ? '' : trainedDays.has(day) ? 'bg-accent' : 'border border-border'
            }`}>
            {day !== null && (
              <Text className={`font-body text-xs ${trainedDays.has(day) ? 'text-white' : 'text-muted'}`}>
                {day}
              </Text>
            )}
          </View>
        ))}
      </View>
    </Card>
  );
}

function WeeklyVolumeSection() {
  const volumeRows = useDbQuery(
    () =>
      db
        .select({ data: sessions.data, volume: sql<number>`sum(${setLogs.reps} * ${setLogs.carga})` })
        .from(setLogs)
        .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
        .where(eq(sessions.concluida, true))
        .groupBy(sessions.data),
    ['set_logs', 'sessions'],
    []
  );

  const weeklyData = useMemo(() => {
    const byWeek = new Map<string, number>();
    for (const row of volumeRows ?? []) {
      const weekKey = getWeekStartIso(row.data);
      byWeek.set(weekKey, (byWeek.get(weekKey) ?? 0) + Number(row.volume));
    }

    const weeks: { weekKey: string; volume: number }[] = [];
    const cursor = parseLocalIsoDate(getWeekStartIso(getTodayDateString()));
    for (let i = 0; i < WEEKS_WINDOW; i++) {
      const key = toLocalIsoDate(cursor);
      weeks.unshift({ weekKey: key, volume: byWeek.get(key) ?? 0 });
      cursor.setDate(cursor.getDate() - 7);
    }
    return weeks;
  }, [volumeRows]);

  const hasAnyVolume = weeklyData.some((week) => week.volume > 0);

  // Show the date on every other bar (always keeping the most recent one
  // labeled) so 10 short labels don't crowd a narrow chart — every bar still
  // renders, only some of the text labels are blank.
  const barData = weeklyData.map((week, index) => {
    const distanceFromEnd = weeklyData.length - 1 - index;
    const showLabel = distanceFromEnd % 2 === 0;
    return {
      value: week.volume,
      label: showLabel ? formatDayMonthLabel(parseLocalIsoDate(week.weekKey)) : '',
      frontColor: colors.accent,
    };
  });

  const TARGET_SECTIONS = 4;
  const rawMax = Math.max(...weeklyData.map((week) => week.volume), 0);
  const step = chooseNiceStep(rawMax / TARGET_SECTIONS || 1);
  const niceMax = step * TARGET_SECTIONS;

  return (
    <Card className="mb-6">
      <Text className="font-card-title text-lg text-text">Volume por semana</Text>
      <Label className="mb-4">{`${VOLUME_LEGEND} · semanas iniciadas na data indicada`}</Label>

      {hasAnyVolume ? (
        <BarChart
          data={barData}
          height={160}
          barWidth={16}
          spacing={14}
          initialSpacing={8}
          roundedTop
          hideRules
          xAxisThickness={1}
          xAxisColor={colors.border}
          yAxisThickness={0}
          yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: colors.muted, fontSize: 9 }}
          maxValue={niceMax}
          noOfSections={TARGET_SECTIONS}
          formatYLabel={(label) => formatNumberPtBr(Number(label))}
        />
      ) : (
        <Text className="py-8 text-center font-body text-muted">Sem registros de treino ainda.</Text>
      )}
    </Card>
  );
}

function MuscleVolumeSection() {
  const cutoffIso = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - RECENT_DAYS_WINDOW);
    return toLocalIsoDate(date);
  }, []);

  const rows = useDbQuery(
    () =>
      db
        .select({
          exerciseId: setLogs.exerciseId,
          musculos: exercises.musculos,
          volume: sql<number>`sum(${setLogs.reps} * ${setLogs.carga})`,
        })
        .from(setLogs)
        .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
        .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
        .where(and(eq(sessions.concluida, true), gte(sessions.data, cutoffIso)))
        .groupBy(setLogs.exerciseId),
    ['set_logs', 'sessions'],
    [cutoffIso]
  );

  const muscleData = useMemo(() => {
    const byMuscle = new Map<string, number>();
    for (const row of rows ?? []) {
      const musculos: string[] = JSON.parse(row.musculos);
      for (const muscle of musculos) {
        byMuscle.set(muscle, (byMuscle.get(muscle) ?? 0) + Number(row.volume));
      }
    }
    return [...byMuscle.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value }));
  }, [rows]);

  const maxValue = useMemo(() => Math.max(1, ...muscleData.map((item) => item.value)), [muscleData]);

  return (
    <Card className="mb-6">
      <Text className="font-card-title text-lg text-text">Volume por músculo</Text>
      <Label className="mb-4">{`${VOLUME_LEGEND} · últimas ~8 semanas`}</Label>

      {muscleData.length > 0 ? (
        <View>
          {muscleData.map((item) => (
            <View key={item.label} className="mb-3 flex-row items-center gap-3">
              <Label
                className="text-right"
                numberOfLines={2}
                style={{ width: MUSCLE_LABEL_COLUMN_WIDTH }}>
                {item.label}
              </Label>
              <View className="h-3 flex-1 overflow-hidden rounded bg-surface">
                <View
                  className="h-full rounded bg-accent"
                  style={{ width: `${(item.value / maxValue) * 100}%` }}
                />
              </View>
              <Text
                className="text-right font-label text-xs text-muted"
                style={{ minWidth: 68 }}>
                {formatVolumeKg(item.value)}
              </Text>
            </View>
          ))}

          <View
            className="flex-row justify-between"
            style={{ paddingLeft: MUSCLE_LABEL_COLUMN_WIDTH + 12, paddingRight: 68 }}>
            <Label>{formatNumberPtBr(0)}</Label>
            <Label>{formatNumberPtBr(Math.round(maxValue / 2))}</Label>
            <Label>{formatNumberPtBr(Math.round(maxValue))}</Label>
          </View>
        </View>
      ) : (
        <Text className="py-8 text-center font-body text-muted">Sem registros de treino recentes.</Text>
      )}
    </Card>
  );
}

type PrRow = { exerciseId: number; nome: string; carga: number; reps: number; data: string };

function usePersonalRecords(): PrRow[] | undefined {
  return useDbQuery<PrRow[]>(
    async () => {
      const maxByExercise = await db
        .select({ exerciseId: setLogs.exerciseId, maxCarga: sql<number>`max(${setLogs.carga})` })
        .from(setLogs)
        .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
        .where(eq(sessions.concluida, true))
        .groupBy(setLogs.exerciseId);

      const rows: PrRow[] = [];
      for (const row of maxByExercise) {
        if (row.maxCarga == null) continue;

        const detail = await db
          .select({ nome: exercises.nome, reps: setLogs.reps, data: sessions.data })
          .from(setLogs)
          .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
          .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
          .where(
            and(
              eq(setLogs.exerciseId, row.exerciseId),
              eq(setLogs.carga, row.maxCarga),
              eq(sessions.concluida, true)
            )
          )
          .orderBy(desc(sessions.data))
          .limit(1);

        if (detail[0]) {
          rows.push({
            exerciseId: row.exerciseId,
            carga: row.maxCarga,
            reps: detail[0].reps,
            nome: detail[0].nome,
            data: detail[0].data,
          });
        }
      }

      rows.sort((a, b) => b.data.localeCompare(a.data));
      return rows;
    },
    ['set_logs', 'sessions'],
    []
  );
}

function PersonalRecordsSection() {
  const prs = usePersonalRecords();

  return (
    <Card>
      <Text className="mb-4 font-card-title text-lg text-text">Recordes pessoais</Text>

      {prs === undefined ? null : prs.length === 0 ? (
        <Text className="py-8 text-center font-body text-muted">Sem recordes ainda.</Text>
      ) : (
        prs.map((pr, index) => (
          <View
            key={pr.exerciseId}
            className={`flex-row items-baseline justify-between ${
              index < prs.length - 1 ? 'mb-4 border-b border-border pb-4' : ''
            }`}>
            <View className="flex-1 pr-3">
              <Text className="font-body-medium text-base text-text" numberOfLines={1}>
                {pr.nome}
              </Text>
              <Label className="mt-1">{`${pr.reps} reps · ${formatShortDateLabel(pr.data)}`}</Label>
            </View>
            <Text className="font-display text-4xl text-accent">
              {pr.carga}
              <Text className="font-label text-sm text-muted"> kg</Text>
            </Text>
          </View>
        ))
      )}
    </Card>
  );
}
