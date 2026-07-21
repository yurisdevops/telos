import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

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
});

export type SetLog = typeof setLogs.$inferSelect;
export type NewSetLog = typeof setLogs.$inferInsert;
