import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import { db } from '@/db';
import {
  bodyMeasurements,
  bodyWeightLogs,
  cardioLogs,
  cardioSessions,
  deloadWeeks,
  exercisePreferences,
  exercises,
  exerciseSubstitutions,
  sessionExtraExercises,
  sessionSkips,
  sessions,
  setLogs,
  userProfile,
  workoutDayExercises,
  workoutDays,
  workoutPlans,
} from '@/db/schema';
import { USER_PROFILE_ID } from '@/db/user-profile';

import type {
  BackupBodyMeasurement,
  BackupBodyWeightLog,
  BackupCardioLog,
  BackupCardioSession,
  BackupDeloadWeek,
  BackupExercisePreference,
  BackupExerciseSubstitution,
  BackupPayload,
  BackupSession,
  BackupSessionExtraExercise,
  BackupSessionSkip,
  BackupSetLog,
  BackupUserProfile,
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
    userProfile: 0,
    bodyMeasurements: 0,
    cardioSessions: 0,
    cardioLogs: 0,
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

// Ordem segura de FK — nunca toca no catálogo de exercícios. cardioLogs
// referencia sessions E cardioSessions (as duas FKs nullable, ver
// schema.ts) — apagada antes das duas, mesmo raciocínio de setLogs antes de
// sessions.
function wipeUserData(tx: Tx) {
  tx.delete(cardioLogs).run();
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
  tx.delete(bodyMeasurements).run();
  tx.delete(cardioSessions).run();
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
        foraDaAcademia: row.foraDaAcademia,
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
        pesoCorporal: row.pesoCorporal,
        aquecimento: row.aquecimento,
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

// Fundação de medidas corporais (Fase 1A) — mesmo molde de
// restoreBodyWeightLogs: standalone, merge por `data` (uma linha por dia).
function restoreBodyMeasurements(tx: Tx, rows: BackupBodyMeasurement[], mode: ImportMode, summary: ImportSummary) {
  const existing = mode === 'merge' ? tx.select().from(bodyMeasurements).all() : [];

  for (const row of rows) {
    if (mode === 'merge') {
      const alreadyExists = existing.some((e) => e.data === row.data);
      if (alreadyExists) {
        summary.reused.bodyMeasurements += 1;
        continue;
      }
    }

    tx.insert(bodyMeasurements)
      .values({
        data: row.data,
        ombrosCm: row.ombrosCm,
        peitoCm: row.peitoCm,
        cinturaCm: row.cinturaCm,
        quadrilCm: row.quadrilCm,
        bracoEsqCm: row.bracoEsqCm,
        bracoDirCm: row.bracoDirCm,
        antebracoEsqCm: row.antebracoEsqCm,
        antebracoDirCm: row.antebracoDirCm,
        coxaEsqCm: row.coxaEsqCm,
        coxaDirCm: row.coxaDirCm,
        panturrilhaEsqCm: row.panturrilhaEsqCm,
        panturrilhaDirCm: row.panturrilhaDirCm,
        // Legado (Fase 1B) — preservado por compatibilidade, ver types.ts.
        bracoCm: row.bracoCm,
        coxaCm: row.coxaCm,
        panturrilhaCm: row.panturrilhaCm,
      })
      .run();
    summary.inserted.bodyMeasurements += 1;
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

// Perfil — linha única (id fixo = 1, garantida por ensureUserProfileRow no
// boot), por isso não segue o padrão merge-por-chave-natural das demais:
// aqui é sempre upsert incondicional (mesmo em modo "merge"), já que não há
// "outra linha" possível pra desambiguar contra. `fotoUri` é só uma string
// de caminho — nenhuma verificação de existência do arquivo acontece aqui
// (fica pra quando a etapa 5, de foto, for implementada).
//
// `pinHash`/`pinSalt` NUNCA aparecem em `values`/`set` abaixo, de propósito —
// `BackupUserProfile` nem tem esses campos (ver types.ts). O `SET` do
// `onConflictDoUpdate` só toca nas colunas listadas explicitamente; como
// pinHash/pinSalt nunca são mencionados, o UPDATE nunca os zera — o PIN
// local do device sobrevive intacto a qualquer restauração de backup.
function restoreUserProfile(tx: Tx, row: BackupUserProfile | null, summary: ImportSummary) {
  if (!row) return;

  tx.insert(userProfile)
    .values({
      id: USER_PROFILE_ID,
      nome: row.nome,
      alturaCm: row.alturaCm,
      experiencia: row.experiencia,
      fotoUri: row.fotoUri,
      lastSeenChangelogVersion: row.lastSeenChangelogVersion,
      sexo: row.sexo,
      lastCelebrationMonth: row.lastCelebrationMonth,
      metaCardioMinutosSemana: row.metaCardioMinutosSemana,
    })
    .onConflictDoUpdate({
      target: userProfile.id,
      set: {
        nome: row.nome,
        alturaCm: row.alturaCm,
        experiencia: row.experiencia,
        fotoUri: row.fotoUri,
        lastSeenChangelogVersion: row.lastSeenChangelogVersion,
        sexo: row.sexo,
        lastCelebrationMonth: row.lastCelebrationMonth,
        metaCardioMinutosSemana: row.metaCardioMinutosSemana,
      },
    })
    .run();
  summary.inserted.userProfile += 1;
}

// Fundação de cardio (Etapa A) — cardioSessions é standalone do NÚCLEO
// (sessions/workoutPlans), mas precisa de idMap de retorno porque
// cardioLogs pode referenciá-la (diferente de restoreBodyWeightLogs/
// restoreDeloadWeeks, que nada referencia). Merge por `(data, horaInicio)`:
// mesmo dia E mesmo horário de início é o par mais estável disponível pra
// reconhecer "a mesma sessão de cardio" sem um FK-pai como workoutDayId
// (que a sessão de força usa) pra ajudar a desambiguar.
function restoreCardioSessions(
  tx: Tx,
  rows: BackupCardioSession[],
  mode: ImportMode,
  summary: ImportSummary
): Map<number, number> {
  const idMap = new Map<number, number>();
  const existing = mode === 'merge' ? tx.select().from(cardioSessions).all() : [];

  for (const row of rows) {
    if (mode === 'merge') {
      const candidates = existing.filter((e) => e.data === row.data && e.horaInicio === row.horaInicio);
      if (candidates.length === 1) {
        idMap.set(row.id, candidates[0].id);
        summary.reused.cardioSessions += 1;
        continue;
      }
      if (candidates.length > 1) {
        summary.ambiguous.cardioSessions += 1;
      }
    }

    const created = tx
      .insert(cardioSessions)
      .values({
        data: row.data,
        horaInicio: row.horaInicio,
        horaFim: row.horaFim,
        concluida: row.concluida,
        obs: row.obs,
      })
      .returning()
      .get();
    idMap.set(row.id, created.id);
    summary.inserted.cardioSessions += 1;
  }

  return idMap;
}

// Bloco de cardio — usa QUAL dos 2 mapas de id conforme qual campo o backup
// trouxe preenchido (validate.ts já garante que é exatamente um dos dois,
// nunca os dois nem nenhum). Se o lado preenchido não resolver no mapa
// correspondente (a sessão-pai não foi restaurada, ex: merge que reusou uma
// diferente), a linha inteira é pulada — mesmo critério de "FK-pai não
// resolvida = pula" já usado em restoreSetLogs/restoreExtraExercises/
// restoreSkips.
function restoreCardioLogs(
  tx: Tx,
  rows: BackupCardioLog[],
  sessionIdMap: Map<number, number>,
  cardioSessionIdMap: Map<number, number>,
  mode: ImportMode,
  summary: ImportSummary
) {
  const existing = mode === 'merge' ? tx.select().from(cardioLogs).all() : [];

  for (const row of rows) {
    let localSessionId: number | null = null;
    if (row.sessionId != null) {
      const resolved = sessionIdMap.get(row.sessionId);
      if (resolved === undefined) continue;
      localSessionId = resolved;
    }

    let localCardioSessionId: number | null = null;
    if (row.cardioSessionId != null) {
      const resolved = cardioSessionIdMap.get(row.cardioSessionId);
      if (resolved === undefined) continue;
      localCardioSessionId = resolved;
    }

    if (mode === 'merge') {
      const candidates = existing.filter(
        (e) =>
          e.sessionId === localSessionId &&
          e.cardioSessionId === localCardioSessionId &&
          e.modalidade === row.modalidade &&
          e.duracaoMin === row.duracaoMin
      );
      if (candidates.length === 1) {
        summary.reused.cardioLogs += 1;
        continue;
      }
      if (candidates.length > 1) {
        summary.ambiguous.cardioLogs += 1;
      }
    }

    tx.insert(cardioLogs)
      .values({
        sessionId: localSessionId,
        cardioSessionId: localCardioSessionId,
        modalidade: row.modalidade,
        duracaoMin: row.duracaoMin,
        distanciaKm: row.distanciaKm,
        intensidade: row.intensidade,
      })
      .run();
    summary.inserted.cardioLogs += 1;
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
    [
      'bloco(s) de cardio com sessão de força inexistente',
      tx
        .select({ id: cardioLogs.id })
        .from(cardioLogs)
        .leftJoin(sessions, eq(cardioLogs.sessionId, sessions.id))
        .where(and(isNotNull(cardioLogs.sessionId), isNull(sessions.id)))
        .all(),
    ],
    [
      'bloco(s) de cardio com sessão de cardio inexistente',
      tx
        .select({ id: cardioLogs.id })
        .from(cardioLogs)
        .leftJoin(cardioSessions, eq(cardioLogs.cardioSessionId, cardioSessions.id))
        .where(and(isNotNull(cardioLogs.cardioSessionId), isNull(cardioSessions.id)))
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
    restoreUserProfile(tx, payload.userProfile, summary);
    restoreBodyMeasurements(tx, payload.bodyMeasurements, mode, summary);

    // cardioSessions antes de cardioLogs (cardioLogs pode referenciá-la);
    // sessionIdMap já existe desde restoreSessions acima — cardioLogs pode
    // depender dela também (modo A, bloco dentro de treino de força).
    const cardioSessionIdMap = restoreCardioSessions(tx, payload.cardioSessions, mode, summary);
    restoreCardioLogs(tx, payload.cardioLogs, sessionIdMap, cardioSessionIdMap, mode, summary);

    validateNoOrphans(tx);

    return summary;
  });
}
