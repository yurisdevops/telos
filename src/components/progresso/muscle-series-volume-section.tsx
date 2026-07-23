import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { and, eq, gte, sql } from 'drizzle-orm';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { db } from '@/db';
import { exercises, sessions, setLogs } from '@/db/schema';
import { getTodayDateString, getWeekStartIso } from '@/lib/date';
import { useDbQuery } from '@/lib/use-db-query';

const REFERENCE_MIN = 10;
const REFERENCE_MAX = 20;

/** Contagem de SÉRIES (não tonelagem) por grupo muscular na semana atual —
 * a referência de volume que a literatura de hipertrofia usa (10-20
 * séries/semana por músculo), mostrada como faixa visual atrás da barra. */
export function MuscleSeriesVolumeSection() {
  const weekStartIso = useMemo(() => getWeekStartIso(getTodayDateString()), []);

  const rows = useDbQuery(
    () =>
      db
        .select({
          exerciseId: setLogs.exerciseId,
          musculos: exercises.musculos,
          sets: sql<number>`count(*)`,
        })
        .from(setLogs)
        .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
        .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
        .where(and(eq(sessions.concluida, true), gte(sessions.data, weekStartIso)))
        .groupBy(setLogs.exerciseId),
    ['set_logs', 'sessions'],
    [weekStartIso]
  );

  const muscleData = useMemo(() => {
    const byMuscle = new Map<string, number>();
    for (const row of rows ?? []) {
      const musculos: string[] = JSON.parse(row.musculos);
      for (const muscle of musculos) {
        byMuscle.set(muscle, (byMuscle.get(muscle) ?? 0) + Number(row.sets));
      }
    }
    return [...byMuscle.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  }, [rows]);

  const maxValue = Math.max(REFERENCE_MAX, ...muscleData.map((m) => m.value), 1);

  return (
    <Card className="mb-6">
      <Text className="font-card-title text-lg text-text">Séries por grupo muscular</Text>
      <Label className="mb-4">{`Semana atual · faixa de referência comum: ${REFERENCE_MIN}–${REFERENCE_MAX} séries`}</Label>

      {muscleData.length > 0 ? (
        <View>
          {muscleData.map((item) => {
            const inRange = item.value >= REFERENCE_MIN && item.value <= REFERENCE_MAX;
            return (
              <View key={item.label} className="mb-3">
                <View className="mb-1 flex-row items-center justify-between">
                  <Label>{item.label}</Label>
                  <Text className={`font-label text-xs ${inRange ? 'text-success' : 'text-muted'}`}>
                    {item.value}
                  </Text>
                </View>
                <View className="h-3 overflow-hidden rounded bg-surface">
                  <View
                    className="absolute h-full bg-border"
                    style={{
                      left: `${(REFERENCE_MIN / maxValue) * 100}%`,
                      width: `${((REFERENCE_MAX - REFERENCE_MIN) / maxValue) * 100}%`,
                    }}
                  />
                  <View
                    className={`h-full rounded ${inRange ? 'bg-success' : 'bg-accent'}`}
                    style={{ width: `${Math.min(100, (item.value / maxValue) * 100)}%` }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text className="py-8 text-center font-body text-muted">Sem séries registradas nesta semana ainda.</Text>
      )}
    </Card>
  );
}
