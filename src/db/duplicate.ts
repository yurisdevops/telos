import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { workoutDayExercises, workoutDays, workoutPlans } from '@/db/schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function nextOrdem(existing: { ordem: number }[]): number {
  return existing.length > 0 ? Math.max(...existing.map((row) => row.ordem)) + 1 : 0;
}

function cloneDayExercises(tx: Tx, sourceDayId: number, targetDayId: number) {
  const rows = tx
    .select()
    .from(workoutDayExercises)
    .where(eq(workoutDayExercises.dayId, sourceDayId))
    .orderBy(workoutDayExercises.ordem)
    .all();

  for (const row of rows) {
    tx.insert(workoutDayExercises)
      .values({
        dayId: targetDayId,
        exerciseId: row.exerciseId,
        seriesAlvo: row.seriesAlvo,
        repsAlvo: row.repsAlvo,
        cargaAlvo: row.cargaAlvo,
        ordem: row.ordem,
        supersetGroup: row.supersetGroup,
      })
      .run();
  }
}

function cloneDay(tx: Tx, sourceDayId: number, targetPlanId: number, newLabel?: string): number {
  const sourceDay = tx.select().from(workoutDays).where(eq(workoutDays.id, sourceDayId)).get();
  if (!sourceDay) {
    throw new Error(`Dia ${sourceDayId} não encontrado.`);
  }

  const existingTargetDays = tx.select().from(workoutDays).where(eq(workoutDays.planId, targetPlanId)).all();

  const created = tx
    .insert(workoutDays)
    .values({
      planId: targetPlanId,
      label: newLabel ?? `${sourceDay.label} (cópia)`,
      ordem: nextOrdem(existingTargetDays),
    })
    .returning()
    .get();

  cloneDayExercises(tx, sourceDayId, created.id);
  return created.id;
}

function clonePlan(tx: Tx, sourcePlanId: number, newName: string): number {
  const sourcePlan = tx.select().from(workoutPlans).where(eq(workoutPlans.id, sourcePlanId)).get();
  if (!sourcePlan) {
    throw new Error(`Plano ${sourcePlanId} não encontrado.`);
  }

  const newPlan = tx
    .insert(workoutPlans)
    .values({
      nome: newName,
      tipo: sourcePlan.tipo,
      criadoEm: new Date().toISOString(),
    })
    .returning()
    .get();

  const sourceDays = tx
    .select()
    .from(workoutDays)
    .where(eq(workoutDays.planId, sourcePlanId))
    .orderBy(workoutDays.ordem)
    .all();

  for (const day of sourceDays) {
    const createdDay = tx
      .insert(workoutDays)
      .values({ planId: newPlan.id, label: day.label, ordem: day.ordem })
      .returning()
      .get();
    cloneDayExercises(tx, day.id, createdDay.id);
  }

  return newPlan.id;
}

/** Duplica um plano inteiro (dias + exercícios, incluindo agrupamento de
 * supersérie), nome editável. Nunca copia sessões/setLogs — só a estrutura. */
export function duplicatePlanTx(sourcePlanId: number, newName: string): number {
  return db.transaction((tx) => clonePlan(tx, sourcePlanId, newName));
}

/** Duplica um dia (com seus exercícios) para o mesmo plano ou outro. */
export function duplicateDayTx(sourceDayId: number, targetPlanId: number, newLabel?: string): number {
  return db.transaction((tx) => cloneDay(tx, sourceDayId, targetPlanId, newLabel));
}
