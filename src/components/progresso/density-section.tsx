import { useMemo } from 'react';
import { Text } from 'react-native';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { BarChart } from 'react-native-gifted-charts';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { db } from '@/db';
import { sessions, setLogs } from '@/db/schema';
import { getWeekStartIso } from '@/lib/date';
import { chooseNiceStep, formatNumberPtBr } from '@/lib/format';
import { useDbQuery } from '@/lib/use-db-query';
import { buildWeekWindow } from '@/lib/weeks';
import { colors } from '@/theme/tokens';

const WEEKS_WINDOW = 10;

type SessionVolume = { sessionId: number; data: string; horaInicio: number | null; horaFim: number | null; volume: number };

async function computeSessionDensities(): Promise<{ data: string; densidade: number }[]> {
  const rows: SessionVolume[] = await db
    .select({
      sessionId: sessions.id,
      data: sessions.data,
      horaInicio: sessions.horaInicio,
      horaFim: sessions.horaFim,
      volume: sql<number>`sum(${setLogs.reps} * ${setLogs.carga})`,
    })
    .from(setLogs)
    .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
    .where(and(eq(sessions.concluida, true), isNotNull(sessions.horaInicio), isNotNull(sessions.horaFim)))
    .groupBy(sessions.id);

  return rows
    .filter((row) => row.horaInicio != null && row.horaFim != null && row.horaFim > row.horaInicio)
    .map((row) => {
      const minutes = (row.horaFim! - row.horaInicio!) / 60000;
      return { data: row.data, densidade: minutes > 0 ? Number(row.volume) / minutes : 0 };
    });
}

/** Volume ÷ duração — a mesma tonelagem em menos tempo é progresso, mesmo
 * quando o volume bruto fica igual (dados de duração vêm da Onda 1). */
export function DensitySection() {
  const rows = useDbQuery(computeSessionDensities, ['set_logs', 'sessions'], []);
  const weekWindow = useMemo(() => buildWeekWindow(WEEKS_WINDOW), []);

  const weeklyAvg = useMemo(() => {
    const byWeek = new Map<string, number[]>();
    for (const row of rows ?? []) {
      const weekKey = getWeekStartIso(row.data);
      const list = byWeek.get(weekKey) ?? [];
      list.push(row.densidade);
      byWeek.set(weekKey, list);
    }
    return weekWindow.map((weekKey) => {
      const list = byWeek.get(weekKey) ?? [];
      const avg = list.length > 0 ? list.reduce((sum, v) => sum + v, 0) / list.length : 0;
      return { weekKey, avg };
    });
  }, [rows, weekWindow]);

  const hasAny = weeklyAvg.some((week) => week.avg > 0);

  const barData = weeklyAvg.map((week) => ({ value: Math.round(week.avg), frontColor: colors.accent }));
  const TARGET_SECTIONS = 4;
  const rawMax = Math.max(...weeklyAvg.map((week) => week.avg), 0);
  const step = chooseNiceStep(rawMax / TARGET_SECTIONS || 1);
  const niceMax = step * TARGET_SECTIONS;

  return (
    <Card className="mb-6">
      <Text className="font-card-title text-lg text-text">Densidade de treino</Text>
      <Label className="mb-4">Volume ÷ duração (kg por minuto) · média semanal, últimas {WEEKS_WINDOW} semanas</Label>

      {hasAny ? (
        <BarChart
          data={barData}
          height={140}
          barWidth={16}
          spacing={14}
          initialSpacing={8}
          roundedTop
          hideRules
          xAxisThickness={1}
          xAxisColor={colors.border}
          yAxisThickness={0}
          yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
          maxValue={niceMax}
          noOfSections={TARGET_SECTIONS}
          formatYLabel={(label) => formatNumberPtBr(Number(label))}
        />
      ) : (
        <Text className="py-8 text-center font-body text-muted">
          Sem sessões com duração registrada ainda.
        </Text>
      )}
    </Card>
  );
}
