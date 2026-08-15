import { eq } from 'drizzle-orm';

import { db } from './index';
import { exercises, sessions, workoutDayExercises, workoutDays, workoutPlans } from './schema';
import { getTodayDateString } from '@/lib/date';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ReadyWorkoutExercise = { wgerId: number; seriesAlvo: number; repsAlvo: number };
export type ReadyWorkoutCategoria = 'completo' | 'focado';
export type ReadyWorkout = {
  key: string;
  nome: string;
  subtitulo: string;
  categoria: ReadyWorkoutCategoria;
  exercises: ReadyWorkoutExercise[];
};

/**
 * Catálogo de treinos prontos — cada um é UMA sessão (lista de exercícios),
 * não um plano de vários dias como `TEMPLATES` (templates.ts). wgerIds
 * validados contra o catálogo atual antes de escrever aqui. Séries/reps são
 * só ponto de partida (perfil de hipertrofia, sem perguntar objetivo — é o
 * caminho sem configuração) — editável no treino como qualquer outro plano.
 */
export const READY_WORKOUTS: ReadyWorkout[] = [
  {
    key: 'peito_triceps',
    nome: 'Peitoral & Tríceps — Empurrão Total',
    subtitulo: 'Peito, ombro e tríceps',
    categoria: 'completo',
    exercises: [
      { wgerId: 73, seriesAlvo: 4, repsAlvo: 8 }, // Supino reto
      { wgerId: 538, seriesAlvo: 4, repsAlvo: 8 }, // Supino inclinado com barra
      { wgerId: 1904, seriesAlvo: 3, repsAlvo: 12 }, // Peck deck (voador)
      { wgerId: 567, seriesAlvo: 4, repsAlvo: 8 }, // Desenvolvimento com halteres
      { wgerId: 348, seriesAlvo: 3, repsAlvo: 12 }, // Elevação lateral
      { wgerId: 659, seriesAlvo: 3, repsAlvo: 12 }, // Tríceps na polia
      { wgerId: 50, seriesAlvo: 3, repsAlvo: 12 }, // Tríceps testa com barra
    ],
  },
  {
    key: 'costas_biceps',
    nome: 'Costas & Bíceps — Puxada Pesada',
    subtitulo: 'Dorsais e bíceps',
    categoria: 'completo',
    exercises: [
      { wgerId: 152, seriesAlvo: 4, repsAlvo: 8 }, // Barra fixa supinada
      { wgerId: 355, seriesAlvo: 4, repsAlvo: 10 }, // Puxada Alta
      { wgerId: 83, seriesAlvo: 4, repsAlvo: 8 }, // Remada Curvada
      { wgerId: 921, seriesAlvo: 3, repsAlvo: 12 }, // Remada baixa sentada na polia
      { wgerId: 91, seriesAlvo: 3, repsAlvo: 12 }, // Rosca direta com barra reta
      { wgerId: 1932, seriesAlvo: 3, repsAlvo: 12 }, // Rosca martelo
    ],
  },
  {
    key: 'pernas_completo',
    nome: 'Pernas Completo — Chão Tremendo',
    subtitulo: 'Quadríceps, posterior, glúteo e panturrilha',
    categoria: 'completo',
    exercises: [
      { wgerId: 1805, seriesAlvo: 4, repsAlvo: 8 }, // Agachamento com barra
      { wgerId: 371, seriesAlvo: 4, repsAlvo: 10 }, // Leg press
      { wgerId: 369, seriesAlvo: 3, repsAlvo: 12 }, // Cadeira extensora
      { wgerId: 507, seriesAlvo: 4, repsAlvo: 10 }, // Levantamento terra romeno
      { wgerId: 364, seriesAlvo: 3, repsAlvo: 12 }, // Mesa flexora
      { wgerId: 146, seriesAlvo: 4, repsAlvo: 15 }, // Panturrilha no leg press
    ],
  },
  {
    key: 'superior_inteiro',
    nome: 'Superior Inteiro — Torso de Aço',
    subtitulo: 'Peito, costas, ombro e braços',
    categoria: 'completo',
    exercises: [
      { wgerId: 73, seriesAlvo: 4, repsAlvo: 8 }, // Supino reto
      { wgerId: 355, seriesAlvo: 4, repsAlvo: 10 }, // Puxada Alta
      { wgerId: 567, seriesAlvo: 3, repsAlvo: 10 }, // Desenvolvimento com halteres
      { wgerId: 83, seriesAlvo: 3, repsAlvo: 10 }, // Remada Curvada
      { wgerId: 92, seriesAlvo: 3, repsAlvo: 12 }, // Rosca direta com halteres
      { wgerId: 659, seriesAlvo: 3, repsAlvo: 12 }, // Tríceps na polia
    ],
  },
  {
    key: 'corpo_todo',
    nome: 'Corpo Todo — Estopim',
    subtitulo: 'Treino full body rápido',
    categoria: 'completo',
    exercises: [
      { wgerId: 1805, seriesAlvo: 4, repsAlvo: 8 }, // Agachamento com barra
      { wgerId: 73, seriesAlvo: 4, repsAlvo: 8 }, // Supino reto
      { wgerId: 355, seriesAlvo: 4, repsAlvo: 10 }, // Puxada Alta
      { wgerId: 567, seriesAlvo: 3, repsAlvo: 10 }, // Desenvolvimento com halteres
      { wgerId: 507, seriesAlvo: 3, repsAlvo: 10 }, // Levantamento terra romeno
    ],
  },
  {
    key: 'quadriceps_monstro',
    nome: 'Quadríceps Monstro',
    subtitulo: 'Foco total em quadríceps',
    categoria: 'focado',
    exercises: [
      { wgerId: 1805, seriesAlvo: 4, repsAlvo: 8 }, // Agachamento com barra
      { wgerId: 371, seriesAlvo: 4, repsAlvo: 10 }, // Leg press
      { wgerId: 1414, seriesAlvo: 4, repsAlvo: 10 }, // Agachamento hack
      { wgerId: 369, seriesAlvo: 4, repsAlvo: 12 }, // Cadeira extensora
      { wgerId: 205, seriesAlvo: 3, repsAlvo: 12 }, // Afundo com halteres em pé
    ],
  },
  {
    key: 'peito_blindado',
    nome: 'Peito Blindado',
    subtitulo: 'Foco em peitoral',
    categoria: 'focado',
    exercises: [
      { wgerId: 73, seriesAlvo: 4, repsAlvo: 8 }, // Supino reto
      { wgerId: 538, seriesAlvo: 4, repsAlvo: 8 }, // Supino inclinado com barra
      { wgerId: 75, seriesAlvo: 3, repsAlvo: 10 }, // Supino com halteres
      { wgerId: 1904, seriesAlvo: 3, repsAlvo: 12 }, // Peck deck (voador)
      { wgerId: 237, seriesAlvo: 3, repsAlvo: 12 }, // Crucifixo na polia
    ],
  },
  {
    key: 'ombro_3d',
    nome: 'Ombro 3D — Deltoides de Fora',
    subtitulo: 'Os três feixes do ombro',
    categoria: 'focado',
    exercises: [
      { wgerId: 567, seriesAlvo: 4, repsAlvo: 8 }, // Desenvolvimento com halteres
      { wgerId: 348, seriesAlvo: 4, repsAlvo: 12 }, // Elevação lateral
      { wgerId: 256, seriesAlvo: 3, repsAlvo: 12 }, // Elevação frontal
      { wgerId: 487, seriesAlvo: 3, repsAlvo: 12 }, // Elevação posterior (deltoide posterior)
      { wgerId: 20, seriesAlvo: 3, repsAlvo: 10 }, // Desenvolvimento Arnold
    ],
  },
  {
    key: 'braco_canhao',
    nome: 'Braço Canhão — Bíceps & Tríceps',
    subtitulo: 'Dia de braço completo',
    categoria: 'focado',
    exercises: [
      { wgerId: 91, seriesAlvo: 4, repsAlvo: 10 }, // Rosca direta com barra reta
      { wgerId: 1932, seriesAlvo: 3, repsAlvo: 12 }, // Rosca martelo
      { wgerId: 208, seriesAlvo: 3, repsAlvo: 12 }, // Rosca scott com halteres
      { wgerId: 50, seriesAlvo: 4, repsAlvo: 10 }, // Tríceps testa com barra
      { wgerId: 659, seriesAlvo: 3, repsAlvo: 12 }, // Tríceps na polia
      { wgerId: 194, seriesAlvo: 3, repsAlvo: 12 }, // Fundos Para Tríceps
    ],
  },
  {
    key: 'posterior_gluteo',
    nome: 'Posterior & Glúteo — Cadeia de Trás',
    subtitulo: 'Posterior de coxa e glúteos',
    categoria: 'focado',
    exercises: [
      { wgerId: 507, seriesAlvo: 4, repsAlvo: 10 }, // Levantamento terra romeno
      { wgerId: 294, seriesAlvo: 4, repsAlvo: 10 }, // Elevação pélvica
      { wgerId: 364, seriesAlvo: 3, repsAlvo: 12 }, // Mesa flexora
      { wgerId: 366, seriesAlvo: 3, repsAlvo: 12 }, // Cadeira flexora (sentado)
      { wgerId: 265, seriesAlvo: 3, repsAlvo: 15 }, // Ponte de glúteo
    ],
  },
  {
    key: 'costas_largura',
    nome: 'Costas Largura — Asas',
    subtitulo: 'Foco na largura das costas',
    categoria: 'focado',
    exercises: [
      { wgerId: 152, seriesAlvo: 4, repsAlvo: 8 }, // Barra fixa supinada
      { wgerId: 355, seriesAlvo: 4, repsAlvo: 10 }, // Puxada Alta
      { wgerId: 1542, seriesAlvo: 3, repsAlvo: 10 }, // Barra fixa pegada aberta
      { wgerId: 921, seriesAlvo: 3, repsAlvo: 12 }, // Remada baixa sentada na polia
      { wgerId: 1119, seriesAlvo: 3, repsAlvo: 12 }, // Remada máquina pegada fechada
    ],
  },
];

