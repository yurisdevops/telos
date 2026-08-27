import { eq } from 'drizzle-orm';

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
import { FORMAT_VERSION, type BackupPayload } from './types';

/** Lê os dados do usuário (nunca o catálogo de exercícios, que vem do seed) e
 * monta o payload de backup. Referências a exercício viajam por `wgerId`
 * (estável entre catálogos/dispositivos), nunca por `exercises.id` (o
 * catálogo já foi remapeado uma vez e pode mudar de novo no futuro). */
export async function buildBackupPayload(): Promise<BackupPayload> {
  const [
    plans,
    days,
    dayExercises,
    sessionRows,
    extraExercises,
    skips,
    logs,
    allExercises,
    weightLogs,
    deloadWeekRows,
    preferenceRows,
    substitutionRows,
    profileRows,
    measurementRows,
    cardioSessionRows,
    cardioLogRows,
  ] = await Promise.all([
    db.select().from(workoutPlans),
    db.select().from(workoutDays),
    db.select().from(workoutDayExercises),
    db.select().from(sessions),
    db.select().from(sessionExtraExercises),
    db.select().from(sessionSkips),
    db.select().from(setLogs),
    db.select({ id: exercises.id, wgerId: exercises.wgerId, nome: exercises.nome }).from(exercises),
    db.select().from(bodyWeightLogs),
    db.select().from(deloadWeeks),
    db.select().from(exercisePreferences),
    db.select().from(exerciseSubstitutions),
    db.select().from(userProfile).where(eq(userProfile.id, USER_PROFILE_ID)),
    db.select().from(bodyMeasurements),
    db.select().from(cardioSessions),
    db.select().from(cardioLogs),
  ]);
  const profile = profileRows[0];

  const exerciseById = new Map(allExercises.map((e) => [e.id, e]));
  const resolveExercise = (exerciseId: number) => {
    const ex = exerciseById.get(exerciseId);
    return { wgerId: ex?.wgerId ?? -1, nome: ex?.nome ?? 'Exercício desconhecido' };
  };

  const nomeByWgerId = new Map(allExercises.map((e) => [e.wgerId, e.nome]));
  const resolveNomeByWgerId = (wgerId: number) => nomeByWgerId.get(wgerId) ?? 'Exercício desconhecido';

  return {
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'telos',
    workoutPlans: plans.map((p) => ({ id: p.id, nome: p.nome, tipo: p.tipo, criadoEm: p.criadoEm })),
    workoutDays: days.map((d) => ({ id: d.id, planId: d.planId, label: d.label, ordem: d.ordem })),
    workoutDayExercises: dayExercises.map((de) => {
      const ex = resolveExercise(de.exerciseId);
      return {
        id: de.id,
        dayId: de.dayId,
        exerciseWgerId: ex.wgerId,
        exerciseNomeSnapshot: ex.nome,
        seriesAlvo: de.seriesAlvo,
        repsAlvo: de.repsAlvo,
        cargaAlvo: de.cargaAlvo,
        ordem: de.ordem,
        supersetGroup: de.supersetGroup,
      };
    }),
    sessions: sessionRows.map((s) => ({
      id: s.id,
      workoutDayId: s.workoutDayId,
      data: s.data,
      concluida: s.concluida,
      horaInicio: s.horaInicio,
      horaFim: s.horaFim,
      restTimerStartedAt: s.restTimerStartedAt,
      restTimerDurationSeconds: s.restTimerDurationSeconds,
      foraDaAcademia: s.foraDaAcademia,
    })),
    sessionExtraExercises: extraExercises.map((se) => {
      const ex = resolveExercise(se.exerciseId);
      return {
        id: se.id,
        sessionId: se.sessionId,
        exerciseWgerId: ex.wgerId,
        exerciseNomeSnapshot: ex.nome,
        seriesAlvo: se.seriesAlvo,
        repsAlvo: se.repsAlvo,
        cargaAlvo: se.cargaAlvo,
        ordem: se.ordem,
      };
    }),
    sessionSkips: skips.map((sk) => ({
      id: sk.id,
      sessionId: sk.sessionId,
      workoutDayExerciseId: sk.workoutDayExerciseId,
    })),
    setLogs: logs.map((log) => {
      const ex = resolveExercise(log.exerciseId);
      return {
        id: log.id,
        sessionId: log.sessionId,
        exerciseWgerId: ex.wgerId,
        exerciseNomeSnapshot: ex.nome,
        numeroSerie: log.numeroSerie,
        reps: log.reps,
        carga: log.carga,
        rpe: log.rpe,
        pesoCorporal: log.pesoCorporal,
        aquecimento: log.aquecimento,
      };
    }),
    bodyWeightLogs: weightLogs.map((w) => ({ id: w.id, data: w.data, pesoKg: w.pesoKg })),
    deloadWeeks: deloadWeekRows.map((d) => ({ id: d.id, weekStartIso: d.weekStartIso })),
    bodyMeasurements: measurementRows.map((m) => ({
      id: m.id,
      data: m.data,
      ombrosCm: m.ombrosCm,
      peitoCm: m.peitoCm,
      cinturaCm: m.cinturaCm,
      quadrilCm: m.quadrilCm,
      bracoEsqCm: m.bracoEsqCm,
      bracoDirCm: m.bracoDirCm,
      antebracoEsqCm: m.antebracoEsqCm,
      antebracoDirCm: m.antebracoDirCm,
      coxaEsqCm: m.coxaEsqCm,
      coxaDirCm: m.coxaDirCm,
      panturrilhaEsqCm: m.panturrilhaEsqCm,
      panturrilhaDirCm: m.panturrilhaDirCm,
      bracoCm: m.bracoCm,
      coxaCm: m.coxaCm,
      panturrilhaCm: m.panturrilhaCm,
    })),
    exercisePreferences: preferenceRows.map((p) => ({
      id: p.id,
      exerciseWgerId: p.exerciseWgerId,
      exerciseNomeSnapshot: resolveNomeByWgerId(p.exerciseWgerId),
      favorito: p.favorito,
      nota: p.nota,
    })),
    exerciseSubstitutions: substitutionRows.map((s) => ({
      id: s.id,
      previousExerciseWgerId: s.previousExerciseWgerId,
      previousExerciseNomeSnapshot: resolveNomeByWgerId(s.previousExerciseWgerId),
      newExerciseWgerId: s.newExerciseWgerId,
      newExerciseNomeSnapshot: resolveNomeByWgerId(s.newExerciseWgerId),
      substitutedAt: s.substitutedAt,
    })),
    // `profile.pinHash`/`profile.pinSalt` NUNCA entram aqui de propósito —
    // trava local ao device, ver comentário em BackupUserProfile (types.ts).
    // `sexo`/`lastCelebrationMonth` entram normalmente.
    userProfile: profile
      ? {
          nome: profile.nome,
          alturaCm: profile.alturaCm,
          experiencia: profile.experiencia,
          fotoUri: profile.fotoUri,
          lastSeenChangelogVersion: profile.lastSeenChangelogVersion,
          sexo: profile.sexo,
          lastCelebrationMonth: profile.lastCelebrationMonth,
        }
      : null,
    cardioSessions: cardioSessionRows.map((cs) => ({
      id: cs.id,
      data: cs.data,
      horaInicio: cs.horaInicio,
      horaFim: cs.horaFim,
      concluida: cs.concluida,
      obs: cs.obs,
    })),
    cardioLogs: cardioLogRows.map((cl) => ({
      id: cl.id,
      sessionId: cl.sessionId,
      cardioSessionId: cl.cardioSessionId,
      modalidade: cl.modalidade,
      duracaoMin: cl.duracaoMin,
      distanciaKm: cl.distanciaKm,
      intensidade: cl.intensidade,
    })),
  };
}
