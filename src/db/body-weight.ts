import { eq } from 'drizzle-orm';

import { db } from './index';
import { bodyWeightLogs } from './schema';
import { getTodayDateString } from '@/lib/date';

/**
 * Upsert por data (hoje) — extraída do card de peso corporal do Progresso
 * (BodyWeightSection) pra o Perfil poder registrar o mesmo jeito, sem
 * duplicar a lógica. Um valor por dia: se hoje já tem registro, atualiza;
 * senão, insere.
 */
export async function upsertBodyWeightToday(pesoKg: number): Promise<void> {
  const today = getTodayDateString();
  const existing = await db.select().from(bodyWeightLogs).where(eq(bodyWeightLogs.data, today));
  if (existing[0]) {
    await db.update(bodyWeightLogs).set({ pesoKg }).where(eq(bodyWeightLogs.id, existing[0].id));
  } else {
    await db.insert(bodyWeightLogs).values({ data: today, pesoKg });
  }
}

/** Peso mais recente registrado (maior data), ou `null` se não houver nenhum. */
export async function getLatestBodyWeightKg(): Promise<number | null> {
  const rows = await db.select().from(bodyWeightLogs).orderBy(bodyWeightLogs.data);
  return rows.length > 0 ? rows[rows.length - 1].pesoKg : null;
}
