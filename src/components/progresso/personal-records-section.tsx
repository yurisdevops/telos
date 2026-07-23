import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { and, desc, eq, sql } from 'drizzle-orm';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { db } from '@/db';
import { bodyWeightLogs, exercises, sessions, setLogs } from '@/db/schema';
import { daysBetween, formatShortDateLabel } from '@/lib/date';
import { useDbQuery } from '@/lib/use-db-query';

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

function useBodyWeightLogs() {
  return useDbQuery(() => db.select().from(bodyWeightLogs).orderBy(bodyWeightLogs.data), ['body_weight_logs'], []);
}

/** Peso corporal mais próximo (em dias) de uma data de PR — null se não
 * houver nenhum registro de peso ainda. */
function findNearestWeightKg(weights: { data: string; pesoKg: number }[], targetDate: string): number | null {
  if (weights.length === 0) return null;
  let best = weights[0];
  let bestDiff = Math.abs(daysBetween(best.data, targetDate));
  for (const w of weights) {
    const diff = Math.abs(daysBetween(w.data, targetDate));
    if (diff < bestDiff) {
      best = w;
      bestDiff = diff;
    }
  }
  return best.pesoKg;
}

function formatRatio(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

export function PersonalRecordsSection() {
  const prs = usePersonalRecords();
  const weights = useBodyWeightLogs();

  const ratioByExercise = useMemo(() => {
    const map = new Map<number, number>();
    if (!prs || !weights || weights.length === 0) return map;
    for (const pr of prs) {
      const nearestWeight = findNearestWeightKg(weights, pr.data);
      if (nearestWeight && nearestWeight > 0) {
        map.set(pr.exerciseId, pr.carga / nearestWeight);
      }
    }
    return map;
  }, [prs, weights]);

  return (
    <Card className="mb-6">
      <Text className="mb-4 font-card-title text-lg text-text">Recordes pessoais</Text>

      {prs === undefined ? null : prs.length === 0 ? (
        <Text className="py-8 text-center font-body text-muted">Sem recordes ainda.</Text>
      ) : (
        prs.map((pr, index) => {
          const ratio = ratioByExercise.get(pr.exerciseId);
          return (
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
                {ratio !== undefined && (
                  <Label className="mt-1 text-accent">{`${formatRatio(ratio)}x seu peso`}</Label>
                )}
              </View>
              <Text className="font-display text-4xl text-accent">
                {pr.carga}
                <Text className="font-label text-sm text-muted"> kg</Text>
              </Text>
            </View>
          );
        })
      )}
    </Card>
  );
}
