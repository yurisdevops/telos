import type { Slug } from 'react-native-body-highlighter';

/**
 * De-para slug (inglês, vocabulário da lib react-native-body-highlighter) →
 * chave de músculo do catálogo (português, grafia exata de exercises.musculos/
 * musculosSecundarios no seed). Só os slugs com correspondência real entram
 * aqui — os que a lib expõe mas não são grupo muscular do catálogo (hair,
 * head, hands, feet, ankles, tibialis, knees) ficam de fora de propósito:
 * `MUSCLE_KEY_BY_SLUG[slug]` retorna `undefined` pra eles, e quem usa este
 * mapa trata isso como "ignorar o toque".
 *
 * "Glúteo médio (abdutores)" do catálogo NÃO entra aqui — o slug "abductors"
 * não existe na versão instalada da lib (3.2.0): conferido tanto no `Slug`
 * type de dist/index.d.ts quanto nos paths reais em dist/assets/bodyBack.js
 * (grep literal por `slug: "..."`), nenhum dos dois lista "abductors". O
 * único slug de glúteo que a lib tem é "gluteal", que já mapeia pra
 * "Glúteos" — então "Glúteo médio (abdutores)" fica sem região tocável no
 * mapa por enquanto (o toque em "gluteal" mostra só os exercícios de
 * "Glúteos", não os de glúteo médio). Se precisar cobrir isso no futuro,
 * seria via SVG customizado, não com esta lib.
 *
 * Validado manualmente no app (mapa-muscular.tsx) — em especial "upper-back"
 * → "Dorsais" (o slug mais próximo do grande dorsal na ilustração da lib;
 * "trapezius" já cobre o trapézio à parte).
 */
export const MUSCLE_KEY_BY_SLUG: Partial<Record<Slug, string>> = {
  abs: 'Abdômen',
  adductors: 'Adutores',
  forearm: 'Antebraços',
  biceps: 'Bíceps',
  'upper-back': 'Dorsais',
  gluteal: 'Glúteos',
  'lower-back': 'Lombar',
  obliques: 'Oblíquos',
  deltoids: 'Ombros',
  calves: 'Panturrilhas',
  chest: 'Peito',
  neck: 'Pescoço',
  hamstring: 'Posterior de coxa',
  quadriceps: 'Quadríceps',
  trapezius: 'Trapézio',
  triceps: 'Tríceps',
};
