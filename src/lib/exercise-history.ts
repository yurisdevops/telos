import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { exercises, exerciseSubstitutions, sessions, setLogs } from '@/db/schema';

export type ExerciseHistorySet = {
  data: string;
  numeroSerie: number;
  reps: number;
  carga: number;
  rpe: number | null;
  exerciseWgerId: number;
  exerciseNome: string;
};

export type SubstitutionMarker = {
  substitutedAt: string;
  previousExerciseWgerId: number;
  previousExerciseNome: string;
  newExerciseWgerId: number;
  newExerciseNome: string;
};

/** Anda a cadeia de substituições pra trás a partir de `wgerId` (o exercício
 * atual é sempre o último da lista) — com proteção contra ciclo acidental
 * (A→B→A): se um wgerId já visitado reaparecer, para de andar em vez de
 * travar. Em caso de mais de uma substituição apontando pro mesmo sucessor
 * (não deveria acontecer, mas é defensivo), usa a mais recente. */
async function resolveSubstitutionChain(currentWgerId: number): Promise<number[]> {
  const chain: number[] = [currentWgerId];
  const visited = new Set<number>([currentWgerId]);
  let cursor = currentWgerId;

  while (true) {
    const rows = await db
      .select()
      .from(exerciseSubstitutions)
      .where(eq(exerciseSubstitutions.newExerciseWgerId, cursor));
    if (rows.length === 0) break;

    const mostRecent = [...rows].sort((a, b) => b.substitutedAt.localeCompare(a.substitutedAt))[0];
    const previous = mostRecent.previousExerciseWgerId;
    if (visited.has(previous)) break; // ciclo detectado — nunca trava

    visited.add(previous);
    chain.unshift(previous);
    cursor = previous;
  }

  return chain;
}

async function resolveSubstitutionMarkers(
  chain: number[],
  nomeByWgerId: Map<number, string>
): Promise<SubstitutionMarker[]> {
  const markers: SubstitutionMarker[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const previousWgerId = chain[i];
    const newWgerId = chain[i + 1];
    const rows = await db
      .select()
      .from(exerciseSubstitutions)
      .where(
        and(
          eq(exerciseSubstitutions.previousExerciseWgerId, previousWgerId),
          eq(exerciseSubstitutions.newExerciseWgerId, newWgerId)
        )
      )
      .limit(1);
    if (rows[0]) {
      markers.push({
        substitutedAt: rows[0].substitutedAt,
        previousExerciseWgerId: previousWgerId,
        previousExerciseNome: nomeByWgerId.get(previousWgerId) ?? 'Exercício anterior',
        newExerciseWgerId: newWgerId,
        newExerciseNome: nomeByWgerId.get(newWgerId) ?? 'Exercício',
      });
    }
  }
  return markers;
}

/** Histórico combinado de um exercício, incluindo o(s) exercício(s) que ele
 * substituiu (se houver) — cada série carrega o wgerId/nome de origem, então
 * a tabela/gráfico nunca dá a impressão de que sempre foi o mesmo exercício.
 * Ordenado do mais recente pro mais antigo. */
export async function fetchCombinedExerciseHistory(currentExerciseId: number): Promise<{
  sets: ExerciseHistorySet[];
  markers: SubstitutionMarker[];
}> {
  const currentRows = await db
    .select({ wgerId: exercises.wgerId })
    .from(exercises)
    .where(eq(exercises.id, currentExerciseId))
    .limit(1);
  const currentWgerId = currentRows[0]?.wgerId;
  if (currentWgerId === undefined) return { sets: [], markers: [] };

  const chain = await resolveSubstitutionChain(currentWgerId);

  const allExercises = await db.select({ id: exercises.id, wgerId: exercises.wgerId, nome: exercises.nome }).from(exercises);
  const byWgerId = new Map(allExercises.map((e) => [e.wgerId, e]));
  const nomeByWgerId = new Map(allExercises.map((e) => [e.wgerId, e.nome]));

  const sets: ExerciseHistorySet[] = [];
  for (const wgerId of chain) {
    const exercise = byWgerId.get(wgerId);
    if (!exercise) continue; // exercício não existe mais no catálogo local — pula, não quebra

    const rows = await db
      .select({
        data: sessions.data,
        numeroSerie: setLogs.numeroSerie,
        reps: setLogs.reps,
        carga: setLogs.carga,
        rpe: setLogs.rpe,
      })
      .from(setLogs)
      .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
      .where(and(eq(setLogs.exerciseId, exercise.id), eq(sessions.concluida, true)));

    for (const row of rows) {
      sets.push({ ...row, exerciseWgerId: wgerId, exerciseNome: exercise.nome });
    }
  }

  sets.sort((a, b) => b.data.localeCompare(a.data) || b.numeroSerie - a.numeroSerie);

  const markers = await resolveSubstitutionMarkers(chain, nomeByWgerId);

  return { sets, markers };
}

/** Marca que `newExerciseWgerId` substitui `previousExerciseWgerId` a partir
 * de `substitutedAt` (data ISO local). */
export async function markExerciseSubstitution(
  previousExerciseWgerId: number,
  newExerciseWgerId: number,
  substitutedAt: string
): Promise<void> {
  await db.insert(exerciseSubstitutions).values({ previousExerciseWgerId, newExerciseWgerId, substitutedAt });
}
