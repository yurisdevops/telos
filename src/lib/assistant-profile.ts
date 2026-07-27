/**
 * Perfil coletado pelo assistente de montagem de plano (questionário em
 * plano/assistente.tsx). Valores em formato de código, não os rótulos de
 * exibição — a etapa de geração automática (ainda não implementada) consome
 * este objeto.
 */
export type AssistantGoal = 'hipertrofia' | 'emagrecimento' | 'forca' | 'condicionamento';
export type AssistantExperience = 'iniciante' | 'intermediario' | 'avancado';

export type AssistantProfile = {
  alturaCm: number | null;
  pesoKg: number | null;
  objetivo: AssistantGoal;
  frequencia: number;
  experiencia: AssistantExperience;
};

export const GOAL_OPTIONS: { value: AssistantGoal; label: string }[] = [
  { value: 'hipertrofia', label: 'Hipertrofia' },
  { value: 'emagrecimento', label: 'Emagrecimento' },
  { value: 'forca', label: 'Força' },
  { value: 'condicionamento', label: 'Condicionamento geral' },
];

export const FREQUENCY_OPTIONS = [2, 3, 4, 5, 6] as const;

export const EXPERIENCE_OPTIONS: { value: AssistantExperience; label: string }[] = [
  { value: 'iniciante', label: 'Iniciante' },
  { value: 'intermediario', label: 'Intermediário' },
  { value: 'avancado', label: 'Avançado' },
];

/** Converte texto de input numérico opcional em número válido, ou `null` —
 * nunca guarda NaN nem string vazia no perfil. */
export function parseOptionalNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}
