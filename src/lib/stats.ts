// Extraído de FrequencySection (aba Progresso) — mesma fórmula, só movida
// pra ser compartilhável com os stat cards do Perfil.
export function getCurrentMonthPrefix(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`;
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
