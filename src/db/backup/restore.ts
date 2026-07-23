import { eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import {
  bodyWeightLogs,
  deloadWeeks,
  exercisePreferences,
  exercises,
  exerciseSubstitutions,
  sessionExtraExercises,
  sessionSkips,
  sessions,
  setLogs,
  workoutDayExercises,
  workoutDays,
  workoutPlans,
} from '@/db/schema';

import type {
  BackupBodyWeightLog,
  BackupDeloadWeek,
  BackupExercisePreference,
  BackupExerciseSubstitution,
  BackupPayload,
  BackupSession,
  BackupSessionExtraExercise,
  BackupSessionSkip,
  BackupSetLog,
  BackupWorkoutDay,
  BackupWorkoutDayExercise,
  BackupWorkoutPlan,
  ImportMode,
  ImportSummary,
  TableKey,
} from './types';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function emptySummary(): ImportSummary {
  const zeroTable = (): Record<TableKey, number> => ({
    workoutPlans: 0,
    workoutDays: 0,
    workoutDayExercises: 0,
    sessions: 0,
    sessionExtraExercises: 0,
    sessionSkips: 0,
    setLogs: 0,
    bodyWeightLogs: 0,
    deloadWeeks: 0,
    exercisePreferences: 0,
    exerciseSubstitutions: 0,
  });
  return {
    inserted: zeroTable(),
    reused: zeroTable(),
    ambiguous: zeroTable(),
    skippedOrphanExercise: [],
  };
}

function buildWgerIdMap(tx: Tx): Map<number, number> {
  const rows = tx.select({ id: exercises.id, wgerId: exercises.wgerId }).from(exercises).all();
  return new Map(rows.map((r) => [r.wgerId, r.id]));
}

// Ordem segura de FK — nunca toca no catálogo de exercícios.
function wipeUserData(tx: Tx) {
  tx.delete(setLogs).run();
  tx.delete(sessionSkips).run();
  tx.delete(sessionExtraExercises).run();
  tx.delete(sessions).run();
  tx.delete(workoutDayExercises).run();
  tx.delete(workoutDays).run();
  tx.delete(workoutPlans).run();
  tx.delete(bodyWeightLogs).run();
  tx.delete(deloadWeeks).run();
  tx.delete(exercisePreferences).run();
  tx.delete(exerciseSubstitutions).run();
}

function restorePlans(
  tx: Tx,
  rows: BackupWorkoutPlan[],
  mode: ImportMode,
  summary: ImportSummary
): Map<number, number> {
  const idMap = new Map<number, number>();
  const existing = mode === 'merge' ? tx.select().from(workoutPlans).all() : [];

  for (const row of rows) {
    if (mode === 'merge') {
      const candidates = existing.filter((e) => e.nome === row.nome);
      if (candidates.length === 1) {
        idMap.set(row.id, candidates[0].id);
        summary.reused.workoutPlans += 1;
        continue;
      }
      if (candidates.length > 1) {
        summary.ambiguous.workoutPlans += 1;
      }
    }

    const created = tx
      .insert(workoutPlans)
      .values({ nome: row.nome, tipo: row.tipo, criadoEm: row.criadoEm })
      .returning()
      .get();
    idMap.set(row.id, created.id);
    summary.inserted.workoutPlans += 1;
  }

  return idMap;
}

function restoreDays(
  tx: Tx,
  rows: BackupWorkoutDay[],
  planIdMap: Map<number, number>,
  mode: ImportMode,
  summary: ImportSummary
): Map<number, number> {
  const idMap = new Map<number, number>();
  const existing = mode === 'merge' ? tx.select().from(workoutDays).all() : [];

  for (const row of rows) {
    const localPlanId = planIdMap.get(row.planId);
    if (localPlanId === undefined) continue; // plano-pai não foi resolvido

    if (mode === 'merge') {
      const candidates = existing.filter((e) => e.planId === localPlanId && e.label === row.label);
      if (candidates.length === 1) {
        idMap.set(row.id, candidates[0].id);
        summary.reused.workoutDays += 1;
        continue;
      }
      if (candidates.length > 1) {
        summary.ambiguous.workoutDays += 1;
      }
    }

    const created = tx
      .insert(workoutDays)
      .values({ planId: localPlanId, label: row.label, ordem: row.ordem })
      .returning()
      .get();
    idMap.set(row.id, created.id);
    summary.inserted.workoutDays += 1;
  }

  return idMap;
}

function restoreDayExercises(
  tx: Tx,
  rows: BackupWorkoutDayExercise[],
  dayIdMap: Map<number, number>,
  wgerIdMap: Map<number, number>,
  mode: ImportMode,
  summary: ImportSummary
): Map<number, number> {
  const idMap = new Map<number, number>();
  const existing = mode === 'merge' ? tx.select().from(workoutDayExercises).all() : [];

  for (const row of rows) {
    const localDayId = dayIdMap.get(row.dayId);
    if (localDayId === undefined) continue;

    const localExerciseId = wgerIdMap.get(row.exerciseWgerId);
    if (localExerciseId === undefined) {
      summary.skippedOrphanExercise.push({
        table: 'workoutDayExercises',
        exerciseNomeSnapshot: row.exerciseNomeSnapshot,
        exerciseWgerId: row.exerciseWgerId,
      });
      continue;
    }

    if (mode === 'merge') {
      const candidates = existing.filter((e) => e.dayId === localDayId && e.exerciseId === localExerciseId);
      if (candidates.length === 1) {
        idMap.set(row.id, candidates[0].id);
        summary.reused.workoutDayExercises += 1;
        continue;
      }
      if (candidates.length > 1) {
        summary.ambiguous.workoutDayExercises += 1;
      }
    }

    const created = tx
      .insert(workoutDayExercises)
      .values({
        dayId: localDayId,
        exerciseId: localExerciseId,
        seriesAlvo: row.seriesAlvo,
        repsAlvo: row.repsAlvo,
        cargaAlvo: row.cargaAlvo,
        ordem: row.ordem,
        supersetGroup: row.supersetGroup,
      })
      .returning()
      .get();
    idMap.set(row.id, created.id);
    summary.inserted.workoutDayExercises += 1;
  }

  return idMap;
}

function restoreSessions(
  tx: Tx,
  rows: BackupSession[],
  dayIdMap: Map<number, number>,
  mode: ImportMode,
  summary: ImportSummary
): Map<number, number> {
  const idMap = new Map<number, number>();
  const existing = mode === 'merge' ? tx.select().from(sessions).all() : [];

  for (const row of rows) {
    const localDayId = dayIdMap.get(row.workoutDayId);
    if (localDayId === undefined) continue;

    if (mode === 'merge') {
      const candidates = existing.filter((e) => e.workoutDayId === localDayId && e.data === row.data);
      if (candidates.length === 1) {
        idMap.set(row.id, candidates[0].id);
        summary.reused.sessions += 1;
        continue;
      }
      if (candidates.length > 1) {
        summary.ambiguous.sessions += 1;
      }
    }

    const created = tx
      .insert(sessions)
      .values({
        workoutDayId: localDayId,
        data: row.data,
        concluida: row.concluida,
        horaInicio: row.horaInicio,
        horaFim: row.horaFim,
        restTimerStartedAt: row.restTimerStartedAt,
        restTimerDurationSeconds: row.restTimerDurationSeconds,
      })
      .returning()
      .get();
    idMap.set(row.id, created.id);
    summary.inserted.sessions += 1;
  }

  return idMap;
}

function restoreExtraExercises(
  tx: Tx,
  rows: BackupSessionExtraExercise[],
  sessionIdMap: Map<number, number>,
  wgerIdMap: Map<number, number>,
  mode: ImportMode,
  summary: ImportSummary
) {
  const existing = mode === 'merge' ? tx.select().from(sessionExtraExercises).all() : [];

  for (const row of rows) {
    const localSessionId = sessionIdMap.get(row.sessionId);
    if (localSessionId === undefined) continue;

    const localExerciseId = wgerIdMap.get(row.exerciseWgerId);
    if (localExerciseId === undefined) {
      summary.skippedOrphanExercise.push({
        table: 'sessionExtraExercises',
        exerciseNomeSnapshot: row.exerciseNomeSnapshot,
        exerciseWgerId: row.exerciseWgerId,
      });
      continue;
    }

    if (mode === 'merge') {
      const candidates = existing.filter((e) => e.sessionId === localSessionId && e.exerciseId === localExerciseId);
      if (candidates.length === 1) {
        summary.reused.sessionExtraExercises += 1;
        continue;
      }
      if (candidates.length > 1) {
        summary.ambiguous.sessionExtraExercises += 1;
      }
    }

    tx.insert(sessionExtraExercises)
      .values({
        sessionId: localSessionId,
        exerciseId: localExerciseId,
        seriesAlvo: row.seriesAlvo,
        repsAlvo: row.repsAlvo,
        cargaAlvo: row.cargaAlvo,
        ordem: row.ordem,
      })
      .run();
    summary.inserted.sessionExtraExercises += 1;
  }
}

function restoreSkips(
  tx: Tx,
  rows: BackupSessionSkip[],
  sessionIdMap: Map<number, number>,
  dayExerciseIdMap: Map<number, number>,
  mode: ImportMode,
  summary: ImportSummary
) {
  const existing = mode === 'merge' ? tx.select().from(sessionSkips).all() : [];

  for (const row of rows) {
    const localSessionId = sessionIdMap.get(row.sessionId);
    if (localSessionId === undefined) continue;
    const localDayExerciseId = dayExerciseIdMap.get(row.workoutDayExerciseId);
    if (localDayExerciseId === undefined) continue; // exercício pulado ele mesmo não foi resolvido

    if (mode === 'merge') {
      const alreadyExists = existing.some(
        (e) => e.sessionId === localSessionId && e.workoutDayExerciseId === localDayExerciseId
      );
      if (alreadyExists) {
        summary.reused.sessionSkips += 1;
        continue;
      }
    }

    tx.insert(sessionSkips).values({ sessionId: localSessionId, workoutDayExerciseId: localDayExerciseId }).run();
    summary.inserted.sessionSkips += 1;
  }
}

function restoreSetLogs(
  tx: Tx,
  rows: BackupSetLog[],
  sessionIdMap: Map<number, number>,
  wgerIdMap: Map<number, number>,
  mode: ImportMode,
  summary: ImportSummary
) {
  const existing = mode === 'merge' ? tx.select().from(setLogs).all() : [];

  for (const row of rows) {
    const localSessionId = sessionIdMap.get(row.sessionId);
    if (localSessionId === undefined) continue;

    const localExerciseId = wgerIdMap.get(row.exerciseWgerId);
    if (localExerciseId === undefined) {
      summary.skippedOrphanExercise.push({
        table: 'setLogs',
        exerciseNomeSnapshot: row.exerciseNomeSnapshot,
        exerciseWgerId: row.exerciseWgerId,
      });
      continue;
    }

    if (mode === 'merge') {
      const candidates = existing.filter(
        (e) => e.sessionId === localSessionId && e.exerciseId === localExerciseId && e.numeroSerie === row.numeroSerie
      );
      if (candidates.length === 1) {
        summary.reused.setLogs += 1;
        continue;
      }
      if (candidates.length > 1) {
        summary.ambiguous.setLogs += 1;
      }
    }

    tx.insert(setLogs)
      .values({
        sessionId: localSessionId,
        exerciseId: localExerciseId,
        numeroSerie: row.numeroSerie,
        reps: row.reps,
        carga: row.carga,
        rpe: row.rpe,
      })
      .run();
    summary.inserted.setLogs += 1;
  }
}

// Tabelas standalone (Onda 4) — sem FK nenhuma, sem resolução de wgerId, sem
// idMap de retorno (nada mais no payload as referencia).
function restoreBodyWeightLogs(tx: Tx, rows: BackupBodyWeightLog[], mode: ImportMode, summary: ImportSummary) {
  const existing = mode === 'merge' ? tx.select().from(bodyWeightLogs).all() : [];

  for (const row of rows) {
    if (mode === 'merge') {
      const alreadyExists = existing.some((e) => e.data === row.data);
      if (alreadyExists) {
        summary.reused.bodyWeightLogs += 1;
        continue;
      }
    }

    tx.insert(bodyWeightLogs).values({ data: row.data, pesoKg: row.pesoKg }).run();
    summary.inserted.bodyWeightLogs += 1;
  }
}

function restoreDeloadWeeks(tx: Tx, rows: BackupDeloadWeek[], mode: ImportMode, summary: ImportSummary) {
  const existing = mode === 'merge' ? tx.select().from(deloadWeeks).all() : [];

  for (const row of rows) {
    if (mode === 'merge') {
      const alreadyExists = existing.some((e) => e.weekStartIso === row.weekStartIso);
      if (alreadyExists) {
        summary.reused.deloadWeeks += 1;
        continue;
      }
    }

    tx.insert(deloadWeeks).values({ weekStartIso: row.weekStartIso }).run();
    summary.inserted.deloadWeeks += 1;
  }
}

// Onda 5 — standalone, sem FK, sem resolução de wgerId. Merge por chave
// natural: se já existe localmente, mantém o que já está lá (favorito/nota é
// edição do usuário, mescla nunca sobrescreve, mesmo princípio já usado pro
// supersetGroup na Onda 3).
function restoreExercisePreferences(
  tx: Tx,
  rows: BackupExercisePreference[],
  mode: ImportMode,
  summary: ImportSummary
) {
  const existing = mode === 'merge' ? tx.select().from(exercisePreferences).all() : [];

  for (const row of rows) {
    if (mode === 'merge') {
      const alreadyExists = existing.some((e) => e.exerciseWgerId === row.exerciseWgerId);
      if (alreadyExists) {
        summary.reused.exercisePreferences += 1;
        continue;
      }
    }

    tx.insert(exercisePreferences)
      .values({ exerciseWgerId: row.exerciseWgerId, favorito: row.favorito, nota: row.nota })
      .run();
    summary.inserted.exercisePreferences += 1;
  }
}

function restoreExerciseSubstitutions(
  tx: Tx,
  rows: BackupExerciseSubstitution[],
  mode: ImportMode,
  summary: ImportSummary
) {
  const existing = mode === 'merge' ? tx.select().from(exerciseSubstitutions).all() : [];

  for (const row of rows) {
    if (mode === 'merge') {
      const alreadyExists = existing.some(
        (e) =>
          e.previousExerciseWgerId === row.previousExerciseWgerId &&
          e.newExerciseWgerId === row.newExerciseWgerId
      );
      if (alreadyExists) {
        summary.reused.exerciseSubstitutions += 1;
        continue;
      }
    }

    tx.insert(exerciseSubstitutions)
      .values({
        previousExerciseWgerId: row.previousExerciseWgerId,
        newExerciseWgerId: row.newExerciseWgerId,
        substitutedAt: row.substitutedAt,
      })
      .run();
    summary.inserted.exerciseSubstitutions += 1;
  }
}

// Rede de segurança final — o algoritmo acima já garante isso por construção
// (toda inserção resolve a FK por um mapa ou é pulada), mas é barato conferir
// de novo antes de confirmar, no mesmo espírito da migração de catálogo do
// Onda 1.
function validateNoOrphans(tx: Tx) {
  const checks: [string, unknown[]][] = [
    [
      'dia(s) de treino órfão(s)',
      tx
        .select({ id: workoutDays.id })
        .from(workoutDays)
        .leftJoin(workoutPlans, eq(workoutDays.planId, workoutPlans.id))
        .where(isNull(workoutPlans.id))
        .all(),
    ],
    [
      'exercício(s) de plano com dia inexistente',
      tx
        .select({ id: workoutDayExercises.id })
        .from(workoutDayExercises)
        .leftJoin(workoutDays, eq(workoutDayExercises.dayId, workoutDays.id))
        .where(isNull(workoutDays.id))
        .all(),
    ],
    [
      'exercício(s) de plano referenciando catálogo inexistente',
      tx
        .select({ id: workoutDayExercises.id })
        .from(workoutDayExercises)
        .leftJoin(exercises, eq(workoutDayExercises.exerciseId, exercises.id))
        .where(isNull(exercises.id))
        .all(),
    ],
    [
      'sessão(ões) órfã(s)',
      tx
        .select({ id: sessions.id })
        .from(sessions)
        .leftJoin(workoutDays, eq(sessions.workoutDayId, workoutDays.id))
        .where(isNull(workoutDays.id))
        .all(),
    ],
    [
      'exercício(s) avulso(s) com sessão inexistente',
      tx
        .select({ id: sessionExtraExercises.id })
        .from(sessionExtraExercises)
        .leftJoin(sessions, eq(sessionExtraExercises.sessionId, sessions.id))
        .where(isNull(sessions.id))
        .all(),
    ],
    [
      'exercício(s) avulso(s) referenciando catálogo inexistente',
      tx
        .select({ id: sessionExtraExercises.id })
        .from(sessionExtraExercises)
        .leftJoin(exercises, eq(sessionExtraExercises.exerciseId, exercises.id))
        .where(isNull(exercises.id))
        .all(),
    ],
    [
      'pulo(s) de exercício com sessão inexistente',
      tx
        .select({ id: sessionSkips.id })
        .from(sessionSkips)
        .leftJoin(sessions, eq(sessionSkips.sessionId, sessions.id))
        .where(isNull(sessions.id))
        .all(),
    ],
    [
      'pulo(s) de exercício com exercício-de-plano inexistente',
      tx
        .select({ id: sessionSkips.id })
        .from(sessionSkips)
        .leftJoin(workoutDayExercises, eq(sessionSkips.workoutDayExerciseId, workoutDayExercises.id))
        .where(isNull(workoutDayExercises.id))
        .all(),
    ],
    [
      'série(s) com sessão inexistente',
      tx
        .select({ id: setLogs.id })
        .from(setLogs)
        .leftJoin(sessions, eq(setLogs.sessionId, sessions.id))
        .where(isNull(sessions.id))
        .all(),
    ],
    [
      'série(s) referenciando catálogo inexistente',
      tx
        .select({ id: setLogs.id })
        .from(setLogs)
        .leftJoin(exercises, eq(setLogs.exerciseId, exercises.id))
        .where(isNull(exercises.id))
        .all(),
    ],
  ];

  for (const [description, rows] of checks) {
    if (rows.length > 0) {
      throw new Error(`Validação falhou: ${rows.length} ${description} após a importação.`);
    }
  }
}

/** Restaura um backup dentro de uma única transação síncrona — qualquer erro
 * no meio reverte tudo (o banco fica exatamente como estava antes). */
export function importBackupPayload(payload: BackupPayload, mode: ImportMode): ImportSummary {
  return db.transaction((tx) => {
    const summary = emptySummary();

    if (mode === 'replace') {
      wipeUserData(tx);
    }

    const wgerIdMap = buildWgerIdMap(tx);

    const planIdMap = restorePlans(tx, payload.workoutPlans, mode, summary);
    const dayIdMap = restoreDays(tx, payload.workoutDays, planIdMap, mode, summary);
    const dayExerciseIdMap = restoreDayExercises(tx, payload.workoutDayExercises, dayIdMap, wgerIdMap, mode, summary);
    const sessionIdMap = restoreSessions(tx, payload.sessions, dayIdMap, mode, summary);
    restoreExtraExercises(tx, payload.sessionExtraExercises, sessionIdMap, wgerIdMap, mode, summary);
    restoreSkips(tx, payload.sessionSkips, sessionIdMap, dayExerciseIdMap, mode, summary);
    restoreSetLogs(tx, payload.setLogs, sessionIdMap, wgerIdMap, mode, summary);
    restoreBodyWeightLogs(tx, payload.bodyWeightLogs, mode, summary);
    restoreDeloadWeeks(tx, payload.deloadWeeks, mode, summary);
    restoreExercisePreferences(tx, payload.exercisePreferences, mode, summary);
    restoreExerciseSubstitutions(tx, payload.exerciseSubstitutions, mode, summary);

    validateNoOrphans(tx);

    return summary;
  });
}
