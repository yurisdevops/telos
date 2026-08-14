import { parseLocalIsoDate, toLocalIsoDate } from './date';

// Extraído de FrequencySection (aba Progresso) — mesma fórmula, só movida
// pra ser compartilhável com os stat cards do Perfil.
export function getCurrentMonthPrefix(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`;
}

/** Quais dos 7 dias de uma semana (a partir de `weekStartIso`, segunda-feira)
 * tiveram sessão concluída — índice 0 = segunda ... 6 = domingo. Mesma
 * prateleira/estilo de `computeTrainedDaysInMonth`, só que por semana e
 * devolvendo os 7 slots (não só os dias com treino) — pro marcador do card
 * de compartilhamento precisar saber tanto os dias treinados quanto os não. */
export function computeTrainedDaysInWeek(concludedSessionDates: string[], weekStartIso: string): boolean[] {
  const dateSet = new Set(concludedSessionDates);
  const start = parseLocalIsoDate(weekStartIso);
  const result: boolean[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    result.push(dateSet.has(toLocalIsoDate(day)));
  }
  return result;
}

/** Dias do mês (1-31) em que houve sessão concluída, a partir de datas ISO
 * (`YYYY-MM-DD`) já filtradas por `sessions.concluida = true`. */
export function computeTrainedDaysInMonth(concludedSessionDates: string[], monthPrefix: string): Set<number> {
  const set = new Set<number>();
  for (const date of concludedSessionDates) {
    if (date.startsWith(monthPrefix)) set.add(Number(date.slice(8, 10)));
  }
  return set;
}
