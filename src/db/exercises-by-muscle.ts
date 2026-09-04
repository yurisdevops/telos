import { eq } from 'drizzle-orm';

import { db } from './index';
import { exercises, type Exercise } from './schema';

export type ExerciseByMuscle = {
  exercise: Exercise;
  /** true = `chave` está em `musculos` (primário); false = só em
   * `musculosSecundarios` (secundário). Nunca as duas ao mesmo tempo por
   * exercício aqui — se `chave` já é primária, nem olhamos secundário. */
  isPrimario: boolean;
};

/**
 * Exercícios (só os VISÍVEIS — vitrine, `visivel=true`, os mesmos 148 que
 * ExerciseCatalogList mostra) que trabalham `chave` — direto (`musculos`) ou
 * indireto (`musculosSecundarios`). Mesmo padrão de leitura já usado em
 * MuscleVolumeSection/analysis.ts: busca a tabela inteira (aqui já filtrada
 * por `visivel`) e faz o `JSON.parse` + match em JS, já que `musculos`/
 * `musculosSecundarios` são texto JSON, não colunas relacionais — não dá pra
 * filtrar isso em SQL puro sem `LIKE` frágil.
 *
 * Primários primeiro, depois secundários (ordem estável dentro de cada
 * grupo, preservando a ordem em que vieram do banco) — pro mapa muscular
 * mostrar o que realmente foca aquele músculo antes do que só assiste.
 */
export async function getExercisesByMuscle(chave: string): Promise<ExerciseByMuscle[]> {
  const rows = await db.select().from(exercises).where(eq(exercises.visivel, true));

  const primarios: ExerciseByMuscle[] = [];
  const secundarios: ExerciseByMuscle[] = [];

  for (const row of rows) {
    const musculos: string[] = JSON.parse(row.musculos);
    if (musculos.includes(chave)) {
      primarios.push({ exercise: row, isPrimario: true });
      continue;
    }
    const musculosSecundarios: string[] = JSON.parse(row.musculosSecundarios);
    if (musculosSecundarios.includes(chave)) {
      secundarios.push({ exercise: row, isPrimario: false });
    }
  }

  return [...primarios, ...secundarios];
}
