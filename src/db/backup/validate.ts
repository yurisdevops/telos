import { FORMAT_VERSION, type BackupPayload } from './types';

export class BackupValidationError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertArray(value: unknown, field: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new BackupValidationError(`Campo "${field}" deveria ser uma lista.`);
  }
}

function assertNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BackupValidationError(`Campo "${field}" deveria ser um número.`);
  }
}

function assertNullableNumber(value: unknown, field: string): asserts value is number | null {
  if (value !== null) assertNumber(value, field);
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new BackupValidationError(`Campo "${field}" deveria ser texto.`);
  }
}

function assertBoolean(value: unknown, field: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new BackupValidationError(`Campo "${field}" deveria ser verdadeiro/falso.`);
  }
}

// Campo opcional (aceita ausência, pra backups gerados antes dessa feature
// existir) além de string/null — normalizado explicitamente pra `null`
// logo depois de validado, nunca deixado como `undefined`.
function assertOptionalNullableString(
  value: unknown,
  field: string
): asserts value is string | null | undefined {
  if (value !== undefined && value !== null) assertString(value, field);
}

function assertOptionalNullableNumber(
  value: unknown,
  field: string
): asserts value is number | null | undefined {
  if (value !== undefined && value !== null) assertNumber(value, field);
}

/** Validação estrutural pura (sem tocar no banco). Lança BackupValidationError
 * com mensagem clara em caso de arquivo inválido — nunca escreve nada. */
