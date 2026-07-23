export type MovementPattern =
  | 'empurrar_horizontal'
  | 'empurrar_vertical'
  | 'puxar_horizontal'
  | 'puxar_vertical'
  | 'agachar'
  | 'dobradica_quadril'
  | 'isolado';

export const MOVEMENT_PATTERN_ORDER: MovementPattern[] = [
  'empurrar_horizontal',
  'empurrar_vertical',
  'puxar_horizontal',
  'puxar_vertical',
  'agachar',
  'dobradica_quadril',
  'isolado',
];

export const MOVEMENT_PATTERN_LABELS: Record<MovementPattern, string> = {
  empurrar_horizontal: 'Empurrar horizontal',
  empurrar_vertical: 'Empurrar vertical',
  puxar_horizontal: 'Puxar horizontal',
  puxar_vertical: 'Puxar vertical',
  agachar: 'Agachar',
  dobradica_quadril: 'Dobradiça de quadril',
  isolado: 'Isolado',
};

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

type ClassifiableExercise = { nome: string; categoria: string };

/**
 * Classificação determinística por palavra-chave no nome (com a categoria só
 * como corte inicial para Cardio) — sem IA, sem serviço externo, sem coluna
 * nova no catálogo (computada on-the-fly a partir de campos que já existem).
 *
 * Corrigida contra os 839 exercícios reais do catálogo atual (Onda 4):
 * "panturrilha"/isolamentos de joelho são checados ANTES das palavras de
 * agachamento, pra "panturrilha no leg press" não ser confundido com um
 * agachamento; "swing" entra em dobradiça de quadril (kettlebell swing);
 * "fundos"/"mergulho"/"dip" entram em empurrar horizontal.
 */
export function classifyMovementPattern(exercise: ClassifiableExercise): MovementPattern | null {
  if (exercise.categoria === 'Cardio') return null;

  const nome = normalize(exercise.nome);

  // Isolamentos que compartilham máquina/palavra com padrões compostos —
  // checados primeiro pra não serem capturados por engano (ex: "panturrilha
  // no leg press" não é um agachamento).
  if (includesAny(nome, ['panturrilha', 'gemeos', 'gastrocnemio'])) return 'isolado';
  if (includesAny(nome, ['cadeira extensora', 'cadeira flexora', 'mesa flexora'])) return 'isolado';

  if (
    includesAny(nome, [
      'levantamento terra',
      'terra romeno',
      'stiff',
      'good morning',
      'bom dia',
      'elevacao pelvica',
      'hip thrust',
      'ponte de gluteo',
      'swing',
    ])
  ) {
    return 'dobradica_quadril';
  }

  if (includesAny(nome, ['agachamento', 'afundo', 'leg press', 'hack', 'avanco', 'bulgaro'])) {
    return 'agachar';
  }

  if (includesAny(nome, ['puxada', 'barra fixa', 'pull up', 'pull-up', 'pulldown'])) {
    return 'puxar_vertical';
  }

  if (includesAny(nome, ['remada'])) {
    return 'puxar_horizontal';
  }

  if (includesAny(nome, ['desenvolvimento', 'elevacao militar', 'arnold'])) {
    return 'empurrar_vertical';
  }

  if (
    includesAny(nome, [
      'supino',
      'flexao de braco',
      'flexao declinada',
      'flexao inclinada',
      'flexao diamante',
      'flexao pike',
      'flexao burpee',
      'fundos',
      'mergulho',
      'dip',
    ])
  ) {
    return 'empurrar_horizontal';
  }

  return 'isolado';
}
