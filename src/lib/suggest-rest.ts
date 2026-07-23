import { classifyMovementPattern, type MovementPattern } from './movement-pattern';

// Compostos pesados de perna/quadril pedem mais descanso entre séries;
// isolados pedem menos. Ponto de partida — sempre editável na hora (+30/-30).
const REST_SECONDS_BY_PATTERN: Record<MovementPattern, number> = {
  agachar: 150,
  dobradica_quadril: 150,
  empurrar_horizontal: 120,
  empurrar_vertical: 120,
  puxar_horizontal: 120,
  puxar_vertical: 120,
  isolado: 60,
};

const DEFAULT_REST_SECONDS_FALLBACK = 90; // categoria Cardio ou não classificável

export function suggestRestSeconds(exercise: { nome: string; categoria: string }): number {
  const pattern = classifyMovementPattern(exercise);
  if (pattern === null) return DEFAULT_REST_SECONDS_FALLBACK;
  return REST_SECONDS_BY_PATTERN[pattern];
}
