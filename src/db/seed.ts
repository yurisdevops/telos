import { eq } from 'drizzle-orm';

import seedData from '@/assets/data/seed_final.json';

import { db } from './index';
import { exercises } from './schema';

type SeedExercise = {
  wgerId: number;
  nome: string;
  nome_en: string;
  categoria: string;
  equipamento: string[];
  musculos: string[];
  musculos_secundarios: string[];
  descricao: string | null;
  dica: string | null;
};

const CHUNK_SIZE = 100;

function toRow(item: SeedExercise) {
  return {
    wgerId: item.wgerId,
    nome: item.nome,
    nomeEn: item.nome_en,
    categoria: item.categoria,
    equipamento: JSON.stringify(item.equipamento),
    musculos: JSON.stringify(item.musculos),
    musculosSecundarios: JSON.stringify(item.musculos_secundarios),
    descricao: item.descricao,
    dica: item.dica,
  };
}

export async function seedDatabase() {
  const existing = await db
    .select({ id: exercises.id, wgerId: exercises.wgerId, dica: exercises.dica })
    .from(exercises);

  if (existing.length === 0) {
    const rows = (seedData as SeedExercise[]).map(toRow);
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      await db.insert(exercises).values(chunk);
    }
    return;
  }

  const needsReseed = existing.some((row) => row.dica === null);
  if (!needsReseed) {
    return;
  }

  // Update in place, matched by wgerId — never delete+reinsert here, since
  // exercises.id is referenced by workoutDayExercises.exerciseId. Reinserting
  // would hand out new ids and silently corrupt any workout plan the user
  // already built.
  const idByWgerId = new Map(existing.map((row) => [row.wgerId, row.id]));

  for (const item of seedData as SeedExercise[]) {
    const id = idByWgerId.get(item.wgerId);
    if (id === undefined) continue;

    const row = toRow(item);
    await db
      .update(exercises)
      .set({
        nome: row.nome,
        nomeEn: row.nomeEn,
        categoria: row.categoria,
        equipamento: row.equipamento,
        musculos: row.musculos,
        musculosSecundarios: row.musculosSecundarios,
        descricao: row.descricao,
        dica: row.dica,
      })
      .where(eq(exercises.id, id));
  }
}
