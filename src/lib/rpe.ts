export type RpeCategory = 'facil' | 'dificil' | 'falha';

export const RPE_CATEGORY_VALUE: Record<RpeCategory, number> = {
  facil: 7,
  dificil: 8.5,
  falha: 10,
};

export const RPE_CATEGORY_LABEL: Record<RpeCategory, string> = {
  facil: 'Fácil',
  dificil: 'Difícil',
  falha: 'Falha',
};

export const RPE_CATEGORY_ORDER: RpeCategory[] = ['facil', 'dificil', 'falha'];

/** Valor numérico salvo -> categoria mais próxima, pra re-selecionar o chip
 * certo ao reabrir uma série já marcada. */
export function rpeValueToCategory(value: number | null): RpeCategory | null {
  if (value === null) return null;
  let closest: RpeCategory = 'facil';
  let smallestDiff = Infinity;
  for (const category of RPE_CATEGORY_ORDER) {
    const diff = Math.abs(RPE_CATEGORY_VALUE[category] - value);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closest = category;
    }
  }
  return closest;
}
