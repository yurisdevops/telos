import { formatLastPerformance } from './use-last-performance';

// Menor incremento praticável por tipo de equipamento — heurística, não
// exata pra qualquer academia específica. Equipamentos fora desta tabela
// (peso corporal, elástico, TRX, colchonete, etc.) não recebem sugestão,
// já que "carga" não se aplica da mesma forma.
const EQUIPMENT_INCREMENTS: Record<string, number> = {
  Barra: 2.5,
  'Barra W': 2.5,
  'Barra hexagonal': 2.5,
  Halteres: 2,
  Máquina: 5,
  'Máquina Smith': 5,
  Polia: 5,
  Kettlebell: 4,
};

export function getLoadIncrement(equipamento: string[]): number | null {
  for (const item of equipamento) {
    if (item in EQUIPMENT_INCREMENTS) return EQUIPMENT_INCREMENTS[item];
  }
  return null;
}

export type LoadSuggestion = {
  cargaSugerida: number;
  subiu: boolean;
  motivo: string;
};

type SetPerformance = { numeroSerie: number; reps: number; carga: number };

/** Progressão dupla simples: se todas as séries da última vez bateram ou
 * superaram o alvo de reps, sugere o menor incremento praticável pra esse
 * equipamento; senão sugere manter a carga. Nunca preenche nada sozinho —
 * é só informativo, o usuário decide. */
export function suggestNextLoad(
  lastSets: SetPerformance[],
  repsAlvo: number,
  equipamento: string[]
): LoadSuggestion | null {
  if (lastSets.length === 0) return null;

  const increment = getLoadIncrement(equipamento);
  if (increment === null) return null;

  const maxCarga = Math.max(...lastSets.map((s) => s.carga));
  const allMetTarget = lastSets.every((s) => s.reps >= repsAlvo);
  const formatted = formatLastPerformance(lastSets);
  const motivo = formatted ? `você fez ${formatted}` : '';

  if (allMetTarget) {
    return { cargaSugerida: Math.round((maxCarga + increment) * 100) / 100, subiu: true, motivo };
  }
  return { cargaSugerida: maxCarga, subiu: false, motivo };
}
