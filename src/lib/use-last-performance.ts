import { and, desc, eq, ne } from 'drizzle-orm';

import { db } from '@/db';
import { sessions, setLogs } from '@/db/schema';
import { useDbQuery } from '@/lib/use-db-query';

type LastPerformanceSet = { numeroSerie: number; reps: number; carga: number };

/** Séries do último treino concluído em que esse exercício apareceu (exclui a
 * sessão atual, já que ela ainda não está concluída ao ser exibida). */
export function useLastPerformance(
  exerciseId: number,
  excludeSessionId: number
): LastPerformanceSet[] | undefined {
  return useDbQuery(
    async () => {
      const lastSessionRows = await db
        .select({ sessionId: setLogs.sessionId })
        .from(setLogs)
        .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
        .where(
          and(
            eq(setLogs.exerciseId, exerciseId),
            eq(sessions.concluida, true),
            ne(sessions.id, excludeSessionId)
          )
        )
        .orderBy(desc(sessions.data), desc(setLogs.id))
        .limit(1);

      const lastSessionId = lastSessionRows[0]?.sessionId;
      if (lastSessionId === undefined) return [];

      return db
        .select({ numeroSerie: setLogs.numeroSerie, reps: setLogs.reps, carga: setLogs.carga })
        .from(setLogs)
        .where(and(eq(setLogs.exerciseId, exerciseId), eq(setLogs.sessionId, lastSessionId)))
        .orderBy(setLogs.numeroSerie);
    },
    ['set_logs', 'sessions'],
    [exerciseId, excludeSessionId]
  );
}

/** [{reps:12,carga:55}, {reps:12,carga:55}] -> "3x12 · 55kg"; séries
 * variadas -> "55kg×12 / 50kg×10". */
export function formatLastPerformance(sets: LastPerformanceSet[]): string | null {
  if (sets.length === 0) return null;

  const [first, ...rest] = sets;
  const uniform = rest.every((s) => s.reps === first.reps && s.carga === first.carga);

  if (uniform) {
    return `${sets.length}x${first.reps} · ${first.carga}kg`;
  }

  return sets.map((s) => `${s.carga}kg×${s.reps}`).join(' / ');
}