/**
 * Aplica um treino pronto a um plano recém-criado: cria 1 único dia (label =
 * nome do treino) e insere os exercícios, resolvendo por `wgerId` contra o
 * catálogo atual — mesma mecânica de `applyTemplate`/`applyGeneratedPlan`
 * (templates.ts), reimplementada aqui em vez de importada de lá: não há
 * dependência real entre os dois módulos (nenhum precisa de nada do outro),
 * então não há risco de ciclo — só não faz sentido acoplar um ao outro pra
 * uma função de ~15 linhas. Exercício não encontrado no catálogo é pulado
 * silenciosamente, nunca aborta. Retorna o id do dia criado (ou `null` se a
 * `readyWorkoutKey` não existir), pra quem chama poder criar a sessão em
 * cima dele.
 */
export function applyReadyWorkout(tx: Tx, planId: number, readyWorkoutKey: string): number | null {
  const workout = READY_WORKOUTS.find((w) => w.key === readyWorkoutKey);
  if (!workout) return null;

  const wgerIdMap = new Map(
    tx
      .select({ id: exercises.id, wgerId: exercises.wgerId })
      .from(exercises)
      .all()
      .map((row) => [row.wgerId, row.id])
  );

  const createdDay = tx.insert(workoutDays).values({ planId, label: workout.nome, ordem: 0 }).returning().get();

  workout.exercises.forEach((exercise, exerciseIndex) => {
    const exerciseId = wgerIdMap.get(exercise.wgerId);
    if (exerciseId === undefined) return;

    tx.insert(workoutDayExercises)
      .values({
        dayId: createdDay.id,
        exerciseId,
        seriesAlvo: exercise.seriesAlvo,
        repsAlvo: exercise.repsAlvo,
        cargaAlvo: null,
        ordem: exerciseIndex,
        supersetGroup: null,
      })
      .run();
  });

  return createdDay.id;
}

