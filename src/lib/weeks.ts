import { getTodayDateString, getWeekStartIso, parseLocalIsoDate, toLocalIsoDate } from './date';

/** Lista de `weeksCount` semanas (ISO, segunda-feira), da mais antiga pra mais
 * recente, terminando na semana atual — a mesma janela deslizante usada por
 * várias seções da aba Progresso (volume semanal, séries por músculo,
 * densidade, deload). */
export function buildWeekWindow(weeksCount: number): string[] {
  const weeks: string[] = [];
  const cursor = parseLocalIsoDate(getWeekStartIso(getTodayDateString()));
  for (let i = 0; i < weeksCount; i++) {
    weeks.unshift(toLocalIsoDate(cursor));
    cursor.setDate(cursor.getDate() - 7);
  }
  return weeks;
}

/** Quantas semanas (ISO, segunda-feira) já se passaram entre duas datas
 * quaisquer — usado para limitar a janela de aderência pela idade do plano. */
export function weeksBetween(fromIso: string, toIso: string): number {
  const fromWeekStart = parseLocalIsoDate(getWeekStartIso(fromIso));
  const toWeekStart = parseLocalIsoDate(getWeekStartIso(toIso));
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((toWeekStart.getTime() - fromWeekStart.getTime()) / msPerWeek)) + 1;
}
