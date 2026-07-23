import { useMemo } from 'react';
import { ScrollView, Text } from 'react-native';
import { eq, sql } from 'drizzle-orm';
import { BarChart } from 'react-native-gifted-charts';

import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Label } from '@/components/ui/label';
import { db } from '@/db';
import { deloadWeeks, sessions, setLogs } from '@/db/schema';
import { formatDayMonthLabel, getWeekStartIso, parseLocalIsoDate } from '@/lib/date';
import { chooseNiceStep, formatNumberPtBr } from '@/lib/format';
import { useDbQuery } from '@/lib/use-db-query';
import { buildWeekWindow } from '@/lib/weeks';
import { colors } from '@/theme/tokens';

const WEEKS_WINDOW = 10;
const VOLUME_LEGEND = 'Volume = repetições × carga';

export function WeeklyVolumeSection() {
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

  const deloadRows = useDbQuery(() => db.select().from(deloadWeeks), ['deload_weeks'], []);

  const deloadWeekSet = useMemo(
    () => new Set((deloadRows ?? []).map((row) => row.weekStartIso)),
    [deloadRows]
  );

  const weekWindow = useMemo(() => buildWeekWindow(WEEKS_WINDOW), []);

  const weeklyData = useMemo(() => {
    const byWeek = new Map<string, number>();
    for (const row of volumeRows ?? []) {
      const weekKey = getWeekStartIso(row.data);
      byWeek.set(weekKey, (byWeek.get(weekKey) ?? 0) + Number(row.volume));
    }
    return weekWindow.map((weekKey) => ({ weekKey, volume: byWeek.get(weekKey) ?? 0 }));
  }, [volumeRows, weekWindow]);

  const hasAnyVolume = weeklyData.some((week) => week.volume > 0);

  // Show the date on every other bar (always keeping the most recent one
  // labeled) so 10 short labels don't crowd a narrow chart — every bar still
  // renders, only some of the text labels are blank.
  const barData = weeklyData.map((week, index) => {
    const distanceFromEnd = weeklyData.length - 1 - index;
    const showLabel = distanceFromEnd % 2 === 0;
    const isDeload = deloadWeekSet.has(week.weekKey);
    return {
      value: week.volume,
      label: showLabel ? formatDayMonthLabel(parseLocalIsoDate(week.weekKey)) : '',
      frontColor: isDeload ? colors.warning : colors.accent,
    };
  });

  const TARGET_SECTIONS = 4;
  const rawMax = Math.max(...weeklyData.map((week) => week.volume), 0);
  const step = chooseNiceStep(rawMax / TARGET_SECTIONS || 1);
  const niceMax = step * TARGET_SECTIONS;

  const toggleDeload = async (weekStartIso: string) => {
    try {
      if (deloadWeekSet.has(weekStartIso)) {
        await db.delete(deloadWeeks).where(eq(deloadWeeks.weekStartIso, weekStartIso));
      } else {
        await db.insert(deloadWeeks).values({ weekStartIso });
      }
    } catch (err) {
      console.error('Falha ao marcar semana de deload:', err);
    }
  };

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

      <Label className="mb-2 mt-4 text-warning">Marcar semana como deload</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {weekWindow.map((weekIso) => (
          <Chip
            key={weekIso}
            label={formatDayMonthLabel(parseLocalIsoDate(weekIso))}
            selected={deloadWeekSet.has(weekIso)}
            onPress={() => toggleDeload(weekIso)}
          />
        ))}
      </ScrollView>
    </Card>
  );
}
