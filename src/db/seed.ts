import { Alert } from 'react-native';
import { eq, inArray, isNull, sql } from 'drizzle-orm';

import seedData from '@/assets/data/seed_final.json';

import { db } from './index';
import { exercises, setLogs, workoutDayExercises } from './schema';

type SeedExercise = {
  wgerId: number;
  nome: string;
  nome_en: string;
  categoria: string;
  equipamento: string[];
  musculos: string[];
  musculos_secundarios: string[];
  descricao: string | null;
  dica: string | null;
};

const CHUNK_SIZE = 100;
const TARGET_COUNT = (seedData as SeedExercise[]).length;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Catálogo 2026-07: 66 duplicatas/registros mal classificados removidos, 33
 * máquinas comuns adicionadas, 16 registros corrigidos in-place. Cada wgerId
 * removido aqui mapeia para o equivalente anatomicamente correto que
 * permaneceu no catálogo — aprovado manualmente antes de aplicar, para que
 * qualquer referência viva (plano ou histórico) seja repontada em vez de
 * deixada órfã.
 */
const REMOVED_TO_EQUIVALENT: Record<number, number> = {
  154: 152, // Barra fixa supinada
  188: 1112, // Flexão declinada
  282: 907, // Flexão parada de mão
  289: 1187, // Puxada alta (high pull)
  313: 1111, // Flexão inclinada
  320: 1669, // Polichinelos
  513: 919, // Remada cavalinho (T-bar)
  525: 84, // Remada curvada invertida
  572: 1645, // Encolhimento com halteres
  694: 1229, // Remada alta com halteres
  829: 487, // Elevação posterior (deltoide posterior)
  851: 369, // Cadeira extensora
  924: 237, // Crucifixo na polia
  960: 331, // Kettlebell swing
  998: 997, // Burpee sem flexão
  1085: 81, // Remada curvada com halteres
  1106: 1105, // Recolhimento de joelhos sentado
  1117: 921, // Remada baixa sentada na polia
  1143: 1348, // Extensão lombar
  1271: 1270, // Crucifixo na polia baixa
  1272: 1270, // Crucifixo na polia baixa
  1276: 537, // Supino inclinado com halteres
  1277: 537, // Supino inclinado com halteres
  1278: 75, // Supino com halteres
  1297: 246, // Tríceps testa com barra W
  1312: 1315, // Agachamento livre (peso corporal)
  1313: 377, // Elevação de pernas deitado
  1314: 1316, // Polichinelo
  1319: 167, // Abdominal
  1337: 567, // Desenvolvimento com halteres
  1366: 1706, // Agachamento búlgaro com halteres
  1388: 1211, // Levantamento terra romeno unilateral
  1389: 1211, // Levantamento terra romeno unilateral
  1392: 268, // Bom dia (good morning)
  1466: 148, // Panturrilha na máquina hack
  1491: 1621, // Remada unilateral na polia
  1494: 590, // Panturrilha sentado
  1499: 245, // Tríceps testa com halteres
  1500: 1496, // Variação de peito superior com halteres
  1515: 146, // Panturrilha no leg press
  1531: 95, // Rosca direta na polia
  1549: 1548, // Escada (stair master)
  1583: 498, // Supino pegada supinada
  1594: 1593, // Agachamento afundo no smith
  1614: 1642, // Elevação pélvica com halter
  1627: 1805, // Agachamento com barra
  1636: 1621, // Remada unilateral na polia
  1643: 308, // Crucifixo inclinado com halteres
  1654: 1744, // Elevação lateral na máquina
  1655: 1883, // Supino na máquina
  1661: 659, // Tríceps na polia
  1674: 1084, // Supino no chão com halteres
  1675: 1551, // Flexão de braço
  1676: 75, // Supino com Halteres
  1695: 1542, // Barra fixa (pegada aberta)
  1746: 1084, // Supino no chão com halteres
  1749: 549, // Tríceps francês sentado
  1750: 507, // Levantamento terra romeno
  1763: 1757, // Supino
  1765: 1542, // Barra fixa (pegada aberta)
  1793: 1778, // Supino inclinado
  1798: 1757, // Supino
  1800: 1778, // Supino inclinado
  1806: 355, // Puxada alta
  1880: 1542, // Barra fixa pegada aberta
  1933: 172, // Abdominal na máquina
};

