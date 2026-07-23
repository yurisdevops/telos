import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { and, eq, gte, sql } from 'drizzle-orm';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { db } from '@/db';
import { exercises, sessions, setLogs } from '@/db/schema';
import { toLocalIsoDate } from '@/lib/date';
import { formatVolumeKg } from '@/lib/format';
import { classifyMovementPattern, MOVEMENT_PATTERN_LABELS, MOVEMENT_PATTERN_ORDER } from '@/lib/movement-pattern';
import { useDbQuery } from '@/lib/use-db-query';

const RECENT_DAYS_WINDOW = 56; // ~8 semanas, mesma janela de MuscleVolumeSection

/** Distribuição de volume por padrão de movimento — revela desequilíbrios
 * (ex: muito empurrar, pouco puxar) que "volume por músculo" não mostra. */
export function MovementPatternSection() {
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
          nome: exercises.nome,
          categoria: exercises.categoria,
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

  const patternData = useMemo(() => {
    const byPattern = new Map<string, number>();
    for (const row of rows ?? []) {
      const pattern = classifyMovementPattern({ nome: row.nome, categoria: row.categoria });
      if (pattern === null) continue;
      byPattern.set(pattern, (byPattern.get(pattern) ?? 0) + Number(row.volume));
    }
    return MOVEMENT_PATTERN_ORDER.map((pattern) => ({
      pattern,
      label: MOVEMENT_PATTERN_LABELS[pattern],
      value: byPattern.get(pattern) ?? 0,
    })).filter((item) => item.value > 0);
  }, [rows]);

  const maxValue = Math.max(1, ...patternData.map((item) => item.value));

  return (
    <Card className="mb-6">
      <Text className="font-card-title text-lg text-text">Padrão de movimento</Text>
      <Label className="mb-4">Volume = repetições × carga · últimas ~8 semanas</Label>

      {patternData.length > 0 ? (
        <View>
          {patternData.map((item) => (
            <View key={item.pattern} className="mb-3 flex-row items-center gap-3">
              <Label className="text-right" numberOfLines={2} style={{ width: 108 }}>
                {item.label}
              </Label>
              <View className="h-3 flex-1 overflow-hidden rounded bg-surface">
                <View
                  className="h-full rounded bg-accent"
                  style={{ width: `${(item.value / maxValue) * 100}%` }}
                />
              </View>
              <Text className="text-right font-label text-xs text-muted" style={{ minWidth: 68 }}>
                {formatVolumeKg(item.value)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="py-8 text-center font-body text-muted">Sem registros de treino recentes.</Text>
      )}
    </Card>
  );
}
