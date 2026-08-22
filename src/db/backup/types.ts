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
  // Aquecimento: mesmo padrão de pesoCorporal acima — sempre presente e
  // normalizado para `false` em backups antigos, de antes dessa coluna
  // existir (migração 0015).
  aquecimento: boolean;
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

// Fundação de medidas corporais (Fase 1A) — mesmo molde de
// BackupBodyWeightLog: standalone, uma linha por data, ausente em backups
// anteriores a essa feature (normalizado pra `[]` na validação). Todas as
// medidas nullable — usuário registra só as que quiser.
//
// `bracoCm`/`coxaCm`/`panturrilhaCm` (lado único, Fase 1B) são LEGADO desde
// a expansão pro conjunto esquerdo/direito abaixo (ver comentário em
// schema.ts) — continuam AQUI de propósito, pra não perder o que já tiver
// sido digitado durante os testes da Fase 1B num backup antigo; só não são
// mais lidos/escritos pela aplicação (body-measurements.ts/MeasurementsSection).
export type BackupBodyMeasurement = {
  id: number;
  data: string;
  // Tronco.
  ombrosCm: number | null;
  peitoCm: number | null;
  cinturaCm: number | null;
  quadrilCm: number | null;
  // Membros (esquerdo/direito).
  bracoEsqCm: number | null;
  bracoDirCm: number | null;
  antebracoEsqCm: number | null;
  antebracoDirCm: number | null;
  coxaEsqCm: number | null;
  coxaDirCm: number | null;
  panturrilhaEsqCm: number | null;
  panturrilhaDirCm: number | null;
  // Legado (Fase 1B, lado único).
  bracoCm: number | null;
  coxaCm: number | null;
  panturrilhaCm: number | null;
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
//
// `sexo` (fundação do boneco 2D, Fase 1A) é o oposto de pinHash/pinSalt: É
// dado de perfil de verdade, não trava local — entra no backup normalmente.
export type BackupUserProfile = {
  nome: string | null;
  alturaCm: number | null;
  experiencia: string | null;
  fotoUri: string | null;
  lastSeenChangelogVersion: number | null;
  sexo: string | null;
};

// Fundação de cardio (Etapa A) — cardioSessions é standalone de verdade
// (sem FK pra dentro do núcleo sessions/workoutPlans, mesmo espírito de
// BackupBodyMeasurement) mas É referenciada por cardioLogs, então (ao
// contrário de BackupBodyWeightLog/BackupDeloadWeek) precisa de resolução de
// id na restauração — ver restoreCardioSessions em restore.ts.
export type BackupCardioSession = {
  id: number;
  data: string;
  horaInicio: number | null;
  horaFim: number | null;
  concluida: boolean;
  obs: string | null;
};

// Bloco de cardio — usado nos DOIS modos (ver schema.ts): `sessionId`
// (dentro de um treino de força, referencia BackupSession.id) OU
// `cardioSessionId` (sessão separada só de cardio, referencia
// BackupCardioSession.id). Exatamente um dos dois deve ser não-null — nunca
// os dois, nunca nenhum; validate.ts recusa o backup se esse invariante for
// violado (não é um campo "opcional ausente em backup antigo" — é uma
// tabela nova inteira, sem baggage de compatibilidade retroativa própria).
export type BackupCardioLog = {
  id: number;
  sessionId: number | null;
  cardioSessionId: number | null;
  modalidade: string;
  duracaoMin: number;
  distanciaKm: number | null;
  intensidade: string;
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
  // Fundação de medidas corporais (Fase 1A) — ausente em backups anteriores,
  // mesma regra de normalização pra `[]`.
  bodyMeasurements: BackupBodyMeasurement[];
  // Onda 5 — mesma regra: ausentes em backups anteriores, normalizado pra [].
  exercisePreferences: BackupExercisePreference[];
  exerciseSubstitutions: BackupExerciseSubstitution[];
  // Perfil — ausente em backups anteriores, normalizado pra `null` (não `[]`,
  // já que é um objeto único, não uma lista).
  userProfile: BackupUserProfile | null;
  // Fundação de cardio (Etapa A) — ausentes em backups anteriores, mesma
  // regra de normalização pra `[]`.
  cardioSessions: BackupCardioSession[];
  cardioLogs: BackupCardioLog[];
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
  | 'userProfile'
  | 'bodyMeasurements'
  | 'cardioSessions'
  | 'cardioLogs';

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
  bodyMeasurements: 'medidas corporais',
  cardioSessions: 'sessões de cardio',
  cardioLogs: 'blocos de cardio',
};