const REMOVED_WGER_IDS = Object.keys(REMOVED_TO_EQUIVALENT).map(Number);

function toRow(item: SeedExercise) {
  return {
    wgerId: item.wgerId,
    nome: item.nome,
    nomeEn: item.nome_en,
    categoria: item.categoria,
    equipamento: JSON.stringify(item.equipamento),
    musculos: JSON.stringify(item.musculos),
    musculosSecundarios: JSON.stringify(item.musculos_secundarios),
    descricao: item.descricao,
    dica: item.dica,
  };
}

type RemapLogEntry = {
  removedWgerId: number;
  removedId: number;
  equivalenteWgerId: number;
  equivalenteId: number;
  dayExerciseRefs: number;
  setLogRefs: number;
};

type ValidationResult = {
  finalCount: number;
  orphanDayExercises: number;
  orphanSetLogs: number;
};

type ReconcileResult = {
  remapLog: RemapLogEntry[];
  validation: ValidationResult;
};

function validateCatalog(tx: Tx): ValidationResult {
  const countRow = tx.select({ count: sql<number>`count(*)` }).from(exercises).get();
  const finalCount = Number(countRow?.count ?? 0);
  if (finalCount !== TARGET_COUNT) {
    throw new Error(`esperado ${TARGET_COUNT} exercícios, encontrado ${finalCount}`);
  }

  const orphanDayExercises = tx
    .select({ id: workoutDayExercises.id })
    .from(workoutDayExercises)
    .leftJoin(exercises, eq(workoutDayExercises.exerciseId, exercises.id))
    .where(isNull(exercises.id))
    .all();
  if (orphanDayExercises.length > 0) {
    throw new Error(`${orphanDayExercises.length} referência(s) órfã(s) em workout_day_exercises`);
  }

  const orphanSetLogs = tx
    .select({ id: setLogs.id })
    .from(setLogs)
    .leftJoin(exercises, eq(setLogs.exerciseId, exercises.id))
    .where(isNull(exercises.id))
    .all();
  if (orphanSetLogs.length > 0) {
    throw new Error(`${orphanSetLogs.length} referência(s) órfã(s) em set_logs`);
  }

  return { finalCount, orphanDayExercises: orphanDayExercises.length, orphanSetLogs: orphanSetLogs.length };
}

function reconcileCatalog(
  tx: Tx,
  existingRows: { id: number; wgerId: number }[]
): ReconcileResult {
  const idByWgerId = new Map(existingRows.map((row) => [row.wgerId, row.id]));

  // 1) Detectar quais dos removidos ainda existem como linha (candidatos a
  // estarem referenciados) e 2) repontar as referências para o equivalente
  // aprovado ANTES de tocar na tabela exercises.
  const stillPresentRemoved = existingRows.filter((row) => row.wgerId in REMOVED_TO_EQUIVALENT);
  const remapLog: RemapLogEntry[] = [];

  for (const row of stillPresentRemoved) {
    const equivalenteWgerId = REMOVED_TO_EQUIVALENT[row.wgerId];
    const equivalenteId = idByWgerId.get(equivalenteWgerId);

    if (equivalenteId === undefined) {
      // Não deveria acontecer (o equivalente é um registro que permanece no
      // catálogo novo), mas se acontecer é melhor abortar a transação
      // inteira do que arriscar deixar uma referência órfã.
      throw new Error(
        `equivalente wgerId=${equivalenteWgerId} não encontrado para remover wgerId=${row.wgerId} (id=${row.id})`
      );
    }

    const dayRes = tx
      .update(workoutDayExercises)
      .set({ exerciseId: equivalenteId })
      .where(eq(workoutDayExercises.exerciseId, row.id))
      .run();
    const logRes = tx
      .update(setLogs)
      .set({ exerciseId: equivalenteId })
      .where(eq(setLogs.exerciseId, row.id))
      .run();

    remapLog.push({
      removedWgerId: row.wgerId,
      removedId: row.id,
      equivalenteWgerId,
      equivalenteId,
      dayExerciseRefs: dayRes.changes,
      setLogRefs: logRes.changes,
    });
  }

  // 3) UPDATE por wgerId dos que permaneceram (inclui os 16 com dados
  // corrigidos) e 4) INSERT dos que ainda não existem no banco (os 33 novos).
  for (const item of seedData as SeedExercise[]) {
    const row = toRow(item);
    const existingId = idByWgerId.get(item.wgerId);
    if (existingId !== undefined) {
      tx.update(exercises).set(row).where(eq(exercises.id, existingId)).run();
    } else {
      tx.insert(exercises).values(row).run();
    }
  }

  // 5) DELETE dos removidos — só chega aqui depois que nada mais os referencia.
  tx.delete(exercises).where(inArray(exercises.wgerId, REMOVED_WGER_IDS)).run();

  const validation = validateCatalog(tx);
  return { remapLog, validation };
}

