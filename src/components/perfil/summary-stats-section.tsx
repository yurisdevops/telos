import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { eq } from 'drizzle-orm';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { db } from '@/db';
import { sessions } from '@/db/schema';
import { computeCurrentWeekVolume, computeTotalWorkouts } from '@/db/stats';
import { computeWeekStreak } from '@/lib/date';
import { formatNumberPtBr } from '@/lib/format';
import { computeTrainedDaysInMonth, getCurrentMonthPrefix } from '@/lib/stats';
import { useDbQuery } from '@/lib/use-db-query';

// 4 números de resumo no topo do Perfil — reaproveita os mesmos cálculos já
// usados no Progresso (FrequencySection/computeWeekStreak) sempre que possível;
// volume da semana e total de treinos são queries novas e enxutas (ver
// src/db/stats.ts) porque extrair da pipeline de 10 semanas do
// WeeklyVolumeSection arriscaria o gráfico do Progresso por pouco ganho.
export function SummaryStatsSection() {
  const sessionRows = useDbQuery(
    () => db.select({ data: sessions.data }).from(sessions).where(eq(sessions.concluida, true)),
    ['sessions'],
    []
  );
  const allDates = useMemo(() => (sessionRows ?? []).map((row) => row.data), [sessionRows]);

  const monthPrefix = getCurrentMonthPrefix();
  const trainedThisMonth = useMemo(
    () => computeTrainedDaysInMonth(allDates, monthPrefix).size,
    [allDates, monthPrefix]
  );
  const streak = useMemo(() => computeWeekStreak(allDates), [allDates]);

  const weekVolume = useDbQuery(computeCurrentWeekVolume, ['set_logs', 'sessions'], []);
  const totalWorkouts = useDbQuery(computeTotalWorkouts, ['sessions'], []);

  return (
    <View className="mb-6 gap-3">
      <View className="flex-row gap-3">
        <StatCard value={String(trainedThisMonth)} label="treinos no mês" />
        <StatCard
          value={String(streak)}
          label={streak === 1 ? 'semana seguida' : 'semanas seguidas'}
        />
      </View>
      <View className="flex-row gap-3">
        <StatCard value={formatNumberPtBr(weekVolume ?? 0)} unit="kg" label="volume da semana" />
        <StatCard value={String(totalWorkouts ?? 0)} label="treinos no total" />
      </View>
    </View>
  );
}

function StatCard({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <Card className="flex-1">
      <Text className="font-display text-4xl text-accent" numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit && <Text className="font-label text-sm text-muted"> {unit}</Text>}
      </Text>
      <Label className="mt-1">{label}</Label>
    </Card>
  );
}
