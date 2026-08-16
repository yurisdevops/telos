import type { Sexo } from '@/db/user-profile';

/**
 * Silhueta 2D paramétrica — v2 (Fase 2 do boneco). Gera o `d` de um único
 * `<Path>` de corpo (react-native-svg) + os parâmetros de um `<Circle>` de
 * cabeça separado, a partir de sexo + altura + 3 medidas (ombro/cintura/
 * quadril). Sem imagem fixa: tudo geometria calculada; recalcula a cada
 * render conforme as medidas mudam.
 *
 * TUDO NESTE ARQUIVO É PONTO DE PARTIDA PRA AJUSTE VISUAL — as constantes
 * (Y_FRACTIONS, BASE_PROPORTIONS, PROPORTION_RANGES, WIDTH_PX_RANGES,
 * LEG_GAP_HALF, HEAD_*) são primeiro palpite, não medida antropométrica
 * exata. Mexa nelas livremente ao ver o resultado na tela; a ESTRUTURA
 * (âncoras → pontos → curva suave) é o que deve sobreviver às rodadas de
 * ajuste.
 */

export const VIEWBOX_WIDTH = 240;
export const VIEWBOX_HEIGHT = 480;
const CENTER_X = VIEWBOX_WIDTH / 2;

// Posição vertical de cada âncora, como fração da altura do viewBox (0 =
// topo, 1 = base) — não em cm/px direto, pra o boneco inteiro escalar junto
// se VIEWBOX_HEIGHT mudar. Ordem = ordem de desenho, topo → base.
const Y_FRACTIONS = {
  neck: 0.13,
  shoulder: 0.17,
  elbow: 0.34, // âncora de apoio pro braço — FIXA, não lê nenhuma medida (braços destacados = rodada futura)
  waist: 0.4,
  hip: 0.48,
  crotch: 0.53, // onde o "vão" entre as pernas começa (v2 — ver AJUSTE 3)
  knee: 0.72, // âncora de apoio pra perna — FIXA, não lê nenhuma medida
  ankle: 0.9,
  foot: 0.97,
} as const;

// Cabeça — v2: círculo SEPARADO do path do corpo (ver AJUSTE 2). Curvas Q
// convergindo num ponto quase-zero de largura (a abordagem da v1) produzem
// um bico/cone, não uma cúpula redonda — um Circle de verdade é a forma mais
// simples de garantir "redonda" sem ter que calcular arco dentro do `d`.
// Y do centro um pouco acima do pescoço, com raio grande o bastante pra
// sobrepor o pescoço por baixo (sem costura visível entre cabeça e corpo).
const HEAD_CENTER_Y_FRAC = 0.08;
const HEAD_RADIUS = 27;

export function getHeadCircle(): { cx: number; cy: number; r: number } {
  return { cx: CENTER_X, cy: HEAD_CENTER_Y_FRAC * VIEWBOX_HEIGHT, r: HEAD_RADIUS };
}

// Metade do vão entre as pernas (px, na altura da virilha) — v2 (ver AJUSTE
// 3). Não é por sexo; é só "quão separadas as pernas ficam desenhadas".
const LEG_GAP_HALF = 7;

/**
 * Meias-larguras (px, no espaço do viewBox) que NÃO reagem a medida nenhuma
 * (pescoço/braço/coxa/tornozelo/pé) + os valores BASE das 3 âncoras
 * reativas (ombro/cintura/quadril) usados quando falta dado — é AQUI que a
 * diferença de silhueta masc/fem mora: mesmo sem nenhuma medida registrada,
 * os dois sexos já saem com proporções diferentes (fem: quadril > ombro,
 * cintura bem marcada; masc: ombro > quadril, cintura menos marcada). As
 * medidas do usuário, quando existem, DESVIAM a partir daqui — nunca
 * substituem a silhueta inteira, então nunca "quebra" por falta de dado
 * parcial. (Confirmado por teste: a seleção BASE_PROPORTIONS[sexo] em si
 * sempre foi correta — o bug do sexo trocado era na calibração de
 * `ombrosCm` abaixo, não aqui.)
 */
