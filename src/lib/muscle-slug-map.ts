import type { Slug } from 'react-native-body-highlighter';

/**
 * Mapa PT (exercises.musculos, nosso catálogo) → slug da lib
 * react-native-body-highlighter. Strings PT conferidas direto em
 * assets/data/seed_final.json (17 músculos primários + "Oblíquos", que só
 * aparece como secundário) — não inventadas.
 *
 * Dois mapeamentos são APROXIMADOS (a lib não tem um slug exato):
 * - "Dorsais" → 'upper-back': não existe slug de "lats" na lib; upper-back é
 *   o mais próximo disponível (só aparece na vista de costas).
 * - "Glúteo médio (abdutores)": SEM correspondente — o slug 'abductors'
 *   aparece na documentação (README) da lib mas NÃO existe de verdade no
 *   `Slug` exportado nem em nenhum dado da versão 3.2.0 instalada (conferido
 *   em node_modules/react-native-body-highlighter/dist/index.d.ts) — README
 *   desatualizado da própria lib. Fica de fora do mapa, como "Corpo inteiro".
 *
 * "Corpo inteiro" (exercícios full-body, ex: burpee) também fica de fora —
 * não é uma região anatômica única, não existe slug que faça sentido.
 */
export const MUSCLE_PT_TO_SLUG: Record<string, Slug> = {
  Peito: 'chest',
  Ombros: 'deltoids',
  Bíceps: 'biceps',
  Tríceps: 'triceps',
  Antebraços: 'forearm',
  Abdômen: 'abs',
  Oblíquos: 'obliques',
  Trapézio: 'trapezius',
  Pescoço: 'neck',
  Quadríceps: 'quadriceps',
  'Posterior de coxa': 'hamstring',
  Glúteos: 'gluteal',
  Adutores: 'adductors',
  Panturrilhas: 'calves',
  Lombar: 'lower-back',
  Dorsais: 'upper-back', // aproximado — ver comentário acima
};

/** Inverso do mapa acima, pra exibir o nome PT de volta (ex: no toque num
 * músculo) — seguro porque MUSCLE_PT_TO_SLUG não tem dois PT pro mesmo slug. */
export const SLUG_TO_MUSCLE_LABEL: Partial<Record<Slug, string>> = Object.fromEntries(
  Object.entries(MUSCLE_PT_TO_SLUG).map(([pt, slug]) => [slug, pt])
);
