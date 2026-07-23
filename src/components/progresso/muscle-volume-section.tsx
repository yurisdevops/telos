import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { and, eq, gte, sql } from 'drizzle-orm';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { db } from '@/db';
import { exercises, sessions, setLogs } from '@/db/schema';
import { toLocalIsoDate } from '@/lib/date';
import { formatNumberPtBr, formatVolumeKg } from '@/lib/format';
import { useDbQuery } from '@/lib/use-db-query';

const RECENT_DAYS_WINDOW = 56; // ~8 weeks
const MUSCLE_LABEL_COLUMN_WIDTH = 108;
const VOLUME_LEGEND = 'Volume = repetições × carga';

export function MuscleVolumeSection() {
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