type BodyProportions = {
  pescocoHalfWidth: number;
  ombroHalfWidth: number; // fallback de ombrosCm
  bracoHalfWidth: number; // fixo — futuro: reagir a bracoEsq/DirCm
  cinturaHalfWidth: number; // fallback de cinturaCm
  quadrilHalfWidth: number; // fallback de quadrilCm
  coxaHalfWidth: number; // fixo (borda externa, altura do joelho) — futuro: reagir a coxaEsq/DirCm
  tornozeloHalfWidth: number; // fixo (borda externa, altura do tornozelo) — futuro: reagir a panturrilhaEsq/DirCm
  peHalfWidth: number; // fixo (ponta externa do pé)
};

export const BASE_PROPORTIONS: Record<Sexo, BodyProportions> = {
  masculino: {
    pescocoHalfWidth: 13,
    ombroHalfWidth: 58, // largo — V-taper
    bracoHalfWidth: 30,
    cinturaHalfWidth: 40, // cintura menos marcada (mais perto do ombro)
    quadrilHalfWidth: 44, // menor que o ombro
    coxaHalfWidth: 26,
    tornozeloHalfWidth: 15,
    peHalfWidth: 22,
  },
  feminino: {
    pescocoHalfWidth: 11,
    ombroHalfWidth: 44, // mais estreito
    bracoHalfWidth: 24,
    cinturaHalfWidth: 34, // cintura bem marcada
    quadrilHalfWidth: 52, // maior que o ombro — ampulheta
    coxaHalfWidth: 24,
    tornozeloHalfWidth: 13,
    peHalfWidth: 19,
  },
};

type ReactiveField = 'ombrosCm' | 'cinturaCm' | 'quadrilCm';

/**
 * Faixa plausível de PROPORÇÃO (medida/altura) por âncora reativa — usada só
 * pra CLAMPAR antes do lerp, protegendo contra medida absurda/erro de
 * digitação esticando o boneco pra fora de qualquer forma humana razoável.
 * Aproximação grosseira de referência, não uma fonte antropométrica exata.
 *
 * CUIDADO — causa raiz do "BUG do sexo" (v1 → v2): `peitoCm`/`cinturaCm`/
 * `quadrilCm` são inequivocamente CIRCUNFERÊNCIA (medida com fita ao redor
 * do corpo) — é como qualquer medida corporal desse tipo é tirada, e é o
 * que os ranges deles já assumiam. `ombrosCm`, na v1, tinha um range
 * calibrado pra LARGURA ombro-a-ombro (~0,20-0,32 da altura) — uma leitura
 * plausível da palavra "ombros" em português, mas INCOMPATÍVEL com o resto
 * do formulário de medidas (mesmo campo "cm", sem distinção visual entre
 * "largura" e "circunferência"). Um usuário preenchendo "ombros" como
 * largura (~45cm) e "quadril" normalmente como circunferência (~100cm+)
 * fazia ombro renderizar MENOR que quadril — ampulheta mesmo pra
 * `sexo: 'masculino'`, confirmado por simulação antes desta correção.
 * Range de `ombrosCm` abaixo agora É circunferência, mesma convenção das
 * outras 3 — e o teto de WIDTH_PX_RANGES.ombrosCm fica estruturalmente
 * acima do teto de quadrilCm (78 > 62), então mesmo os dois saturados no
 * máximo, ombro nunca fica menor que quadril.
 *
 * Isso não resolve 100% o caso em que o usuário digitou "ombros" como
 * largura mesmo depois desta correção (o NÚMERO em si já não é uma
 * circunferência, nenhuma calibração de range conserta um dado errado na
 * origem) — o resto do reparo é comunicar melhor no formulário que
 * "Ombros" é circunferência, igual aos outros 3 campos (fica como sugestão,
 * fora do escopo deste arquivo).
 */
const PROPORTION_RANGES: Record<ReactiveField, { min: number; max: number }> = {
  ombrosCm: { min: 0.44, max: 0.72 },
  cinturaCm: { min: 0.38, max: 0.6 },
  quadrilCm: { min: 0.42, max: 0.64 },
};

/**
 * Faixa de meia-largura em px (viewBox) que o lerp de cada âncora reativa
 * produz — MESMA faixa pros dois sexos; a diferença masc/fem entra pelo
 * valor BASE (fallback, ver BASE_PROPORTIONS acima), não por esta faixa.
 * `ombrosCm.max` (78) fica de propósito ACIMA de `quadrilCm.max` (62): com
 * as duas âncoras saturadas no teto (pior caso de dado real de
 * circunferência), ombro nunca fica menor que quadril.
 */
