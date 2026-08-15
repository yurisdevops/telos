import { eq } from 'drizzle-orm';

import { db } from './index';
import { bodyMeasurements, type BodyMeasurement } from './schema';
import { getTodayDateString } from '@/lib/date';

export type MeasurementField =
  | 'peitoCm'
  | 'cinturaCm'
  | 'quadrilCm'
  | 'bracoCm'
  | 'coxaCm'
  | 'panturrilhaCm';

export type MeasurementPatch = Partial<Record<MeasurementField, number>>;

/**
 * Upsert por data (hoje) — mesmo padrão de upsertBodyWeightToday
 * (body-weight.ts). Diferença: peso é 1 campo obrigatório; medidas são 6
 * campos opcionais, então `patch` traz só os que o usuário preencheu AGORA.
 * `.set(patch)` num UPDATE só toca as colunas mencionadas — se hoje já tem
 * registro parcial (ex: peito registrado de manhã) e o usuário volta à
 * tarde só com cintura, o peito da manhã sobrevive intacto; só cintura é
 * escrita. Registrar de novo a MESMA medida no mesmo dia sobrescreve o
 * valor anterior daquele campo (não soma linha nova — índice único em
 * `data` garante isso no banco).
 */
export async function upsertMeasurementsToday(patch: MeasurementPatch): Promise<void> {
  if (Object.keys(patch).length === 0) return;

  const today = getTodayDateString();
  const existing = await db.select().from(bodyMeasurements).where(eq(bodyMeasurements.data, today));
  if (existing[0]) {
    await db.update(bodyMeasurements).set(patch).where(eq(bodyMeasurements.id, existing[0].id));
  } else {
    await db.insert(bodyMeasurements).values({ data: today, ...patch });
  }
}

/** Linha mais recente registrada (maior data), ou `null` se não houver nenhuma. */
export async function getLatestMeasurements(): Promise<BodyMeasurement | null> {
  const rows = await db.select().from(bodyMeasurements).orderBy(bodyMeasurements.data);
  return rows.length > 0 ? rows[rows.length - 1] : null;
}

/**
 * As duas linhas mais recentes — o suficiente pra calcular a variação por
 * medida (última vs. anterior). `previous` é `null` se só existir 1 registro
 * (ou nenhum) — nesse caso não há variação pra mostrar, só o valor atual.
 */
export async function getLatestMeasurementsWithPrevious(): Promise<{
  latest: BodyMeasurement | null;
  previous: BodyMeasurement | null;
}> {
  const rows = await db.select().from(bodyMeasurements).orderBy(bodyMeasurements.data);
  return {
    latest: rows.length > 0 ? rows[rows.length - 1] : null,
    previous: rows.length > 1 ? rows[rows.length - 2] : null,
  };
}
