/**
 * Fundação de cardio (Etapa A) — constantes puras, sem acesso a banco (mesmo
 * critério de módulo em `lib/` já usado por `rpe.ts`/`movement-pattern.ts`).
 * Nenhuma UI ainda consome isto — só a base de dados/tipos pra quando a
 * Etapa B construir os formulários de registro.
 */
export const MODALIDADES_CARDIO = [
  { key: 'corrida', label: 'Corrida', icon: 'walk-outline' }, // ou 'footsteps' — decidir na Etapa B
  { key: 'caminhada', label: 'Caminhada', icon: 'walk-outline' },
  { key: 'esteira', label: 'Esteira', icon: 'speedometer-outline' },
  { key: 'bike', label: 'Bike', icon: 'bicycle-outline' },
  { key: 'hiit', label: 'HIIT', icon: 'flash-outline' },
  { key: 'eliptico', label: 'Elíptico', icon: 'sync-outline' },
  { key: 'natacao', label: 'Natação', icon: 'water-outline' },
  { key: 'pular_corda', label: 'Pular corda', icon: 'infinite-outline' },
  { key: 'escada', label: 'Escada', icon: 'trending-up-outline' },
  { key: 'outro', label: 'Outro', icon: 'ellipsis-horizontal-outline' },
] as const;

export type ModalidadeCardio = (typeof MODALIDADES_CARDIO)[number]['key'];

export type IntensidadeCardio = 'leve' | 'moderado' | 'intenso';

export const INTENSIDADES_CARDIO: { key: IntensidadeCardio; label: string; cor: string }[] = [
  { key: 'leve', label: 'Leve', cor: 'success' },
  { key: 'moderado', label: 'Moderado', cor: 'warning' },
  { key: 'intenso', label: 'Intenso', cor: 'accent' },
];

/**
 * Ritmo (pace) em min/km, formatado "M:SS /km" — só faz sentido quando há
 * distância de verdade (`distanciaKm` é opcional no schema, e várias
 * modalidades nem oferecem o campo, ver MODALIDADES_COM_DISTANCIA em
 * adicionar-cardio.tsx). `null` sempre que faltar distância/duração ou
 * qualquer um dos dois for <= 0 — quem chama simplesmente não exibe nada
 * nesse caso, nunca mostra um pace inventado/dividido por zero.
 */
export function formatPace(duracaoMin: number, distanciaKm: number | null | undefined): string | null {
  if (!distanciaKm || distanciaKm <= 0 || !duracaoMin || duracaoMin <= 0) return null;

  const paceMinPorKm = duracaoMin / distanciaKm;
  let minutos = Math.floor(paceMinPorKm);
  let segundos = Math.round((paceMinPorKm - minutos) * 60);
  // Math.round pode levar segundos a 60 (ex: 59.6 -> 60) — carrega pro
  // minuto seguinte em vez de mostrar "5:60 /km".
  if (segundos === 60) {
    minutos += 1;
    segundos = 0;
  }

  return `${minutos}:${String(segundos).padStart(2, '0')} /km`;
}
