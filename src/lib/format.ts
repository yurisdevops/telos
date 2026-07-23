/** "7400" -> "7.400" (pt-BR thousands separator, no Intl dependency). */
export function formatNumberPtBr(value: number): string {
  const rounded = Math.round(value);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatVolumeKg(value: number): string {
  return `${formatNumberPtBr(value)} kg`;
}

/** Rounds a rough axis step up to a "nice" 1/2/5×10^n number. */
export function chooseNiceStep(roughStep: number): number {
  if (roughStep <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;
  let niceNormalized: number;
  if (normalized <= 1.5) niceNormalized = 1;
  else if (normalized <= 3.5) niceNormalized = 2;
  else if (normalized <= 7.5) niceNormalized = 5;
  else niceNormalized = 10;
  return niceNormalized * magnitude;
}
