/**
 * Opções de personalização do card de compartilhamento, escolhidas na tela
 * de personalização (workout-share-modal.tsx) e aplicadas tanto na prévia ao
 * vivo (instância visível do WorkoutShareCard dentro do modal) quanto no
 * card off-screen (a instância real que o captureRef rasteriza em hoje.tsx)
 * — as duas leem o mesmo objeto, só uma é visível.
 */
/** Estilo visual do card — 'completo' (grade de StatCells + faixa de PR +
 * marcador de semana, Etapa A) e 'minimalista' (Etapa B) já têm componente
 * próprio; 'foto' (Etapa C) ainda não existe — aparece desabilitado
 * ("Em breve") na tela de personalização até lá. */
export type WorkoutShareStyle = 'completo' | 'minimalista' | 'foto';

export type WorkoutShareOptions = {
  estilo: WorkoutShareStyle;
  mostrarPr: boolean;
  /** Índice em `sessionPrs` (WorkoutShareMetrics) do PR escolhido pelo
   * usuário pra aparecer no card — `null` = automático, usa
   * `metrics.prDestaque` (já calculado por `pickHighlightPr` em hoje.tsx).
   * Um índice fora do array (sessão mudou, lista encolheu etc.) também cai
   * no automático — ver WorkoutShareCard. */
  prEscolhido: number | null;
  mostrarDuracao: boolean;
  mostrarVolume: boolean;
  mostrarSeries: boolean;
  mostrarExercicios: boolean;
};

export const DEFAULT_SHARE_OPTIONS: WorkoutShareOptions = {
  estilo: 'completo',
  mostrarPr: true,
  prEscolhido: null,
  mostrarDuracao: true,
  mostrarVolume: true,
  mostrarSeries: true,
  mostrarExercicios: true,
};