/** Cria o plano + dia e SALVA (aparece em Planilhas) — `tipo: 'Pronto'`, sem
 * criar sessão nenhuma. Retorna o id do plano criado. */
export function criarESalvar(readyWorkoutKey: string): number {
  const workout = READY_WORKOUTS.find((w) => w.key === readyWorkoutKey);
  if (!workout) throw new Error(`Treino pronto "${readyWorkoutKey}" não encontrado.`);

  return db.transaction((tx) => {
    const plan = tx
      .insert(workoutPlans)
      .values({ nome: workout.nome, tipo: 'Pronto', criadoEm: new Date().toISOString() })
      .returning()
      .get();

    applyReadyWorkout(tx, plan.id, readyWorkoutKey);
    return plan.id;
  });
}

export type TreinarAgoraResult = { status: 'started'; sessionId: number } | { status: 'already_has_session_today' };

/**
 * Apaga planos `tipo: 'Treino pronto'` cujo dia ficou órfão — nenhuma sessão
 * (de nenhuma data, concluída ou não) referencia mais o `workoutDayId` deles.
 * Isso só acontece quando o usuário cancela a sessão de um treino pronto
 * (handleCancel em hoje.tsx apaga a linha de `sessions`, mas nunca o plano/
 * dia que ela apontava). Cada plano de treino pronto tem exatamente 1 dia
 * (ver `applyReadyWorkout`), então checar o dia órfão basta.
 *
 * Deliberadamente NÃO apaga planos cuja sessão ainda existe (concluída ou em
 * andamento): o histórico (WorkoutHistorySection) faz `innerJoin` de
 * `sessions` com `workoutDays` pra mostrar o label — apagar o dia de uma
 * sessão concluída quebraria essa sessão no histórico. Esses continuam no
 * banco de propósito; só não aparecem mais no seletor da aba Treinar (ver
 * filtro em hoje.tsx `DayPicker`).
 *
 * Exportada (Etapa C da feature de reset com PIN, reset-history.ts): depois
 * que um reset de histórico apaga TODAS as `sessions`, `referencedDayIds`
 * fica vazio — então esta mesma função, chamada depois disso, naturalmente
 * apaga TODO plano `'Treino pronto'` (é exatamente o critério de "seguro pra
 * apagar" que ela já implementa), sem duplicar a lógica.
 */
