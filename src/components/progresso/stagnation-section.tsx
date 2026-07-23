import { Text, View } from 'react-native';
import { eq, sql } from 'drizzle-orm';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { db } from '@/db';
import { exercises, sessions, setLogs } from '@/db/schema';
import { daysBetween, getTodayDateString } from '@/lib/date';
import { useDbQuery } from '@/lib/use-db-query';

// Só sinaliza exercício que continua sendo treinado (não "abandonei esse
// exercício") e cuja carga máxima não sobe há pelo menos esse tanto de dias.
const STILL_ACTIVE_WITHIN_DAYS = 21;
const STAGNANT_AFTER_DAYS = 28;

type StagnationRow = { exerciseId: number; nome: string; weeksStagnant: number; currentMax: number };

async function computeStagnation(): Promise<StagnationRow[]> {
  const rows = await db
    .select({
      exerciseId: setLogs.exerciseId,
      nome: exercises.nome,
      data: sessions.data,
      maxCarga: sql<number>`max(${setLogs.carga})`,
    })
    .from(setLogs)
    .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
    .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
    .where(eq(sessions.concluida, true))
    .groupBy(setLogs.exerciseId, sessions.data);

  const byExercise = new Map<number, { nome: string; points: { data: string; maxCarga: number }[] }>();
  for (const row of rows) {
    if (row.maxCarga == null) continue;
    const entry = byExercise.get(row.exerciseId) ?? { nome: row.nome, points: [] };
    entry.points.push({ data: row.data, maxCarga: row.maxCarga });
    byExercise.set(row.exerciseId, entry);
  }

  const today = getTodayDateString();
  const results: StagnationRow[] = [];

  for (const [exerciseId, entry] of byExercise) {
    const points = [...entry.points].sort((a, b) => a.data.localeCompare(b.data));
    let runningMax = -Infinity;
    let lastIncreaseDate = points[0].data;
    for (const point of points) {
      if (point.maxCarga > runningMax) {
        runningMax = point.maxCarga;
        lastIncreaseDate = point.data;
      }
    }

    const lastTrainedDate = points[points.length - 1].data;
    const daysSinceLastTrained = daysBetween(lastTrainedDate, today);
    const daysSinceIncrease = daysBetween(lastIncreaseDate, today);

    if (daysSinceLastTrained <= STILL_ACTIVE_WITHIN_DAYS && daysSinceIncrease >= STAGNANT_AFTER_DAYS) {
      results.push({
        exerciseId,
        nome: entry.nome,
        weeksStagnant: Math.floor(daysSinceIncrease / 7),
        currentMax: runningMax,
      });
    }
  }

  results.sort((a, b) => b.weeksStagnant - a.weeksStagnant);
  return results;
}

function useStagnantExercises() {
  return useDbQuery(computeStagnation, ['set_logs', 'sessions'], []);
}

/** Sinaliza, sem julgamento nem prescrição, exercícios cuja carga máxima não
 * sobe há 4+ semanas — só o dado, a decisão é do usuário. */
export function StagnationSection() {
  const rows = useStagnantExercises();

  return (
    <Card className="mb-6">
      <Text className="mb-1 font-card-title text-lg text-text">Estagnação de carga</Text>
      <Label className="mb-4">Carga máxima sem subir há 4 semanas ou mais, em exercícios ainda em treino</Label>

      {rows === undefined ? null : rows.length === 0 ? (
        <Text className="py-8 text-center font-body text-muted">Nenhum exercício estagnado no momento.</Text>
      ) : (
        rows.map((row, index) => (
          <View
            key={row.exerciseId}
            className={`flex-row items-center justify-between ${
              index < rows.length - 1 ? 'mb-3 border-b border-border pb-3' : ''
            }`}>
            <View className="flex-1 pr-3">
              <Text className="font-body-medium text-base text-text" numberOfLines={1}>
                {row.nome}
              </Text>
              <Label className="mt-1">{`Máximo atual: ${row.currentMax}kg`}</Label>
            </View>
            <View className="items-end">
              <Text className="font-display text-2xl text-warning">{row.weeksStagnant}</Text>
              <Label>{row.weeksStagnant === 1 ? 'semana parado' : 'semanas parado'}</Label>
            </View>
          </View>
        ))
      )}
    </Card>
  );
}
