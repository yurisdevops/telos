import type { Sexo } from '@/db/user-profile';

/**
 * Silhueta 2D paramétrica — v1 "tosca de propósito" (Fase 2 do boneco).
 * Gera o atributo `d` de um único `<Path>` (react-native-svg) a partir de
 * sexo + altura + 3 medidas (ombro/cintura/quadril). Sem imagem fixa: tudo
 * geometria calculada; recalcula a cada render conforme as medidas mudam.
 *
 * TUDO NESTE ARQUIVO É PONTO DE PARTIDA PRA AJUSTE VISUAL — as constantes
 * (Y_FRACTIONS, BASE_PROPORTIONS, PROPORTION_RANGES, WIDTH_PX_RANGES) são
 * primeiro palpite, não medida antropométrica exata. Mexa nelas livremente
 * ao ver o resultado na tela; a ESTRUTURA (âncoras → pontos → curva suave)
 * é o que deve sobreviver às rodadas de ajuste.
 */

export const VIEWBOX_WIDTH = 240;
export const VIEWBOX_HEIGHT = 480;
const CENTER_X = VIEWBOX_WIDTH / 2;

// Posição vertical de cada âncora, como fração da altura do viewBox (0 =
// topo, 1 = base) — não em cm/px direto, pra o boneco inteiro escalar junto
// se VIEWBOX_HEIGHT mudar. Ordem = ordem de desenho, topo → base.
const Y_FRACTIONS = {
  headTop: 0.02, // quase um ponto — é o que arredonda o topo da cabeça
  headWide: 0.075,
  neck: 0.13,
  shoulder: 0.17,
  elbow: 0.34, // âncora de apoio pro braço — FIXA na v1, não lê nenhuma medida
  waist: 0.4,
  hip: 0.48,
  knee: 0.72, // âncora de apoio pra perna — FIXA na v1, não lê nenhuma medida
  ankle: 0.92,
  foot: 0.97,
} as const;

/**
 * Meias-larguras (px, no espaço do viewBox) que NÃO reagem a medida nenhuma
 * na v1 (cabeça/pescoço/braço/perna/tornozelo/pé) + os valores BASE das 3
 * âncoras reativas (ombro/cintura/quadril) usados quando falta dado — é
 * AQUI que a diferença de silhueta masc/fem mora: mesmo sem nenhuma medida
 * registrada, os dois sexos já saem com proporções diferentes (fem: quadril
 * > ombro, cintura bem marcada; masc: ombro > quadril, cintura menos
 * marcada). As medidas do usuário, quando existem, DESVIAM a partir daqui —
 * nunca substituem a silhueta inteira, então nunca "quebra" por falta de
 * dado parcial.
 */
type BodyProportions = {
  cabecaHalfWidth: number;
  pescocoHalfWidth: number;
  ombroHalfWidth: number; // fallback de ombrosCm
  bracoHalfWidth: number; // fixo — futuro: reagir a bracoEsq/DirCm
  cinturaHalfWidth: number; // fallback de cinturaCm
  quadrilHalfWidth: number; // fallback de quadrilCm
  pernaHalfWidth: number; // fixo — futuro: reagir a coxaEsq/DirCm
  tornozeloHalfWidth: number; // fixo — futuro: reagir a panturrilhaEsq/DirCm
  peHalfWidth: number;
};

