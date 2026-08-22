import { sqliteTable, integer, text, real, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const exercises = sqliteTable('exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  wgerId: integer('wger_id').notNull(),
  nome: text('nome').notNull(),
  nomeEn: text('nome_en').notNull(),
  categoria: text('categoria').notNull(),
  equipamento: text('equipamento').notNull(),
  musculos: text('musculos').notNull(),
  musculosSecundarios: text('musculos_secundarios').notNull(),
  descricao: text('descricao'),
  dica: text('dica'),
  nivel: text('nivel'),
});

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;

export const workoutPlans = sqliteTable('workout_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  tipo: text('tipo').notNull(),
  criadoEm: text('criado_em').notNull(),
});

export type WorkoutPlan = typeof workoutPlans.$inferSelect;
export type NewWorkoutPlan = typeof workoutPlans.$inferInsert;

export const workoutDays = sqliteTable('workout_days', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  planId: integer('plan_id')
    .notNull()
    .references(() => workoutPlans.id),
  label: text('label').notNull(),
  ordem: integer('ordem').notNull(),
});

export type WorkoutDay = typeof workoutDays.$inferSelect;
export type NewWorkoutDay = typeof workoutDays.$inferInsert;

export const workoutDayExercises = sqliteTable('workout_day_exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dayId: integer('day_id')
    .notNull()
    .references(() => workoutDays.id),
  exerciseId: integer('exercise_id')
    .notNull()
    .references(() => exercises.id),
  seriesAlvo: integer('series_alvo').notNull(),
  repsAlvo: integer('reps_alvo').notNull(),
  cargaAlvo: real('carga_alvo'),
  ordem: integer('ordem').notNull(),
  supersetGroup: text('superset_group'),
});

export type WorkoutDayExercise = typeof workoutDayExercises.$inferSelect;
export type NewWorkoutDayExercise = typeof workoutDayExercises.$inferInsert;

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workoutDayId: integer('workout_day_id')
    .notNull()
    .references(() => workoutDays.id),
  data: text('data').notNull(),
  concluida: integer('concluida', { mode: 'boolean' }).notNull().default(false),
  horaInicio: integer('hora_inicio'),
  horaFim: integer('hora_fim'),
  restTimerStartedAt: integer('rest_timer_started_at'),
  restTimerDurationSeconds: integer('rest_timer_duration_seconds'),
  // Sessão inteira marcada como fora da rotina de academia (ex: treino de
  // viagem) — cargas dela saem de sugestão/recordes/PR/estagnação (Etapa B),
  // mas continuam contando em volume/séries/histórico/frequência. Binário,
  // sem nomear onde — só sinaliza "não é comparável".
  foraDaAcademia: integer('fora_da_academia', { mode: 'boolean' }).notNull().default(false),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export const setLogs = sqliteTable('set_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id')
    .notNull()
    .references(() => sessions.id),
  exerciseId: integer('exercise_id')
    .notNull()
    .references(() => exercises.id),
  numeroSerie: integer('numero_serie').notNull(),
  reps: integer('reps').notNull(),
  carga: real('carga').notNull(),
  rpe: real('rpe'),
  pesoCorporal: integer('peso_corporal', { mode: 'boolean' }).notNull().default(false),
  aquecimento: integer('aquecimento', { mode: 'boolean' }).notNull().default(false),
});

export type SetLog = typeof setLogs.$inferSelect;
export type NewSetLog = typeof setLogs.$inferInsert;

export const sessionExtraExercises = sqliteTable('session_extra_exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id')
    .notNull()
    .references(() => sessions.id),
  exerciseId: integer('exercise_id')
    .notNull()
    .references(() => exercises.id),
  seriesAlvo: integer('series_alvo').notNull(),
  repsAlvo: integer('reps_alvo').notNull(),
  cargaAlvo: real('carga_alvo'),
  ordem: integer('ordem').notNull(),
});

export type SessionExtraExercise = typeof sessionExtraExercises.$inferSelect;
export type NewSessionExtraExercise = typeof sessionExtraExercises.$inferInsert;

export const sessionSkips = sqliteTable(
  'session_skips',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id),
    workoutDayExerciseId: integer('workout_day_exercise_id')
      .notNull()
      .references(() => workoutDayExercises.id),
  },
  (table) => ({
    uniqSessionDayExercise: uniqueIndex('session_skips_session_day_exercise_idx').on(
      table.sessionId,
      table.workoutDayExerciseId
    ),
  })
);

export type SessionSkip = typeof sessionSkips.$inferSelect;
export type NewSessionSkip = typeof sessionSkips.$inferInsert;

export const bodyWeightLogs = sqliteTable('body_weight_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  data: text('data').notNull().unique(),
  pesoKg: real('peso_kg').notNull(),
});

export type BodyWeightLog = typeof bodyWeightLogs.$inferSelect;
export type NewBodyWeightLog = typeof bodyWeightLogs.$inferInsert;