function logAndAlertResult(result: ReconcileResult) {
  const inUse = result.remapLog.filter((r) => r.dayExerciseRefs > 0 || r.setLogRefs > 0);

  console.log(
    `[catalog] Atualização 2026-07 aplicada: ${result.remapLog.length} exercício(s) removido(s) detectado(s) no banco, ${inUse.length} estavam em uso e foram remapeados.`
  );
  for (const r of result.remapLog) {
    console.log(
      `  wgerId ${r.removedWgerId} -> wgerId ${r.equivalenteWgerId} (planos: ${r.dayExerciseRefs}, séries no histórico: ${r.setLogRefs})`
    );
  }
  console.log(
    `[catalog] Validação: ${result.validation.finalCount} exercícios, ${result.validation.orphanDayExercises} órfã(s) em planos, ${result.validation.orphanSetLogs} órfã(s) em histórico.`
  );

  Alert.alert(
    'Catálogo de exercícios atualizado',
    inUse.length > 0
      ? `${inUse.length} exercício(s) que você usava foram substituídos pela versão corrigida. Seus planos e histórico continuam intactos (${result.validation.finalCount} exercícios no catálogo).`
      : `Catálogo atualizado para ${result.validation.finalCount} exercícios. Nenhum dos removidos estava em uso nos seus planos ou histórico.`
  );
}

export function seedDatabase() {
  try {
    const existingRows = db
      .select({ id: exercises.id, wgerId: exercises.wgerId })
      .from(exercises)
      .all();

    if (existingRows.length === 0) {
      // Instalação nova: nada a remapear, apenas inserir o catálogo inteiro.
      db.transaction((tx) => {
        const rows = (seedData as SeedExercise[]).map(toRow);
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          tx.insert(exercises).values(rows.slice(i, i + CHUNK_SIZE)).run();
        }
        validateCatalog(tx);
      });
      return;
    }

    const currentWgerIds = new Set(existingRows.map((row) => row.wgerId));
    const newWgerIds = (seedData as SeedExercise[]).map((item) => item.wgerId);
    const alreadyMigrated =
      existingRows.length === TARGET_COUNT &&
      REMOVED_WGER_IDS.every((id) => !currentWgerIds.has(id)) &&
      newWgerIds.every((id) => currentWgerIds.has(id));

    if (alreadyMigrated) {
      return;
    }

    const result = db.transaction((tx) => reconcileCatalog(tx, existingRows));
    logAndAlertResult(result);
  } catch (err) {
    console.error('[catalog] Falha na atualização do catálogo — banco revertido ao estado anterior:', err);
    Alert.alert(
      'Erro ao atualizar catálogo',
      `A atualização foi cancelada e o banco não foi alterado. Detalhe: ${String(err instanceof Error ? err.message : err)}`
    );
  }
}
