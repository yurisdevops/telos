import type { Sexo } from '@/db/user-profile';

/**
 * Silhueta 2D — v3 (Fase 2 do boneco), reconstruída do zero com rigor
 * anatômico. Multi-path: cabeça (elipse), tronco, braço esquerdo, braço
 * direito, perna esquerda, perna direita — cada um sua própria forma
 * fechada, em vez de um contorno único (era o que produzia a "cauda de
 * sereia" e a ausência de braços na v2). Facilita desenhar cada região bem
 * (um braço com axila de verdade é muito mais simples como forma própria do
 * que como um desvio dentro de um contorno gigante) e, mais adiante, deformar
 * por região sem afetar as outras.
 *
 * ESCOPO DESTA RODADA: proporções FIXAS por sexo, bem desenhadas — a reação
 * às medidas (ombro/cintura/quadril) foi desligada de propósito, religa numa
 * rodada futura se o visual for aprovado. `buildFigurePaths` já recebe só
 * `sexo` (não altura/medidas) — assinatura mais simples enquanto isso.
 *
 * TUDO AQUI É PONTO DE PARTIDA VISUAL — as coordenadas (FIGURE_POINTS) são
 * a primeira tentativa "bonita", não uma fonte antropométrica exata. Mexa
 * livremente ao ver o resultado na tela; a ESTRUTURA (waypoints → spline
 * suave → path fechado) é o que deve sobreviver aos ajustes.
 */

export const VIEWBOX_WIDTH = 240;
export const VIEWBOX_HEIGHT = 480;
const CENTER_X = VIEWBOX_WIDTH / 2;

// Proporção clássica de desenho de figura humana: corpo ≈ 7,5 "cabeças" de
// altura (cabeça no topo, virilha na metade exata, pés na base). Não usado
// como cálculo direto no código abaixo (as coordenadas finais foram ajustadas
// à mão pra ficarem visualmente equilibradas dentro do viewBox), mas é a
// régua que guiou onde cada âncora (ombro ~1,5 cabeça, cintura ~3, virilha
// ~3,75/metade, joelho ~5,5, pé ~7,5) foi posicionada — ver comentários de Y
// em FIGURE_POINTS.
const HEAD_UNIT = VIEWBOX_HEIGHT / 7.5; // 64px

type Point = { x: number; y: number };
type SidePoint = { dx: number; y: number }; // dx = offset a partir do CENTER_X (negativo = esquerda)

function toAbsolute(points: SidePoint[]): Point[] {
  return points.map((p) => ({ x: CENTER_X + p.dx, y: p.y }));
}

function mirror(points: SidePoint[]): SidePoint[] {
  return points.map((p) => ({ dx: -p.dx, y: p.y }));
}

/**
 * Catmull-Rom → Bézier cúbica: dado uma lista de pontos, gera um `d` de path
 * que passa exatamente por cada um deles com tangentes contínuas — é o que
 * dá o efeito "o corpo humano quase não tem retas" (requisito de curvas
 * generosas) sem precisar calcular ponto de controle à mão pra cada trecho.
 * Fórmula padrão (tensão uniforme 1/6): pra cada par de pontos consecutivos
 * P1→P2, os pontos de controle usam os vizinhos P0 (anterior) e P3
 * (seguinte) — `closed` faz a lista "dar a volta" (o pé de trás encosta na
 * frente), formando um contorno fechado suave o tempo todo, inclusive na
 * costura onde o último ponto reencontra o primeiro.
 */
