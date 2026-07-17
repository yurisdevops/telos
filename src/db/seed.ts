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
};

const CHUNK_SIZE = 100;

export async function seedDatabase() {
  const existing = await db.select({ id: exercises.id }).from(exercises).limit(1);
  if (existing.length > 0) {
    return;
  }

  const rows = (seedData as SeedExercise[]).map((item) => ({
    wgerId: item.wgerId,
    nome: item.nome,
    nomeEn: item.nome_en,
    categoria: item.categoria,
    equipamento: JSON.stringify(item.equipamento),
    musculos: JSON.stringify(item.musculos),
    musculosSecundarios: JSON.stringify(item.musculos_secundarios),
    descricao: item.descricao,
  }));

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    await db.insert(exercises).values(chunk);
  }
}
