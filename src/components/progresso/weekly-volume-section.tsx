import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { eq, sql } from 'drizzle-orm';
import { BarChart } from 'react-native-gifted-charts';

import { HelpIcon } from '@/components/help-icon';
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
    const byWeek = new Map<string, { volume: number; sessionCount: number }>();
    for (const row of volumeRows ?? []) {
      const weekKey = getWeekStartIso(row.data);
      const entry = byWeek.get(weekKey) ?? { volume: 0, sessionCount: 0 };
      entry.volume += Number(row.volume);
      entry.sessionCount += 1;
      byWeek.set(weekKey, entry);
    }
    return weekWindow.map((weekKey) => {
      const entry = byWeek.get(weekKey);
      return { weekKey, volume: entry?.volume ?? 0, sessionCount: entry?.sessionCount ?? 0 };
    });
  }, [volumeRows, weekWindow]);

  const hasAnyVolume = weeklyData.some((week) => week.volume > 0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedWeek = selectedIndex != null ? weeklyData[selectedIndex] : null;

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
      frontColor: index === selectedIndex ? colors.text : isDeload ? colors.warning : colors.accent,
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
        <>
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
            onPress={(_item: unknown, index: number) =>
              setSelectedIndex((current) => (current === index ? null : index))
            }
          />
          <View className="mt-3 items-center" style={{ minHeight: 20 }}>
            {selectedWeek && (
              <Text className="font-body-medium text-sm text-text">
                {`Semana de ${formatDayMonthLabel(parseLocalIsoDate(selectedWeek.weekKey))}: ${formatNumberPtBr(selectedWeek.volume)}kg · ${selectedWeek.sessionCount} ${selectedWeek.sessionCount === 1 ? 'treino' : 'treinos'}`}
              </Text>
            )}
          </View>
        </>
      ) : (
        <Text className="py-8 text-center font-body text-muted">Sem registros de treino ainda.</Text>
      )}

      <View className="mb-2 mt-4 flex-row items-center gap-1">
        <Label className="text-warning">Marcar semana como deload</Label>
        <HelpIcon title="Marcar semana como deload">
          Isso é 100% manual: você escolhe quando marcar. Não existe nenhuma detecção automática de
          quando você precisa de um deload. O único efeito é mudar a cor da barra dessa semana pra
          âmbar no gráfico acima.
        </HelpIcon>
      </View>
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