export function limparTreinosProntosOrfaos(tx: Tx) {
  const referencedDayIds = new Set(tx.select({ id: sessions.workoutDayId }).from(sessions).all().map((r) => r.id));

  const candidateDays = tx
    .select({ dayId: workoutDays.id, planId: workoutDays.planId })
    .from(workoutDays)
    .innerJoin(workoutPlans, eq(workoutDays.planId, workoutPlans.id))
    .where(eq(workoutPlans.tipo, 'Treino pronto'))
    .all();

  for (const { dayId, planId } of candidateDays) {
    if (referencedDayIds.has(dayId)) continue; // sessão ainda existe (concluída ou não) — não mexe

    // Ordem segura de FK (mesma de wipeUserData em backup/restore.ts): filhos
    // antes dos pais. sessionSkips não entra aqui — como não há sessão
    // referenciando esse dia, não pode haver skip pendente pra ele (handleCancel
    // sempre apaga os skips da sessão antes de apagar a sessão em si).
    tx.delete(workoutDayExercises).where(eq(workoutDayExercises.dayId, dayId)).run();
    tx.delete(workoutDays).where(eq(workoutDays.id, dayId)).run();
    tx.delete(workoutPlans).where(eq(workoutPlans.id, planId)).run();
  }
}

/**
 * Cria o plano + dia (`tipo: 'Treino pronto'` — filtrado da lista de
 * Planilhas, ver planilhas.tsx) e já inicia a sessão de hoje. A checagem de
 * "já existe sessão hoje" roda DENTRO da mesma transação, antes de criar
 * qualquer coisa — se já existe (concluída ou não, mesmo critério de
 * `todaySession` em hoje.tsx), nada é criado (nenhum plano órfão fica pra
 * trás) e o retorno avisa quem chamou pra mostrar o aviso certo.
 */
export function treinarAgora(readyWorkoutKey: string): TreinarAgoraResult {
  const workout = READY_WORKOUTS.find((w) => w.key === readyWorkoutKey);
  if (!workout) throw new Error(`Treino pronto "${readyWorkoutKey}" não encontrado.`);

  const todayStr = getTodayDateString();

  return db.transaction((tx) => {
    const existingToday = tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.data, todayStr)).all();
    if (existingToday.length > 0) {
      return { status: 'already_has_session_today' };
    }

    limparTreinosProntosOrfaos(tx);

    const plan = tx
      .insert(workoutPlans)
      .values({ nome: workout.nome, tipo: 'Treino pronto', criadoEm: new Date().toISOString() })
      .returning()
      .get();

    const dayId = applyReadyWorkout(tx, plan.id, readyWorkoutKey);
    if (dayId === null) {
      throw new Error('Falha ao montar o treino pronto.');
    }

    const session = tx
      .insert(sessions)
      .values({ workoutDayId: dayId, data: todayStr, concluida: false, horaInicio: Date.now() })
      .returning()
      .get();

    return { status: 'started', sessionId: session.id };
  });
}