function catmullRomPathD(points: Point[], closed: boolean): string {
  const n = points.length;
  if (n < 2) return '';

  const at = (i: number): Point => {
    if (closed) return points[((i % n) + n) % n];
    return points[Math.min(Math.max(i, 0), n - 1)];
  };
  const fmt = (v: number) => v.toFixed(1);

  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)} `;
  const segments = closed ? n : n - 1;

  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += `C ${fmt(cp1x)} ${fmt(cp1y)}, ${fmt(cp2x)} ${fmt(cp2y)}, ${fmt(p2.x)} ${fmt(p2.y)} `;
  }

  return closed ? d + 'Z' : d;
}

// Cabeça — elipse de verdade (não faz parte de nenhum path de curvas), mais
// alta que larga ("levemente mais alta que larga", não um círculo perfeito).
// `cy + ry` desce até sobrepor o topo do pescoço do tronco (ver `neckTopY`
// abaixo) por baixo, sem costura visível entre cabeça e corpo.
const HEAD_CENTER_Y = 0.55 * HEAD_UNIT;
const HEAD_RX: Record<Sexo, number> = { masculino: 19, feminino: 17 };
const HEAD_RY: Record<Sexo, number> = { masculino: 29, feminino: 27 };

export function getHeadEllipse(sexo: Sexo): { cx: number; cy: number; rx: number; ry: number } {
  return { cx: CENTER_X, cy: HEAD_CENTER_Y, rx: HEAD_RX[sexo], ry: HEAD_RY[sexo] };
}

// Âncoras verticais compartilhadas pelos dois sexos (só as LARGURAS diferem
// por sexo, ver FIGURE_POINTS) — em px, com a referência de "cabeças"
// (HEAD_UNIT) ao lado de cada uma pra facilitar comparar com a régua
// clássica ao ajustar.
const Y = {
  neckTop: 1.03 * HEAD_UNIT, // ~66px — base do queixo/topo do pescoço
  shoulder: 1.44 * HEAD_UNIT, // ~92px — topo do ombro/trapézio
  chest: 2.16 * HEAD_UNIT, // ~138px — altura da axila/peito
  waist: 3.2 * HEAD_UNIT, // ~205px
  hip: 3.98 * HEAD_UNIT, // ~255px
  crotch: 4.22 * HEAD_UNIT, // ~270px — pouco abaixo do quadril, onde as pernas separam
  elbow: 3.52 * HEAD_UNIT, // ~225px — cotovelo do braço, entre cintura e quadril
  wrist: 4.77 * HEAD_UNIT, // ~305px
  handTip: 5.28 * HEAD_UNIT, // ~338px
  thigh: 4.7 * HEAD_UNIT, // ~300px — coxa (logo abaixo da virilha)
  knee: 5.55 * HEAD_UNIT, // ~355px
  calf: 6.25 * HEAD_UNIT, // ~400px — barriga da perna (mais larga que joelho E tornozelo)
  ankle: 6.95 * HEAD_UNIT, // ~445px
  foot: 7.3 * HEAD_UNIT, // ~467px
} as const;

/**
 * Larguras (dx = offset do centro) de cada waypoint do TRONCO, um sexo por
 * vez — só o lado esquerdo (dx negativo); o direito é gerado por espelhamento
 * (`mirror`). O tronco cobre pescoço→ombro→peito→cintura→quadril e um
 * pequeno mergulho central na altura da virilha (não é a separação das
 * pernas em si — isso as PERNAS fazem, como formas próprias — é só uma
 * curva suave de transição por trás delas, pra não sobrar um degrau reto).
 */
const TORSO_SIDE: Record<Sexo, SidePoint[]> = {
  masculino: [
    { dx: -11, y: Y.neckTop },
    { dx: -39, y: Y.shoulder }, // colar/trapézio — a largura "cheia" do ombro vem do BRAÇO por cima
    { dx: -42, y: Y.chest },
    { dx: -32, y: Y.waist },
    { dx: -37, y: Y.hip },
    { dx: -12, y: Y.crotch }, // mergulho central, por trás de onde as pernas vão se separar
  ],
  feminino: [
    { dx: -9, y: Y.neckTop },
    { dx: -32, y: Y.shoulder },
    { dx: -35, y: Y.chest },
    { dx: -23, y: Y.waist }, // cintura bem marcada
    { dx: -43, y: Y.hip }, // quadril claramente mais largo que o ombro
    { dx: -13, y: Y.crotch },
  ],
};

function buildTorsoPathD(sexo: Sexo): string {
  const left = TORSO_SIDE[sexo];
  const right = [...mirror(left)].reverse();
  return catmullRomPathD(toAbsolute([...left, ...right]), true);
}

/**
 * Braço (lado esquerdo — direito é espelhado). Contorno EXTERNO descendo
 * (deltoide → bíceps → cotovelo → antebraço → punho → mão) e contorno
 * INTERNO subindo de volta (mão → punho → cotovelo → axila). O ponto de
 * "axila" é o que cria a reentrância: seu dx fica mais próximo do centro que
 * o deltoide logo acima, e mais AFASTADO do centro que a borda do tronco na
 * mesma altura (Y.chest) — é essa diferença que abre um vão visível entre
 * braço e tronco, em vez dos dois formarem um bloco só.
 */
const ARM_SIDE: Record<Sexo, SidePoint[]> = {
  masculino: [
    { dx: -38, y: Y.shoulder + 16 }, // axila (attach) — perto do colar do tronco, os dois "tocam" aqui
    { dx: -58, y: Y.shoulder + 26 }, // deltoide — o ponto mais largo do braço
    { dx: -54, y: Y.chest + 35 }, // bíceps
    { dx: -48, y: Y.elbow },
    { dx: -44, y: (Y.elbow + Y.wrist) / 2 }, // antebraço
    { dx: -40, y: Y.wrist },
    { dx: -42, y: Y.wrist + 20 }, // mão (um pouco mais larga que o punho)
    { dx: -34, y: Y.handTip }, // ponta da mão, arredondada
    { dx: -26, y: Y.wrist + 17 }, // mão, borda interna
    { dx: -30, y: Y.wrist - 3 },
    { dx: -34, y: Y.elbow - 3 }, // cotovelo, borda interna
    { dx: -46, y: Y.chest + 20 }, // o vão se abrindo de volta pra axila
  ],
  feminino: [
    { dx: -32, y: Y.shoulder + 14 },
    { dx: -46, y: Y.shoulder + 23 },
    { dx: -42, y: Y.chest + 30 },
    { dx: -37, y: Y.elbow },
    { dx: -34, y: (Y.elbow + Y.wrist) / 2 },
    { dx: -31, y: Y.wrist },
    { dx: -33, y: Y.wrist + 18 },
    { dx: -26, y: Y.handTip - 5 },
    { dx: -20, y: Y.wrist + 15 },
    { dx: -23, y: Y.wrist - 3 },
    { dx: -27, y: Y.elbow - 3 },
    { dx: -38, y: Y.chest + 15 },
  ],
};

function buildArmPathD(sexo: Sexo, side: 'esquerdo' | 'direito'): string {
  const points = side === 'esquerdo' ? ARM_SIDE[sexo] : mirror(ARM_SIDE[sexo]);
  return catmullRomPathD(toAbsolute(points), true);
}

/**
 * Perna (lado esquerdo — direito é espelhado). Desce pela borda EXTERNA
 * (coxa → joelho → panturrilha → tornozelo → pé) e sobe pela INTERNA de
 * volta até a virilha. A panturrilha (Y.calf) é mais afastada do centro que
 * o joelho E o tornozelo — é essa relação (mais larga no meio que nas duas
 * pontas) que dá a curva característica da barriga da perna, em vez de um
 * cone reto afinando sem parar.
 */
const LEG_SIDE: Record<Sexo, SidePoint[]> = {
  masculino: [
    { dx: -12, y: Y.crotch }, // virilha — ponto mais próximo do centro, onde as duas pernas quase se tocam
    { dx: -34, y: Y.hip + 4 }, // quadril/coxa, borda externa
    { dx: -33, y: Y.thigh },
    { dx: -25, y: Y.knee }, // joelho — afina
    { dx: -29, y: Y.calf }, // panturrilha — alarga nesta altura (a "barriga" da perna)
    { dx: -17, y: Y.ankle }, // tornozelo — afina de novo
    { dx: -21, y: Y.foot }, // pé, borda externa
    { dx: -13, y: Y.foot + 8 }, // ponta do pé
    { dx: -8, y: Y.ankle + 2 }, // pé/tornozelo, borda interna
    { dx: -10, y: Y.calf + 2 },
    { dx: -8, y: Y.knee + 2 },
    { dx: -9, y: Y.thigh - 2 }, // coxa, borda interna
  ],
  feminino: [
    { dx: -12, y: Y.crotch },
    { dx: -40, y: Y.hip + 4 }, // quadril mais largo (acompanha o quadril do tronco)
    { dx: -39, y: Y.thigh }, // coxa proporcionalmente mais cheia
    { dx: -24, y: Y.knee },
    { dx: -27, y: Y.calf },
    { dx: -15, y: Y.ankle },
    { dx: -18, y: Y.foot },
    { dx: -11, y: Y.foot + 7 },
    { dx: -7, y: Y.ankle + 2 },
    { dx: -9, y: Y.calf + 2 },
    { dx: -7, y: Y.knee + 2 },
    { dx: -9, y: Y.thigh - 2 },
  ],
};

function buildLegPathD(sexo: Sexo, side: 'esquerdo' | 'direito'): string {
  const points = side === 'esquerdo' ? LEG_SIDE[sexo] : mirror(LEG_SIDE[sexo]);
  return catmullRomPathD(toAbsolute(points), true);
}

export type FigurePaths = {
  torso: string;
  bracoEsquerdo: string;
  bracoDireito: string;
  pernaEsquerda: string;
  pernaDireita: string;
};

/**
 * Função principal — sexo → os `d` de todas as formas do corpo (cabeça fica
 * de fora, é `getHeadEllipse`, não um path de curvas). Fixo por enquanto
 * (sem altura/medidas — ver cabeçalho do arquivo); quem chama desenha cada
 * campo num `<Path>` próprio, todos com o mesmo fill/stroke pra a costura
 * entre as formas ficar imperceptível.
 */
export function buildFigurePaths(sexo: Sexo): FigurePaths {
  return {
    torso: buildTorsoPathD(sexo),
    bracoEsquerdo: buildArmPathD(sexo, 'esquerdo'),
    bracoDireito: buildArmPathD(sexo, 'direito'),
    pernaEsquerda: buildLegPathD(sexo, 'esquerdo'),
    pernaDireita: buildLegPathD(sexo, 'direito'),
  };
}
