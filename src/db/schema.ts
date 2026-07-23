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