const WIDTH_PX_RANGES: Record<ReactiveField, { min: number; max: number }> = {
  ombrosCm: { min: 40, max: 78 },
  cinturaCm: { min: 28, max: 58 },
  quadrilCm: { min: 32, max: 62 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(t: number, min: number, max: number): number {
  return min + (max - min) * t;
}

/**
 * Normalização cm → px de UMA âncora reativa: proporção = medida/altura
 * (não cm direto — pessoa alta e pessoa baixa com a mesma cintura em cm
 * devem parecer diferentes, e é a proporção que captura isso), clampada na
 * faixa plausível, depois interpolada linearmente pra faixa de px. Sem
 * altura OU sem a medida específica → devolve `fallback` (o valor base do
 * sexo) sem calcular nada — nunca quebra, nunca deforma às cegas.
 */
function reactiveHalfWidth(
  field: ReactiveField,
  medidaCm: number | null,
  alturaCm: number | null,
  fallback: number
): number {
  if (medidaCm == null || alturaCm == null || alturaCm <= 0) return fallback;

  const proporcao = medidaCm / alturaCm;
  const range = PROPORTION_RANGES[field];
  const clamped = clamp(proporcao, range.min, range.max);
  const t = (clamped - range.min) / (range.max - range.min);

  const px = WIDTH_PX_RANGES[field];
  return lerp(t, px.min, px.max);
}

type Point = { x: number; y: number };

export type BuildBodyPathParams = {
  sexo: Sexo;
  alturaCm: number | null;
  ombrosCm: number | null;
  cinturaCm: number | null;
  quadrilCm: number | null;
};

/**
 * Monta a lista de pontos do CORPO (sem cabeça — ela é o `<Circle>`
 * separado, ver getHeadCircle) na ordem de desenho: tronco descendo pelo
 * lado esquerdo (pescoço → ombro → braço → cintura → quadril) → perna
 * esquerda descendo pela borda EXTERNA (coxa → tornozelo → pé) → atravessa
 * a ponta do pé → perna esquerda subindo pela borda INTERNA até a virilha
 * → um ponto de VIRILHA central (fecha o "vão" de cada perna) → perna
 * direita descendo pela borda interna → atravessa o pé → perna direita
 * subindo pela borda externa → tronco subindo pelo lado direito de volta
 * ao pescoço. Um contorno só, mas agora com um desvio (o vão) na altura das
 * pernas em vez de uma coluna única afinando num ponto (AJUSTE 3 — antes
 * disso, as duas pernas eram uma forma só, tipo "cauda de sereia").
 */
function buildBodyPoints(params: BuildBodyPathParams): Point[] {
  const base = BASE_PROPORTIONS[params.sexo];

  const ombroHW = reactiveHalfWidth('ombrosCm', params.ombrosCm, params.alturaCm, base.ombroHalfWidth);
  const cinturaHW = reactiveHalfWidth('cinturaCm', params.cinturaCm, params.alturaCm, base.cinturaHalfWidth);
  const quadrilHW = reactiveHalfWidth('quadrilCm', params.quadrilCm, params.alturaCm, base.quadrilHalfWidth);

  const y = (frac: number) => frac * VIEWBOX_HEIGHT;

  const torsoLeftDown: Point[] = [
    { x: CENTER_X - base.pescocoHalfWidth, y: y(Y_FRACTIONS.neck) },
    { x: CENTER_X - ombroHW, y: y(Y_FRACTIONS.shoulder) },
    { x: CENTER_X - base.bracoHalfWidth, y: y(Y_FRACTIONS.elbow) },
    { x: CENTER_X - cinturaHW, y: y(Y_FRACTIONS.waist) },
    { x: CENTER_X - quadrilHW, y: y(Y_FRACTIONS.hip) },
  ];

  const legLeftOuterDown: Point[] = [
    { x: CENTER_X - base.coxaHalfWidth, y: y(Y_FRACTIONS.knee) },
    { x: CENTER_X - base.tornozeloHalfWidth, y: y(Y_FRACTIONS.ankle) },
    { x: CENTER_X - base.peHalfWidth, y: y(Y_FRACTIONS.foot) }, // ponta externa do pé esquerdo
  ];
  const legLeftInnerUp: Point[] = [
    { x: CENTER_X - LEG_GAP_HALF, y: y(Y_FRACTIONS.foot) }, // ponta interna do pé (dá largura ao pé)
    { x: CENTER_X - LEG_GAP_HALF, y: y(Y_FRACTIONS.ankle) },
    { x: CENTER_X - LEG_GAP_HALF, y: y(Y_FRACTIONS.knee) },
  ];

  const crotch: Point = { x: CENTER_X, y: y(Y_FRACTIONS.crotch) };

  const legRightInnerDown: Point[] = [
    { x: CENTER_X + LEG_GAP_HALF, y: y(Y_FRACTIONS.knee) },
    { x: CENTER_X + LEG_GAP_HALF, y: y(Y_FRACTIONS.ankle) },
    { x: CENTER_X + LEG_GAP_HALF, y: y(Y_FRACTIONS.foot) },
  ];
  const legRightOuterUp: Point[] = [
    { x: CENTER_X + base.peHalfWidth, y: y(Y_FRACTIONS.foot) }, // ponta externa do pé direito
    { x: CENTER_X + base.tornozeloHalfWidth, y: y(Y_FRACTIONS.ankle) },
    { x: CENTER_X + base.coxaHalfWidth, y: y(Y_FRACTIONS.knee) },
  ];

  const torsoRightUp: Point[] = [
    { x: CENTER_X + quadrilHW, y: y(Y_FRACTIONS.hip) },
    { x: CENTER_X + cinturaHW, y: y(Y_FRACTIONS.waist) },
    { x: CENTER_X + base.bracoHalfWidth, y: y(Y_FRACTIONS.elbow) },
    { x: CENTER_X + ombroHW, y: y(Y_FRACTIONS.shoulder) },
    { x: CENTER_X + base.pescocoHalfWidth, y: y(Y_FRACTIONS.neck) },
  ];

  return [
    ...torsoLeftDown,
    ...legLeftOuterDown,
    ...legLeftInnerUp,
    crotch,
    ...legRightInnerDown,
    ...legRightOuterUp,
    ...torsoRightUp,
  ];
}

/**
 * Constrói um `d` de path fechado e suave a partir de uma lista ordenada de
 * pontos, usando curvas quadráticas (`Q`) — nunca `L` (linha reta) entre
 * âncoras, que daria um contorno anguloso/poligonal. Técnica padrão de
 * "path suavizado": cada segmento usa o próprio ponto da âncora como ponto
 * de controle e termina no PONTO MÉDIO até a âncora seguinte — o traço passa
 * perto de cada âncora, nunca exatamente em cima dela, o que já arredonda os
 * cantos sem precisar calcular tangentes/splines de verdade (fora de escopo
 * pra uma versão "tosca"). O último segmento é a exceção: termina exatamente
 * no último ponto (não num meio-termo), pra fechar o contorno no lugar
 * certo. `Z` fecha de volta pro primeiro ponto — como o primeiro e o último
 * ponto da lista (ver buildBodyPathD) são pescoço-esquerdo e
 * pescoço-direito, próximos um do outro, esse fechamento final fica coberto
 * pelo `<Circle>` da cabeça sobreposto por cima (ver getHeadCircle).
 */
function smoothClosedPathD(points: Point[]): string {
  if (points.length < 3) return '';

  const fmt = (n: number) => n.toFixed(1);
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)} `;

  for (let i = 1; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    d += `Q ${fmt(curr.x)} ${fmt(curr.y)}, ${fmt(midX)} ${fmt(midY)} `;
  }

  const secondLast = points[points.length - 2];
  const last = points[points.length - 1];
  d += `Q ${fmt(secondLast.x)} ${fmt(secondLast.y)}, ${fmt(last.x)} ${fmt(last.y)} `;

  return d + 'Z';
}

/**
 * Função principal — sexo + altura + 3 medidas → `d` de um `<Path>` fechado
 * representando o CORPO (sem cabeça — some `<Circle>` de getHeadCircle por
 * cima, no componente). Simétrica nas medidas reativas (braço/perna/pé
 * usam o mesmo valor nos dois lados; esquerdo/direito de verdade —
 * bracoEsqCm vs bracoDirCm etc. — é refinamento futuro, não esta versão) —
 * mas agora com pernas GEOMETRICAMENTE separadas (v2), não só uma coluna
 * única simétrica.
 */
export function buildBodyPathD(params: BuildBodyPathParams): string {
  return smoothClosedPathD(buildBodyPoints(params));
}