export const BASE_PROPORTIONS: Record<Sexo, BodyProportions> = {
  masculino: {
    cabecaHalfWidth: 20,
    pescocoHalfWidth: 13,
    ombroHalfWidth: 58, // largo — V-taper
    bracoHalfWidth: 30,
    cinturaHalfWidth: 40, // cintura menos marcada (mais perto do ombro)
    quadrilHalfWidth: 44, // menor que o ombro
    pernaHalfWidth: 24,
    tornozeloHalfWidth: 15,
    peHalfWidth: 22,
  },
  feminino: {
    cabecaHalfWidth: 19,
    pescocoHalfWidth: 11,
    ombroHalfWidth: 44, // mais estreito
    bracoHalfWidth: 24,
    cinturaHalfWidth: 34, // cintura bem marcada
    quadrilHalfWidth: 52, // maior que o ombro — ampulheta
    pernaHalfWidth: 22,
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
 */
const PROPORTION_RANGES: Record<ReactiveField, { min: number; max: number }> = {
  ombrosCm: { min: 0.2, max: 0.32 },
  cinturaCm: { min: 0.38, max: 0.6 },
  quadrilCm: { min: 0.42, max: 0.64 },
};

/**
 * Faixa de meia-largura em px (viewBox) que o lerp de cada âncora reativa
 * produz — MESMA faixa pros dois sexos; a diferença masc/fem entra pelo
 * valor BASE (fallback, ver BASE_PROPORTIONS acima), não por esta faixa.
 */
const WIDTH_PX_RANGES: Record<ReactiveField, { min: number; max: number }> = {
  ombrosCm: { min: 38, max: 72 },
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

type Anchor = { yFrac: number; halfWidth: number };
type Point = { x: number; y: number };

function buildAnchors(params: BuildBodyPathParams): Anchor[] {
  const base = BASE_PROPORTIONS[params.sexo];

  const ombroHW = reactiveHalfWidth('ombrosCm', params.ombrosCm, params.alturaCm, base.ombroHalfWidth);
  const cinturaHW = reactiveHalfWidth('cinturaCm', params.cinturaCm, params.alturaCm, base.cinturaHalfWidth);
  const quadrilHW = reactiveHalfWidth('quadrilCm', params.quadrilCm, params.alturaCm, base.quadrilHalfWidth);

  return [
    { yFrac: Y_FRACTIONS.headTop, halfWidth: 2 }, // quase um ponto — arredonda o topo
    { yFrac: Y_FRACTIONS.headWide, halfWidth: base.cabecaHalfWidth },
    { yFrac: Y_FRACTIONS.neck, halfWidth: base.pescocoHalfWidth },
    { yFrac: Y_FRACTIONS.shoulder, halfWidth: ombroHW },
    { yFrac: Y_FRACTIONS.elbow, halfWidth: base.bracoHalfWidth },
    { yFrac: Y_FRACTIONS.waist, halfWidth: cinturaHW },
    { yFrac: Y_FRACTIONS.hip, halfWidth: quadrilHW },
    { yFrac: Y_FRACTIONS.knee, halfWidth: base.pernaHalfWidth },
    { yFrac: Y_FRACTIONS.ankle, halfWidth: base.tornozeloHalfWidth },
    { yFrac: Y_FRACTIONS.foot, halfWidth: base.peHalfWidth },
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
 * pra uma v1 "tosca"). O último segmento é a exceção: termina exatamente no
 * último ponto (não num meio-termo), pra fechar o contorno no lugar certo.
 * `Z` fecha de volta pro primeiro ponto — como o primeiro e o último ponto
 * da lista (ver buildBodyPathD) são os dois lados do topo da cabeça, bem
 * próximos um do outro, esse fechamento final é curto e imperceptível.
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

export type BuildBodyPathParams = {
  sexo: Sexo;
  alturaCm: number | null;
  ombrosCm: number | null;
  cinturaCm: number | null;
  quadrilCm: number | null;
};

/**
 * Função principal — sexo + altura + 3 medidas → `d` de um `<Path>` fechado
 * representando a silhueta de frente. Simétrica na v1 (braço/perna/pé usam
 * o mesmo valor nos dois lados; esquerdo/direito de verdade — bracoEsqCm vs
 * bracoDirCm etc. — é refinamento futuro, não esta versão).
 *
 * Traça as âncoras de CIMA PRA BAIXO pelo lado ESQUERDO (cabeça → pescoço →
 * ombro → braço → cintura → quadril → perna → pé), depois sobe pelo lado
 * DIREITO na ordem inversa até fechar de volta no topo da cabeça — um
 * contorno só, sem sub-formas separadas (sem lóbulo de braço destacado do
 * tronco ainda: é uma silhueta única afunilando/alargando, o V-taper
 * masculino ou a ampulheta feminina vêm do formato geral, não de membros
 * desenhados à parte — isso é o que fica pra uma rodada visual futura).
 */
export function buildBodyPathD(params: BuildBodyPathParams): string {
  const anchors = buildAnchors(params);

  const leftPoints: Point[] = anchors.map((a) => ({
    x: CENTER_X - a.halfWidth,
    y: a.yFrac * VIEWBOX_HEIGHT,
  }));
  const rightPoints: Point[] = [...anchors].reverse().map((a) => ({
    x: CENTER_X + a.halfWidth,
    y: a.yFrac * VIEWBOX_HEIGHT,
  }));

  return smoothClosedPathD([...leftPoints, ...rightPoints]);
}