export function assertValidBackupPayload(json: unknown): BackupPayload {
  if (!isRecord(json)) {
    throw new BackupValidationError('Arquivo inválido: o conteúdo não é um backup do Telos.');
  }
  if (json.app !== 'telos') {
    throw new BackupValidationError('Arquivo inválido: o conteúdo não é um backup do Telos.');
  }
  if (json.formatVersion !== FORMAT_VERSION) {
    throw new BackupValidationError(
      `Versão de backup não suportada (${String(json.formatVersion)}). Este app só sabe ler a versão ${FORMAT_VERSION}.`
    );
  }

  assertArray(json.workoutPlans, 'workoutPlans');
  assertArray(json.workoutDays, 'workoutDays');
  assertArray(json.workoutDayExercises, 'workoutDayExercises');
  assertArray(json.sessions, 'sessions');
  assertArray(json.sessionExtraExercises, 'sessionExtraExercises');
  assertArray(json.sessionSkips, 'sessionSkips');
  assertArray(json.setLogs, 'setLogs');

  // Tabelas da Onda 4 — ausentes em backups antigos, nunca tiveram essa
  // chave no JSON. Checagem estrita por `undefined` (não `Array.isArray(...)
  // ? ... : []`), pra um `null` genuíno continuar sendo rejeitado como erro
  // real em vez de mascarado.
  if (json.bodyWeightLogs === undefined) json.bodyWeightLogs = [];
  if (json.deloadWeeks === undefined) json.deloadWeeks = [];
  assertArray(json.bodyWeightLogs, 'bodyWeightLogs');
  assertArray(json.deloadWeeks, 'deloadWeeks');

  // Tabelas da Onda 5 — mesma regra de ausência.
  if (json.exercisePreferences === undefined) json.exercisePreferences = [];
  if (json.exerciseSubstitutions === undefined) json.exerciseSubstitutions = [];
  assertArray(json.exercisePreferences, 'exercisePreferences');
  assertArray(json.exerciseSubstitutions, 'exerciseSubstitutions');

  json.workoutPlans.forEach((row, index) => {
    if (!isRecord(row)) throw new BackupValidationError(`workoutPlans[${index}] inválido.`);
    assertNumber(row.id, `workoutPlans[${index}].id`);
    assertString(row.nome, `workoutPlans[${index}].nome`);
    assertString(row.tipo, `workoutPlans[${index}].tipo`);
    assertString(row.criadoEm, `workoutPlans[${index}].criadoEm`);
  });

  json.workoutDays.forEach((row, index) => {
    if (!isRecord(row)) throw new BackupValidationError(`workoutDays[${index}] inválido.`);
    assertNumber(row.id, `workoutDays[${index}].id`);
    assertNumber(row.planId, `workoutDays[${index}].planId`);
    assertString(row.label, `workoutDays[${index}].label`);
    assertNumber(row.ordem, `workoutDays[${index}].ordem`);
  });

  json.workoutDayExercises.forEach((row, index) => {
    if (!isRecord(row)) throw new BackupValidationError(`workoutDayExercises[${index}] inválido.`);
    assertNumber(row.id, `workoutDayExercises[${index}].id`);
    assertNumber(row.dayId, `workoutDayExercises[${index}].dayId`);
    assertNumber(row.exerciseWgerId, `workoutDayExercises[${index}].exerciseWgerId`);
    assertString(row.exerciseNomeSnapshot, `workoutDayExercises[${index}].exerciseNomeSnapshot`);
    assertNumber(row.seriesAlvo, `workoutDayExercises[${index}].seriesAlvo`);
    assertNumber(row.repsAlvo, `workoutDayExercises[${index}].repsAlvo`);
    assertNullableNumber(row.cargaAlvo, `workoutDayExercises[${index}].cargaAlvo`);
    assertNumber(row.ordem, `workoutDayExercises[${index}].ordem`);
    assertOptionalNullableString(row.supersetGroup, `workoutDayExercises[${index}].supersetGroup`);
    if (row.supersetGroup === undefined) row.supersetGroup = null;
  });

  json.sessions.forEach((row, index) => {
    if (!isRecord(row)) throw new BackupValidationError(`sessions[${index}] inválido.`);
    assertNumber(row.id, `sessions[${index}].id`);
    assertNumber(row.workoutDayId, `sessions[${index}].workoutDayId`);
    assertString(row.data, `sessions[${index}].data`);
    assertBoolean(row.concluida, `sessions[${index}].concluida`);
    assertNullableNumber(row.horaInicio, `sessions[${index}].horaInicio`);
    assertNullableNumber(row.horaFim, `sessions[${index}].horaFim`);
    assertNullableNumber(row.restTimerStartedAt, `sessions[${index}].restTimerStartedAt`);
    assertNullableNumber(row.restTimerDurationSeconds, `sessions[${index}].restTimerDurationSeconds`);
  });

  json.sessionExtraExercises.forEach((row, index) => {
    if (!isRecord(row)) throw new BackupValidationError(`sessionExtraExercises[${index}] inválido.`);
    assertNumber(row.id, `sessionExtraExercises[${index}].id`);
    assertNumber(row.sessionId, `sessionExtraExercises[${index}].sessionId`);
    assertNumber(row.exerciseWgerId, `sessionExtraExercises[${index}].exerciseWgerId`);
    assertString(row.exerciseNomeSnapshot, `sessionExtraExercises[${index}].exerciseNomeSnapshot`);
    assertNumber(row.seriesAlvo, `sessionExtraExercises[${index}].seriesAlvo`);
    assertNumber(row.repsAlvo, `sessionExtraExercises[${index}].repsAlvo`);
    assertNullableNumber(row.cargaAlvo, `sessionExtraExercises[${index}].cargaAlvo`);
    assertNumber(row.ordem, `sessionExtraExercises[${index}].ordem`);
  });

  json.sessionSkips.forEach((row, index) => {
    if (!isRecord(row)) throw new BackupValidationError(`sessionSkips[${index}] inválido.`);
    assertNumber(row.id, `sessionSkips[${index}].id`);
    assertNumber(row.sessionId, `sessionSkips[${index}].sessionId`);
    assertNumber(row.workoutDayExerciseId, `sessionSkips[${index}].workoutDayExerciseId`);
  });

  json.setLogs.forEach((row, index) => {
    if (!isRecord(row)) throw new BackupValidationError(`setLogs[${index}] inválido.`);
    assertNumber(row.id, `setLogs[${index}].id`);
    assertNumber(row.sessionId, `setLogs[${index}].sessionId`);
    assertNumber(row.exerciseWgerId, `setLogs[${index}].exerciseWgerId`);
    assertString(row.exerciseNomeSnapshot, `setLogs[${index}].exerciseNomeSnapshot`);
    assertNumber(row.numeroSerie, `setLogs[${index}].numeroSerie`);
    assertNumber(row.reps, `setLogs[${index}].reps`);
    assertNumber(row.carga, `setLogs[${index}].carga`);
    assertOptionalNullableNumber(row.rpe, `setLogs[${index}].rpe`);
    if (row.rpe === undefined) row.rpe = null;
  });

  json.bodyWeightLogs.forEach((row, index) => {
    if (!isRecord(row)) throw new BackupValidationError(`bodyWeightLogs[${index}] inválido.`);
    assertNumber(row.id, `bodyWeightLogs[${index}].id`);
    assertString(row.data, `bodyWeightLogs[${index}].data`);
    assertNumber(row.pesoKg, `bodyWeightLogs[${index}].pesoKg`);
  });

  json.deloadWeeks.forEach((row, index) => {
    if (!isRecord(row)) throw new BackupValidationError(`deloadWeeks[${index}] inválido.`);
    assertNumber(row.id, `deloadWeeks[${index}].id`);
    assertString(row.weekStartIso, `deloadWeeks[${index}].weekStartIso`);
  });

  json.exercisePreferences.forEach((row, index) => {
    if (!isRecord(row)) throw new BackupValidationError(`exercisePreferences[${index}] inválido.`);
    assertNumber(row.id, `exercisePreferences[${index}].id`);
    assertNumber(row.exerciseWgerId, `exercisePreferences[${index}].exerciseWgerId`);
    assertString(row.exerciseNomeSnapshot, `exercisePreferences[${index}].exerciseNomeSnapshot`);
    assertBoolean(row.favorito, `exercisePreferences[${index}].favorito`);
    assertOptionalNullableString(row.nota, `exercisePreferences[${index}].nota`);
    if (row.nota === undefined) row.nota = null;
  });

  json.exerciseSubstitutions.forEach((row, index) => {
    if (!isRecord(row)) throw new BackupValidationError(`exerciseSubstitutions[${index}] inválido.`);
    assertNumber(row.id, `exerciseSubstitutions[${index}].id`);
    assertNumber(row.previousExerciseWgerId, `exerciseSubstitutions[${index}].previousExerciseWgerId`);
    assertString(row.previousExerciseNomeSnapshot, `exerciseSubstitutions[${index}].previousExerciseNomeSnapshot`);
    assertNumber(row.newExerciseWgerId, `exerciseSubstitutions[${index}].newExerciseWgerId`);
    assertString(row.newExerciseNomeSnapshot, `exerciseSubstitutions[${index}].newExerciseNomeSnapshot`);
    assertString(row.substitutedAt, `exerciseSubstitutions[${index}].substitutedAt`);
  });

  return json as unknown as BackupPayload;
}
