const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function getTodayDateString() {
  return toLocalIsoDate(new Date());
}

export function formatFullDateLabel(date: Date) {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} de ${MONTHS[date.getMonth()]}`;
}

export function getWeekdayLabel(date: Date) {
  return WEEKDAYS[date.getDay()];
}

export function formatDateNoWeekday(date: Date) {
  return `${date.getDate()} de ${MONTHS[date.getMonth()]}`;
}

/** Whole days between two ISO date strings (to - from). */
export function daysBetween(fromIso: string, toIso: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const from = parseLocalIsoDate(fromIso);
  const to = parseLocalIsoDate(toIso);
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

export function formatShortDateLabel(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  return `${date.getDate()} de ${MONTHS[date.getMonth()]}`;
}

export function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalIsoDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

export function formatDayMonthLabel(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

/** Monday-of-the-week (as an ISO date string) that the given ISO date falls in. */
export function getWeekStartIso(isoDate: string): string {
  const date = parseLocalIsoDate(isoDate);
  const offset = (date.getDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  date.setDate(date.getDate() - offset);
  return toLocalIsoDate(date);
}

/**
 * Current consecutive-week training streak: walks backward week by week from
 * the current week (skipping it if it has no session yet, since it isn't
 * over) and counts how many consecutive weeks have at least one session.
 */
export function computeWeekStreak(concludedSessionDates: string[]): number {
  if (concludedSessionDates.length === 0) return 0;

  const weekKeys = new Set(concludedSessionDates.map(getWeekStartIso));
  let cursorIso = getWeekStartIso(getTodayDateString());

  if (!weekKeys.has(cursorIso)) {
    const cursor = parseLocalIsoDate(cursorIso);
    cursor.setDate(cursor.getDate() - 7);
    cursorIso = toLocalIsoDate(cursor);
  }

  let streak = 0;
  while (weekKeys.has(cursorIso)) {
    streak += 1;
    const cursor = parseLocalIsoDate(cursorIso);
    cursor.setDate(cursor.getDate() - 7);
    cursorIso = toLocalIsoDate(cursor);
  }
  return streak;
}
