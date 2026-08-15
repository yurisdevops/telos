export const FORMAT_VERSION = 1;

export type BackupWorkoutPlan = {
  id: number;
  nome: string;
  tipo: string;
  criadoEm: string;
};

export type BackupWorkoutDay = {
  id: number;
  planId: number;
  label: string;
  ordem: number;
};

export type BackupWorkoutDayExercise = {
  id: number;
  dayId: number;
  exerciseWgerId: number;
  exerciseNomeSnapshot: string;
  seriesAlvo: number;
  repsAlvo: number;
  cargaAlvo: number | null;
  ordem: number;
  // Rótulo de supersérie (Onda 3). Sempre presente e normalizado para `null`
  // após a validação — mesmo quando o arquivo de origem é de antes dessa
  // feature e não tem o campo.
  supersetGroup: string | null;
};

export type BackupSession = {
  id: number;
  workoutDayId: number;
  data: string;
  concluida: boolean;
  horaInicio: number | null;
  horaFim: number | null;
  restTimerStartedAt: number | null;
  restTimerDurationSeconds: number | null;
  // Fora da academia (fundação da feature — filtro de cálculo vem depois):
  // sempre presente e normalizado para `false` em backups antigos, de antes
  // dessa coluna existir. Mesmo padrão de `pesoCorporal` em BackupSetLog.
  foraDaAcademia: boolean;
};

export type BackupSessionExtraExercise = {
  id: number;
  sessionId: number;
  exerciseWgerId: number;
  exerciseNomeSnapshot: string;
  seriesAlvo: number;
  repsAlvo: number;
  cargaAlvo: number | null;
  ordem: number;
};

export type BackupSessionSkip = {
  id: number;
  sessionId: number;
  workoutDayExerciseId: number;
};

export type BackupSetLog = {
  id: number;
  sessionId: number;
  exerciseWgerId: number;
  exerciseNomeSnapshot: string;
  numeroSerie: number;
  reps: number;
  carga: number;
  // RPE (Onda 4), categórico mapeado pra número (7/8.5/10). Sempre presente e
  // normalizado para `null` após a validação — mesmo em arquivos de antes
  // dessa feature.
  rpe: number | null;
  // Peso corporal: sempre presente e normalizado para `false` em backups
  // antigos, de antes dessa feature existir.
  pesoCorporal: boolean;
};

// Onda 4 — tabelas standalone, sem FK nenhuma (não referenciam nem são
// referenciadas por nada mais no payload).
export type BackupBodyWeightLog = {
  id: number;
  data: string;
  pesoKg: number;
};

export type BackupDeloadWeek = {
  id: number;
  weekStartIso: string;
};

// Onda 5 — também standalone: guardam só `wgerId` cru (nunca `exercises.id`),
// então não precisam de resolução nenhuma na importação, nem de FK declarada.
export type BackupExercisePreference = {
  id: number;
  exerciseWgerId: number;
  exerciseNomeSnapshot: string;
  favorito: boolean;
  nota: string | null;
};

export type BackupExerciseSubstitution = {
  id: number;
  previousExerciseWgerId: number;
  previousExerciseNomeSnapshot: string;
  newExerciseWgerId: number;
  newExerciseNomeSnapshot: string;
  substitutedAt: string;
};

// Perfil (aba Perfil, etapa 1) — single-row (id fixo = 1), por isso é objeto
// único e nullable no payload, não array como as demais tabelas. Peso não
// entra aqui de propósito: já vive em bodyWeightLogs. `fotoUri` é caminho de
// arquivo local — pode não existir mais no dispositivo de destino ao
// restaurar; a validação só confere que é string, sem tocar no arquivo.
//
// `pinHash`/`pinSalt` (coluna em user_profile, fundação do PIN de reset de
// histórico) ficam FORA deste tipo DE PROPÓSITO — trava local ao device, não
// um dado de usuário que deveria viajar. Restaurar um backup nunca deve
// trazer nem substituir o PIN local: omitir os campos aqui já garante que
// `buildBackupPayload` (serialize.ts) não os inclua, e que o upsert em
// `restoreUserProfile` (restore.ts) nunca os mencione no SET — o que
// preserva o valor atual da coluna intacto (UPDATE só toca nas colunas
// listadas, nunca vira REPLACE da linha inteira).
export type BackupUserProfile = {
  nome: string | null;
  alturaCm: number | null;
  experiencia: string | null;
  fotoUri: string | null;
  lastSeenChangelogVersion: number | null;
};

export type BackupPayload = {
  formatVersion: number;
  exportedAt: string;
  app: 'telos';
  workoutPlans: BackupWorkoutPlan[];
  workoutDays: BackupWorkoutDay[];
  workoutDayExercises: BackupWorkoutDayExercise[];
  sessions: BackupSession[];
  sessionExtraExercises: BackupSessionExtraExercise[];
  sessionSkips: BackupSessionSkip[];
  setLogs: BackupSetLog[];
  // Ausentes em backups de antes da Onda 4 — normalizado para `[]` na
  // validação, nunca `undefined`.
  bodyWeightLogs: BackupBodyWeightLog[];
  deloadWeeks: BackupDeloadWeek[];
  // Onda 5 — mesma regra: ausentes em backups anteriores, normalizado pra [].
  exercisePreferences: BackupExercisePreference[];
  exerciseSubstitutions: BackupExerciseSubstitution[];
  // Perfil — ausente em backups anteriores, normalizado pra `null` (não `[]`,
  // já que é um objeto único, não uma lista).
  userProfile: BackupUserProfile | null;
};

export type ImportMode = 'replace' | 'merge';

export type TableKey =
  | 'workoutPlans'
  | 'workoutDays'
  | 'workoutDayExercises'
  | 'sessions'
  | 'sessionExtraExercises'
  | 'sessionSkips'
  | 'setLogs'
  | 'bodyWeightLogs'
  | 'deloadWeeks'
  | 'exercisePreferences'
  | 'exerciseSubstitutions'
  | 'userProfile';

export type SkippedOrphanExercise = {
  table: TableKey;
  exerciseNomeSnapshot: string;
  exerciseWgerId: number;
};

export type ImportSummary = {
  inserted: Record<TableKey, number>;
  reused: Record<TableKey, number>;
  ambiguous: Record<TableKey, number>;
  skippedOrphanExercise: SkippedOrphanExercise[];
};

export const TABLE_LABELS: Record<TableKey, string> = {
  workoutPlans: 'planos',
  workoutDays: 'dias de treino',
  workoutDayExercises: 'exercícios de plano',
  sessions: 'sessões',
  sessionExtraExercises: 'exercícios avulsos',
  sessionSkips: 'exercícios pulados',
  setLogs: 'séries',
  bodyWeightLogs: 'registros de peso corporal',
  deloadWeeks: 'semanas de deload',
  exercisePreferences: 'preferências de exercício (favoritos/notas)',
  exerciseSubstitutions: 'substituições de exercício',
  userProfile: 'perfil',
};