// Fundação de medidas corporais (Fase 1A — pré-requisito do boneco 2D da
// Fase 2). Mesmo molde de bodyWeightLogs: uma linha por data (`.unique()`
// garante isso no banco, não só na aplicação), todas as medidas nullable —
// o usuário registra só as que quiser, um upsert parcial por dia. Altura
// (userProfile.alturaCm) e peso (bodyWeightLogs) não entram aqui de
// propósito — já existem, reusados na leitura, nunca duplicados.
//
// `bracoCm`/`coxaCm`/`panturrilhaCm` (Fase 1B, lado único) são LEGADO desde
// a expansão pro conjunto esquerdo/direito abaixo — a Opção A simplificada
// foi escolhida (app recém-criado, sem dado real relevante em produção):
// ficam no schema sem uso pela aplicação daqui pra frente (SQLite não
// remove coluna fácil), mas continuam no backup pra não perder o que já foi
// digitado durante os testes da Fase 1B. Nunca lidas/escritas por
// body-measurements.ts nem pela UI a partir desta feature.
export const bodyMeasurements = sqliteTable('body_measurements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  data: text('data').notNull().unique(),
  // Tronco (lado único).
  ombrosCm: real('ombros_cm'),
  peitoCm: real('peito_cm'),
  cinturaCm: real('cintura_cm'),
  quadrilCm: real('quadril_cm'),
  // Membros (esquerdo + direito).
  bracoEsqCm: real('braco_esq_cm'),
  bracoDirCm: real('braco_dir_cm'),
  antebracoEsqCm: real('antebraco_esq_cm'),
  antebracoDirCm: real('antebraco_dir_cm'),
  coxaEsqCm: real('coxa_esq_cm'),
  coxaDirCm: real('coxa_dir_cm'),
  panturrilhaEsqCm: real('panturrilha_esq_cm'),
  panturrilhaDirCm: real('panturrilha_dir_cm'),
  // Legado (Fase 1B, lado único) — ver comentário acima.
  bracoCm: real('braco_cm'),
  coxaCm: real('coxa_cm'),
  panturrilhaCm: real('panturrilha_cm'),
});

export type BodyMeasurement = typeof bodyMeasurements.$inferSelect;
export type NewBodyMeasurement = typeof bodyMeasurements.$inferInsert;

export const deloadWeeks = sqliteTable('deload_weeks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  weekStartIso: text('week_start_iso').notNull().unique(),
});

export type DeloadWeek = typeof deloadWeeks.$inferSelect;
export type NewDeloadWeek = typeof deloadWeeks.$inferInsert;

// Sem FK pra exercises.id de propósito — chaveadas por wgerId (estável entre
// reconciliações de catálogo e entre dispositivos), mesmo padrão já usado em
// src/db/templates.ts e em todo o pipeline de backup. Uma limpeza futura de
// catálogo pode remapear/apagar exercises.id; wgerId sobrevive.
export const exercisePreferences = sqliteTable('exercise_preferences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  exerciseWgerId: integer('exercise_wger_id').notNull().unique(),
  favorito: integer('favorito', { mode: 'boolean' }).notNull().default(false),
  nota: text('nota'),
});

export type ExercisePreference = typeof exercisePreferences.$inferSelect;
export type NewExercisePreference = typeof exercisePreferences.$inferInsert;

export const exerciseSubstitutions = sqliteTable('exercise_substitutions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  previousExerciseWgerId: integer('previous_exercise_wger_id').notNull(),
  newExerciseWgerId: integer('new_exercise_wger_id').notNull(),
  substitutedAt: text('substituted_at').notNull(),
});

export type ExerciseSubstitution = typeof exerciseSubstitutions.$inferSelect;
export type NewExerciseSubstitution = typeof exerciseSubstitutions.$inferInsert;

// Single-user, single-linha: `id` sempre 1, sem autoIncrement (nunca criamos
// uma segunda linha) — ensureUserProfileRow() garante essa linha existir.
// Peso não entra aqui de propósito: já vive em bodyWeightLogs (série
// temporal); o Perfil lê o registro mais recente de lá em vez de duplicar.
export const userProfile = sqliteTable('user_profile', {
  id: integer('id').primaryKey(),
  nome: text('nome'),
  alturaCm: integer('altura_cm'),
  experiencia: text('experiencia'),
  fotoUri: text('foto_uri'),
  // Maior versão do changelog (src/lib/changelog.ts) que o usuário já viu.
  // Nullable de propósito: linhas existentes ficam NULL até a migração
  // aditiva rodar — tratado como 0 na leitura (getLastSeenChangelogVersion),
  // nunca como "já viu tudo".
  lastSeenChangelogVersion: integer('last_seen_changelog_version'),
  // PIN de reset de histórico (fundação — sistema de PIN em si vem depois).
  // Hash SHA-256 + salt aleatório por device, nunca o PIN em texto. Nullable:
  // `null` nos dois = usuário ainda não criou PIN. Trava LOCAL ao device de
  // propósito — nunca entra no backup (ver types.ts/serialize.ts/restore.ts).
  pinHash: text('pin_hash'),
  pinSalt: text('pin_salt'),
  // Fundação do boneco 2D (Fase 2, futura) — 'masculino' | 'feminino' na
  // aplicação; SQLite não tem enum nativo, então fica `text` livre aqui,
  // mesmo tratamento de `experiencia`. Nullable: usuário pode nunca preencher.
  sexo: text('sexo'),
});

export type UserProfile = typeof userProfile.$inferSelect;
export type NewUserProfile = typeof userProfile.$inferInsert;
