import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  InputAccessoryView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProgressBar } from '@/components/ui/progress-bar';
import { db } from '@/db';
import {
  exercisePreferences,
  exercises,
  sessionExtraExercises,
  sessionSkips,
  sessions,
  setLogs,
  workoutDayExercises,
  workoutDays,
  workoutPlans,
  type Session,
} from '@/db/schema';
import {
  daysBetween,
  formatDateNoWeekday,
  formatShortDateLabel,
  getTodayDateString,
  getWeekdayLabel,
} from '@/lib/date';
import { formatCountdown, formatElapsed, useNow } from '@/lib/duration';
import { RPE_CATEGORY_LABEL, RPE_CATEGORY_ORDER, RPE_CATEGORY_VALUE, rpeValueToCategory, type RpeCategory } from '@/lib/rpe';
import { suggestNextLoad } from '@/lib/suggest-load';
import { suggestRestSeconds } from '@/lib/suggest-rest';
import { buildSessionShareText, shareText } from '@/lib/share-text';
import { formatLastPerformance, useLastPerformance } from '@/lib/use-last-performance';
import { colors } from '@/theme/tokens';

const DEFAULT_REST_SECONDS = 90;

function reportError(context: string, err: unknown) {
  console.error(context, err);
  Alert.alert(context, String(err instanceof Error ? err.message : err));
}

export default function HojeScreen() {
  const todayStr = getTodayDateString();
  const today = new Date();

  const { data: todaySessions } = useLiveQuery(
    db.select().from(sessions).where(eq(sessions.data, todayStr))
  );
  const todaySession = todaySessions?.[0];

  const { data: historyRows } = useLiveQuery(
    db
      .select({
        id: sessions.id,
        data: sessions.data,
        dayLabel: workoutDays.label,
        horaInicio: sessions.horaInicio,
        horaFim: sessions.horaFim,
      })
      .from(sessions)
      .innerJoin(workoutDays, eq(sessions.workoutDayId, workoutDays.id))
      .where(eq(sessions.concluida, true))
  );

  const sortedHistory = useMemo(() => {
    return [...(historyRows ?? [])].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 10);
  }, [historyRows]);

  const handleStartDay = async (dayId: number) => {
    try {
      await db.insert(sessions).values({
        workoutDayId: dayId,
        data: todayStr,
        concluida: false,
        horaInicio: Date.now(),
      });
    } catch (err) {
      reportError('Erro ao iniciar treino', err);
    }
  };

  return (
    <Screen edges={['top', 'left', 'right']} scrollable>
      <View className="pb-4 pt-2">
        <Label>{getWeekdayLabel(today)}</Label>
        <Text className="font-display text-4xl uppercase text-text">{formatDateNoWeekday(today)}</Text>
      </View>

      {todaySession ? (
        <SessionExecution session={todaySession} />
      ) : (
        <DayPicker onStart={handleStartDay} todayStr={todayStr} />
      )}

      <View className="mb-8 mt-8">
        <Text className="mb-3 font-card-title text-lg text-text">Histórico</Text>
        {sortedHistory.length === 0 ? (
          <Text className="font-body text-muted">Nenhuma sessão concluída ainda.</Text>
        ) : (
          sortedHistory.map((item) => (
            <Card key={item.id} className="mb-2">
              <Text className="font-card-title text-lg text-text">{item.dayLabel}</Text>
              <View className="mt-1 flex-row items-center justify-between">
                <Label>{formatShortDateLabel(item.data)}</Label>
                {item.horaInicio != null && item.horaFim != null && (
                  <Label>{formatElapsed(item.horaFim - item.horaInicio)}</Label>
                )}
              </View>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

function DayPicker({ onStart, todayStr }: { onStart: (dayId: number) => void; todayStr: string }) {
  const { data: days } = useLiveQuery(
    db
      .select({
        id: workoutDays.id,
        label: workoutDays.label,
        planNome: workoutPlans.nome,
      })
      .from(workoutDays)
      .innerJoin(workoutPlans, eq(workoutDays.planId, workoutPlans.id))
  );

  const { data: exerciseCountRows } = useLiveQuery(
    db
      .select({ dayId: workoutDayExercises.dayId, count: sql<number>`count(*)` })
      .from(workoutDayExercises)
      .groupBy(workoutDayExercises.dayId)
  );

  const { data: lastTrainedRows } = useLiveQuery(
    db
      .select({ dayId: sessions.workoutDayId, lastData: sql<string>`max(${sessions.data})` })
      .from(sessions)
      .where(eq(sessions.concluida, true))
      .groupBy(sessions.workoutDayId)
  );

  const exerciseCountByDay = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of exerciseCountRows ?? []) map.set(row.dayId, Number(row.count));
    return map;
  }, [exerciseCountRows]);

  const lastTrainedByDay = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of lastTrainedRows ?? []) map.set(row.dayId, row.lastData);
    return map;
  }, [lastTrainedRows]);

  return (
    <View>
      <Text className="mb-3 font-card-title text-lg text-text">Qual treino você vai fazer hoje?</Text>

      {(days ?? []).length === 0 && (
        <Text className="font-body text-muted">
          Nenhum dia de treino cadastrado ainda. Crie um plano na aba Planilhas.
        </Text>
      )}

      {(days ?? []).map((day) => {
        const exerciseCount = exerciseCountByDay.get(day.id) ?? 0;
        const lastTrained = lastTrainedByDay.get(day.id);
        const daysAgo = lastTrained ? daysBetween(lastTrained, todayStr) : null;

        return (
          <Pressable key={day.id} onPress={() => onStart(day.id)} className="mb-3">
            <Card>
              <Text className="font-display text-3xl uppercase text-text">{day.label}</Text>
              <Label className="mt-1">{day.planNome}</Label>

              <View className="mt-3 flex-row items-center justify-between">
                <Label>{`${exerciseCount} ${exerciseCount === 1 ? 'exercício' : 'exercícios'}`}</Label>
                {daysAgo !== null && (
                  <Label>{`Treinado há ${daysAgo} ${daysAgo === 1 ? 'dia' : 'dias'}`}</Label>
                )}
              </View>
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

type LogEntry = { id: number; numeroSerie: number; reps: number; carga: number; rpe: number | null };

type SessionExerciseItem = {
  kind: 'plano' | 'avulso';
  itemId: number; // workoutDayExercises.id (plano) ou sessionExtraExercises.id (avulso)
  exerciseId: number;
  exerciseWgerId: number;
  exerciseNome: string;
  categoria: string;
  seriesAlvo: number;
  repsAlvo: number;
  cargaAlvo: number | null;
  skipped: boolean;
  skipId: number | null; // sessionSkips.id, só quando skipped
  supersetGroup: string | null;
  isFirstInSupersetGroup: boolean;
  isLastInSupersetGroup: boolean;
  equipamento: string; // JSON serializado, tipo '["Barra"]' — parseado sob demanda
};

function itemsEqual(a: SessionExerciseItem, b: SessionExerciseItem) {
  return (
    a.kind === b.kind &&
    a.itemId === b.itemId &&
    a.exerciseId === b.exerciseId &&
    a.exerciseWgerId === b.exerciseWgerId &&
    a.exerciseNome === b.exerciseNome &&
    a.categoria === b.categoria &&
    a.seriesAlvo === b.seriesAlvo &&
    a.repsAlvo === b.repsAlvo &&
    a.cargaAlvo === b.cargaAlvo &&
    a.skipped === b.skipped &&
    a.skipId === b.skipId &&
    a.supersetGroup === b.supersetGroup &&
    a.isFirstInSupersetGroup === b.isFirstInSupersetGroup &&
    a.isLastInSupersetGroup === b.isLastInSupersetGroup &&
    a.equipamento === b.equipamento
  );
}

function SessionExecution({ session }: { session: Session }) {
  const router = useRouter();
  const now = useNow(1000);

  // Preferência de visão, não persistida entre aberturas do app — mesmo
  // padrão já usado pro `collapsed` de cada card (useState local).
  const [modoTreino, setModoTreino] = useState(false);

  const { data: dayRows } = useLiveQuery(
    db.select({ label: workoutDays.label }).from(workoutDays).where(eq(workoutDays.id, session.workoutDayId)),
    [session.workoutDayId]
  );
  const dayLabel = dayRows?.[0]?.label ?? '';

  const { data: dayExerciseRows } = useLiveQuery(
    db
      .select({
        id: workoutDayExercises.id,
        exerciseId: workoutDayExercises.exerciseId,
        seriesAlvo: workoutDayExercises.seriesAlvo,
        repsAlvo: workoutDayExercises.repsAlvo,
        cargaAlvo: workoutDayExercises.cargaAlvo,
        ordem: workoutDayExercises.ordem,
        supersetGroup: workoutDayExercises.supersetGroup,
        exerciseNome: exercises.nome,
        exerciseWgerId: exercises.wgerId,
        categoria: exercises.categoria,
        equipamento: exercises.equipamento,
      })
      .from(workoutDayExercises)
      .innerJoin(exercises, eq(workoutDayExercises.exerciseId, exercises.id))
      .where(eq(workoutDayExercises.dayId, session.workoutDayId))
      .orderBy(workoutDayExercises.ordem),
    [session.workoutDayId]
  );

  const { data: extraExerciseRows } = useLiveQuery(
    db
      .select({
        id: sessionExtraExercises.id,
        exerciseId: sessionExtraExercises.exerciseId,
        seriesAlvo: sessionExtraExercises.seriesAlvo,
        repsAlvo: sessionExtraExercises.repsAlvo,
        cargaAlvo: sessionExtraExercises.cargaAlvo,
        exerciseNome: exercises.nome,
        exerciseWgerId: exercises.wgerId,
        categoria: exercises.categoria,
        equipamento: exercises.equipamento,
      })
      .from(sessionExtraExercises)
      .innerJoin(exercises, eq(sessionExtraExercises.exerciseId, exercises.id))
      .where(eq(sessionExtraExercises.sessionId, session.id)),
    [session.id]
  );

  const { data: skipRows } = useLiveQuery(
    db.select().from(sessionSkips).where(eq(sessionSkips.sessionId, session.id)),
    [session.id]
  );

  const { data: logs } = useLiveQuery(
    db.select().from(setLogs).where(eq(setLogs.sessionId, session.id)),
    [session.id]
  );

  // Sliced per exercise (not one shared Map) so a memoized ExerciseSessionCard
  // can bail out of re-rendering when a sibling exercise's log changes —
  // passing the same big Map to every card would defeat memoization, since
  // useLiveQuery hands back a new Map-worthy array on every write.
  const logsByExercise = useMemo(() => {
    const map = new Map<number, LogEntry[]>();
    for (const log of logs ?? []) {
      const list = map.get(log.exerciseId) ?? [];
      list.push({ id: log.id, numeroSerie: log.numeroSerie, reps: log.reps, carga: log.carga, rpe: log.rpe });
      map.set(log.exerciseId, list);
    }
    return map;
  }, [logs]);

  const skipByDayExerciseId = useMemo(() => {
    const map = new Map<number, number>(); // workoutDayExerciseId -> sessionSkips.id
    for (const row of skipRows ?? []) map.set(row.workoutDayExerciseId, row.id);
    return map;
  }, [skipRows]);

  const items: SessionExerciseItem[] = useMemo(() => {
    // Grupo de supersérie identificado só por rótulo dentro do dia (nunca por
    // adjacência) — o usuário pode, em tese, agrupar exercícios que não estão
    // lado a lado na ordem, então "primeiro/último do grupo" vem do menor/maior
    // `ordem` entre os membros, não da posição no array.
    const groupMinOrdem = new Map<string, number>();
    const groupMaxOrdem = new Map<string, number>();
    for (const ex of dayExerciseRows ?? []) {
      if (ex.supersetGroup == null) continue;
      const currentMin = groupMinOrdem.get(ex.supersetGroup);
      if (currentMin === undefined || ex.ordem < currentMin) groupMinOrdem.set(ex.supersetGroup, ex.ordem);
      const currentMax = groupMaxOrdem.get(ex.supersetGroup);
      if (currentMax === undefined || ex.ordem > currentMax) groupMaxOrdem.set(ex.supersetGroup, ex.ordem);
    }

    const planItems: SessionExerciseItem[] = (dayExerciseRows ?? []).map((ex) => {
      const skipId = skipByDayExerciseId.get(ex.id) ?? null;
      return {
        kind: 'plano',
        itemId: ex.id,
        exerciseId: ex.exerciseId,
        exerciseWgerId: ex.exerciseWgerId,
        exerciseNome: ex.exerciseNome,
        categoria: ex.categoria,
        seriesAlvo: ex.seriesAlvo,
        repsAlvo: ex.repsAlvo,
        cargaAlvo: ex.cargaAlvo,
        skipped: skipId !== null,
        skipId,
        supersetGroup: ex.supersetGroup,
        isFirstInSupersetGroup: ex.supersetGroup == null ? true : ex.ordem === groupMinOrdem.get(ex.supersetGroup),
        isLastInSupersetGroup: ex.supersetGroup == null ? true : ex.ordem === groupMaxOrdem.get(ex.supersetGroup),
        equipamento: ex.equipamento,
      };
    });
    const extraItems: SessionExerciseItem[] = (extraExerciseRows ?? []).map((ex) => ({
      kind: 'avulso',
      itemId: ex.id,
      exerciseId: ex.exerciseId,
      exerciseWgerId: ex.exerciseWgerId,
      exerciseNome: ex.exerciseNome,
      categoria: ex.categoria,
      seriesAlvo: ex.seriesAlvo,
      repsAlvo: ex.repsAlvo,
      cargaAlvo: ex.cargaAlvo,
      skipped: false,
      skipId: null,
      supersetGroup: null,
      isFirstInSupersetGroup: true,
      isLastInSupersetGroup: true,
      equipamento: ex.equipamento,
    }));
    return [...planItems, ...extraItems];
  }, [dayExerciseRows, extraExerciseRows, skipByDayExerciseId]);

  const activeItems = items.filter((item) => !item.skipped);
  const totalSeries = activeItems.reduce((sum, item) => sum + item.seriesAlvo, 0);
  const completedSeries = activeItems.reduce(
    (sum, item) => sum + Math.min(logsByExercise.get(item.exerciseId)?.length ?? 0, item.seriesAlvo),
    0
  );

  const handleShareSession = useCallback(async () => {
    const shareItems = items.map((item) => ({
      exerciseNome: item.exerciseNome,
      skipped: item.skipped,
      sets: (logsByExercise.get(item.exerciseId) ?? [])
        .slice()
        .sort((a, b) => a.numeroSerie - b.numeroSerie)
        .map((log) => ({ numeroSerie: log.numeroSerie, reps: log.reps, carga: log.carga, rpe: log.rpe })),
    }));
    const durationLabel =
      session.horaInicio != null && session.horaFim != null
        ? formatElapsed(session.horaFim - session.horaInicio)
        : null;
    await shareText(
      buildSessionShareText({
        dayLabel,
        dateLabel: formatShortDateLabel(session.data),
        durationLabel,
        items: shareItems,
      })
    );
  }, [items, logsByExercise, dayLabel, session.data, session.horaInicio, session.horaFim]);

  const handleComplete = async () => {
    try {
      await db
        .update(sessions)
        .set({ concluida: true, horaFim: Date.now(), restTimerStartedAt: null })
        .where(eq(sessions.id, session.id));
    } catch (err) {
      reportError('Erro ao concluir treino', err);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancelar sessão',
      'Isso apaga o treino de hoje e os registros feitos. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.delete(setLogs).where(eq(setLogs.sessionId, session.id));
              await db.delete(sessionExtraExercises).where(eq(sessionExtraExercises.sessionId, session.id));
              await db.delete(sessionSkips).where(eq(sessionSkips.sessionId, session.id));
              await db.delete(sessions).where(eq(sessions.id, session.id));
            } catch (err) {
              reportError('Erro ao cancelar sessão', err);
            }
          },
        },
      ]
    );
  };

  const handleSkip = useCallback(
    async (workoutDayExerciseId: number) => {
      try {
        await db.insert(sessionSkips).values({ sessionId: session.id, workoutDayExerciseId });
      } catch (err) {
        reportError('Erro ao pular exercício', err);
      }
    },
    [session.id]
  );

  const handleUnskip = useCallback(async (skipId: number) => {
    try {
      await db.delete(sessionSkips).where(eq(sessionSkips.id, skipId));
    } catch (err) {
      reportError('Erro ao desfazer', err);
    }
  }, []);

  const handleRemoveExtra = useCallback(async (extraId: number, hasLogs: boolean) => {
    const doRemove = async () => {
      try {
        await db.delete(sessionExtraExercises).where(eq(sessionExtraExercises.id, extraId));
      } catch (err) {
        reportError('Erro ao remover exercício', err);
      }
    };
    if (hasLogs) {
      Alert.alert(
        'Remover exercício',
        'Esse exercício já tem séries registradas nesta sessão. Remover não apaga o que já foi salvo, só tira o card daqui. Continuar?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Remover', style: 'destructive', onPress: doRemove },
        ]
      );
    } else {
      await doRemove();
    }
  }, []);

  // Sugestão é sempre recalculada a cada novo início de descanso (nunca herda a
  // duração do exercício anterior na mesma sessão) — +30/-30 continuam ajustando
  // só aquele descanso específico depois de iniciado.
  const startRestTimer = useCallback(
    async (suggestedSeconds: number) => {
      try {
        await db
          .update(sessions)
          .set({
            restTimerStartedAt: Date.now(),
            restTimerDurationSeconds: suggestedSeconds,
          })
          .where(eq(sessions.id, session.id));
      } catch (err) {
        reportError('Erro ao iniciar descanso', err);
      }
    },
    [session.id]
  );

  const adjustRestTimer = useCallback(
    async (deltaSeconds: number) => {
      const current = session.restTimerDurationSeconds ?? DEFAULT_REST_SECONDS;
      const next = Math.max(15, current + deltaSeconds);
      try {
        await db.update(sessions).set({ restTimerDurationSeconds: next }).where(eq(sessions.id, session.id));
      } catch (err) {
        reportError('Erro ao ajustar descanso', err);
      }
    },
    [session.id, session.restTimerDurationSeconds]
  );

  const cancelRestTimer = useCallback(async () => {
    try {
      await db.update(sessions).set({ restTimerStartedAt: null }).where(eq(sessions.id, session.id));
    } catch (err) {
      reportError('Erro ao cancelar descanso', err);
    }
  }, [session.id]);

  const restRemaining =
    session.restTimerStartedAt != null
      ? (session.restTimerDurationSeconds ?? DEFAULT_REST_SECONDS) - (now - session.restTimerStartedAt) / 1000
      : null;

  const hapticFiredRef = useRef(false);
  useEffect(() => {
    if (restRemaining === null) {
      hapticFiredRef.current = false;
      return;
    }
    if (restRemaining <= 0 && !hapticFiredRef.current) {
      hapticFiredRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (restRemaining > 0) {
      hapticFiredRef.current = false;
    }
  }, [restRemaining]);

  return (
    <View>
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="flex-1 font-display text-5xl uppercase text-text" numberOfLines={1}>
          {dayLabel}
        </Text>
        <Chip
          label="Modo treino"
          selected={modoTreino}
          onPress={() => setModoTreino((m) => !m)}
        />
      </View>

      {session.horaInicio != null && (
        <Label className="mb-1">
          {session.concluida && session.horaFim != null
            ? `Duração: ${formatElapsed(session.horaFim - session.horaInicio)}`
            : `Em andamento: ${formatElapsed(now - session.horaInicio)}`}
        </Label>
      )}

      {session.concluida && (
        <Card className="mb-4 mt-3 flex-row items-center justify-between border-l-4 border-l-success">
          <View className="w-6" />
          <Text className="flex-1 text-center font-label uppercase text-success">Treino concluído</Text>
          <Pressable onPress={handleShareSession} hitSlop={8} className="w-6 items-end p-1">
            <Ionicons name="share-outline" size={18} color={colors.success} />
          </Pressable>
        </Card>
      )}

      <View className="mb-6 mt-4">
        <Text className="font-display text-2xl text-text">
          {completedSeries}
          <Text className="text-muted">/{totalSeries}</Text>
          <Text className="font-label text-sm uppercase text-muted"> séries</Text>
        </Text>
        <ProgressBar
          className="mt-2"
          progress={totalSeries > 0 ? completedSeries / totalSeries : 0}
        />
      </View>

      {restRemaining !== null && (
        <RestTimerOverlay
          restRemaining={restRemaining}
          onAdjust={adjustRestTimer}
          onDismiss={cancelRestTimer}
        />
      )}

      {items.map((item) => (
        <ExerciseSessionCard
          key={`${item.kind}-${item.itemId}`}
          item={item}
          sessionId={session.id}
          logs={logsByExercise.get(item.exerciseId) ?? EMPTY_LOGS}
          onSkip={handleSkip}
          onUnskip={handleUnskip}
          onRemove={handleRemoveExtra}
          onRequestRest={startRestTimer}
          modoTreino={modoTreino}
        />
      ))}

      {!session.concluida && (
        <Button
          variant="secondary"
          className="mb-4"
          onPress={() =>
            router.push({ pathname: '/sessao/adicionar-exercicio', params: { sessionId: String(session.id) } })
          }
        >
          + Adicionar exercício
        </Button>
      )}

      {!session.concluida && (
        <Button onPress={handleComplete} className="mb-3 py-4">
          Concluir treino
        </Button>
      )}

      <Button variant="destructive" onPress={handleCancel}>
        Cancelar sessão de hoje
      </Button>
    </View>
  );
}

// Modal (React Native core, transparente) em vez de expo-blur: um novo pacote
// nativo só pro efeito de desfoque não valia a pena, e o próprio pedido já
// aceitava "escurecimento" como alternativa ao blur. O Modal renderiza numa
// camada nativa separada por cima da árvore atual — a tela por trás continua
// montada e com todo o estado (inputs não commitados inclusive) intacto, então
// fechar o overlay nunca reseta nada.
function RestTimerOverlay({
  restRemaining,
  onAdjust,
  onDismiss,
}: {
  restRemaining: number;
  onAdjust: (deltaSeconds: number) => void;
  onDismiss: () => void;
}) {
  const isDone = restRemaining <= 0;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: 'rgba(20,20,20,0.94)' }}
      >
        <Label>{isDone ? 'Descanso concluído' : 'Descanso'}</Label>

        {isDone ? (
          <View className="my-6 items-center">
            <Ionicons name="checkmark-circle" size={72} color={colors.success} />
          </View>
        ) : (
          <Text
            className="my-4 font-display text-8xl text-text"
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatCountdown(restRemaining)}
          </Text>
        )}

        {!isDone && (
          <View className="mb-8 flex-row items-center gap-4">
            <Pressable
              onPress={() => onAdjust(-30)}
              className="rounded border border-border px-6 py-3">
              <Text className="font-label text-base uppercase text-muted">-30s</Text>
            </Pressable>
            <Pressable
              onPress={() => onAdjust(30)}
              className="rounded border border-border px-6 py-3">
              <Text className="font-label text-base uppercase text-muted">+30s</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          onPress={onDismiss}
          className="w-full max-w-xs rounded border border-accent py-4">
          <Text className="text-center font-label uppercase text-accent">Fechar</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const EMPTY_LOGS: LogEntry[] = [];

function logsAreEqual(a: LogEntry[], b: LogEntry[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const bBySerie = new Map(b.map((log) => [log.numeroSerie, log]));
  for (const log of a) {
    const match = bBySerie.get(log.numeroSerie);
    if (
      !match ||
      match.id !== log.id ||
      match.reps !== log.reps ||
      match.carga !== log.carga ||
      match.rpe !== log.rpe
    ) {
      return false;
    }
  }
  return true;
}

const ExerciseSessionCard = memo(
  function ExerciseSessionCard({
    item,
    sessionId,
    logs,
    onSkip,
    onUnskip,
    onRemove,
    onRequestRest,
    modoTreino,
  }: {
    item: SessionExerciseItem;
    sessionId: number;
    logs: LogEntry[];
    onSkip: (workoutDayExerciseId: number) => void;
    onUnskip: (skipId: number) => void;
    onRemove: (extraId: number, hasLogs: boolean) => void;
    onRequestRest: (suggestedSeconds: number) => void;
    modoTreino: boolean;
  }) {
    const logsBySerie = useMemo(() => {
      const map = new Map<number, LogEntry>();
      for (const log of logs) map.set(log.numeroSerie, log);
      return map;
    }, [logs]);

    const { data: preferenceRows } = useLiveQuery(
      db.select().from(exercisePreferences).where(eq(exercisePreferences.exerciseWgerId, item.exerciseWgerId)),
      [item.exerciseWgerId]
    );
    const nota = preferenceRows?.[0]?.nota || null;

    const suggestedRestSeconds = useMemo(
      () => suggestRestSeconds({ nome: item.exerciseNome, categoria: item.categoria }),
      [item.exerciseNome, item.categoria]
    );
    const handleRequestRest = useCallback(
      () => onRequestRest(suggestedRestSeconds),
      [onRequestRest, suggestedRestSeconds]
    );

    // Registro de refs dos campos "reps" por número de série — permite que o
    // campo "carga" da série N foque o campo "reps" da série N+1 de fora do
    // próprio SetRow (cada SetRow só conhece a si mesmo). ID único por card
    // (baseado no itemId) pro InputAccessoryView do iOS não colidir entre
    // exercícios diferentes montados ao mesmo tempo.
    const repsInputRefs = useRef(new Map<number, TextInput | null>()).current;
    const registerRepsInput = useCallback(
      (numeroSerie: number, ref: TextInput | null) => {
        if (ref) repsInputRefs.set(numeroSerie, ref);
        else repsInputRefs.delete(numeroSerie);
      },
      [repsInputRefs]
    );
    const focusReps = useCallback(
      (numeroSerie: number) => {
        repsInputRefs.get(numeroSerie)?.focus();
      },
      [repsInputRefs]
    );
    const accessoryViewId = `set-advance-${item.itemId}`;
    const [advance, setAdvance] = useState<{ run: () => void; label: string }>({
      run: () => {},
      label: 'Próximo',
    });

    const lastPerformance = useLastPerformance(item.exerciseId, sessionId);
    const lastPerformanceLabel = useMemo(
      () => (lastPerformance ? formatLastPerformance(lastPerformance) : null),
      [lastPerformance]
    );

    // Sugestão informativa (progressão dupla) — nunca preenche nada sozinha,
    // só mostra de onde veio o número.
    const loadSuggestion = useMemo(() => {
      if (!lastPerformance || lastPerformance.length === 0) return null;
      const equipamentoList: string[] = JSON.parse(item.equipamento);
      return suggestNextLoad(lastPerformance, item.repsAlvo, equipamentoList);
    }, [lastPerformance, item.repsAlvo, item.equipamento]);

    const loadSuggestionLabel = useMemo(() => {
      if (!loadSuggestion) return null;
      const prefix = loadSuggestion.subiu ? 'Sugerido' : 'Manter';
      const motivoSuffix = loadSuggestion.motivo ? ` · ${loadSuggestion.motivo}` : '';
      return `${prefix}: ${loadSuggestion.cargaSugerida}kg${motivoSuffix}`;
    }, [loadSuggestion]);

    const seriesNumbers = Array.from({ length: item.seriesAlvo }, (_, i) => i + 1);
    const completedCount = logs.length;
    const isComplete = completedCount === item.seriesAlvo;
    const isStarted = completedCount > 0;

    // Collapse é manual apenas (nunca automático por mudança de dados): só o
    // Pressable do cabeçalho abaixo alterna. Colapsar automaticamente ao
    // completar já causou um bug sério (fechava no meio do preenchimento da
    // última série) — não reintroduzir isso.
    const [collapsed, setCollapsed] = useState(false);

    const targetLabel = `${item.seriesAlvo}x${item.repsAlvo}${
      item.cargaAlvo != null ? ` · ${item.cargaAlvo}kg` : ''
    }`;

    if (item.skipped) {
      return (
        <Card className="mb-4 opacity-60">
          <View className="flex-row items-center justify-between">
            <Text
              className="flex-1 pr-2 font-card-title text-lg text-muted line-through"
              numberOfLines={1}
            >
              {item.exerciseNome}
            </Text>
            <Pressable onPress={() => item.skipId != null && onUnskip(item.skipId)}>
              <Text className="font-label text-xs uppercase text-accent">Desfazer</Text>
            </Pressable>
          </View>
          <Label className="mt-1">Pulado nesta sessão</Label>
        </Card>
      );
    }

    const canSkip = item.kind === 'plano' && completedCount === 0;
    const canRemove = item.kind === 'avulso';
    const inSupersetGroup = item.supersetGroup != null;

    return (
      <>
        <Card
          className={`${item.isLastInSupersetGroup ? 'mb-4' : 'mb-0'} ${
            isComplete ? 'border-l-4 border-l-accent' : ''
          }`}>
          {inSupersetGroup && (
            <Label className="mb-1 text-accent">{`Supersérie ${item.supersetGroup}`}</Label>
          )}
          <Pressable
            onPress={() => setCollapsed((c) => !c)}
            className="flex-row items-center justify-between">
            <Text className="flex-1 pr-2 font-card-title text-lg text-text" numberOfLines={1}>
              {item.exerciseNome}
            </Text>
          <View className="flex-row items-center gap-2">
            {isComplete ? (
              <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
            ) : isStarted ? (
              <Label>{`${completedCount}/${item.seriesAlvo}`}</Label>
            ) : null}
            <Ionicons
              name={collapsed ? 'chevron-down' : 'chevron-up'}
              size={18}
              color={colors.muted}
            />
          </View>
        </Pressable>

        {!modoTreino && (canSkip || canRemove) && (
          <Pressable
            onPress={() =>
              item.kind === 'avulso' ? onRemove(item.itemId, isStarted) : onSkip(item.itemId)
            }
            className="mt-1 self-end">
            <Text className="font-label text-xs uppercase text-muted">
              {item.kind === 'avulso' ? 'Remover' : 'Pular'}
            </Text>
          </Pressable>
        )}

        {collapsed ? (
          <>
            <Label className="mt-1">{targetLabel}</Label>
            {nota && <Label className="mt-1 italic text-muted">{nota}</Label>}
            {!modoTreino && lastPerformanceLabel && (
              <Label className="mt-1 text-muted">{`Última vez: ${lastPerformanceLabel}`}</Label>
            )}
            {!modoTreino && loadSuggestionLabel && (
              <Label className="mt-1 text-accent">{loadSuggestionLabel}</Label>
            )}
          </>
        ) : (
          <>
            <Label className="mt-1">{`Alvo: ${targetLabel}`}</Label>
            {nota && <Label className="mt-1 italic text-muted">{nota}</Label>}
            {!modoTreino && (
              <Label className="mt-1 text-muted">
                {lastPerformanceLabel ? `Última vez: ${lastPerformanceLabel}` : ' '}
              </Label>
            )}
            {!modoTreino && loadSuggestionLabel && (
              <Label className="mb-3 mt-1 text-accent">{loadSuggestionLabel}</Label>
            )}
            {!modoTreino && !loadSuggestionLabel && <View className="mb-3" />}
            {modoTreino && <View className="mb-3" />}

            <View className="mb-1 flex-row items-center gap-3">
              <View className="w-16" />
              <Label className="flex-1 text-center">Reps</Label>
              <Label className="flex-1 text-center">Carga</Label>
            </View>

            {seriesNumbers.map((numeroSerie) => (
              <SetRow
                key={numeroSerie}
                sessionId={sessionId}
                exerciseId={item.exerciseId}
                numeroSerie={numeroSerie}
                isLastSerie={numeroSerie === item.seriesAlvo}
                existing={logsBySerie.get(numeroSerie)}
                onRequestRest={handleRequestRest}
                suggestedRestSeconds={suggestedRestSeconds}
                showRestButton={item.isLastInSupersetGroup}
                modoTreino={modoTreino}
                accessoryViewId={accessoryViewId}
                registerRepsInput={registerRepsInput}
                focusReps={focusReps}
                setAdvance={setAdvance}
              />
            ))}

            {Platform.OS === 'ios' && (
              <InputAccessoryView nativeID={accessoryViewId}>
                <View
                  className="flex-row justify-end bg-surface px-4 py-2"
                  style={{ borderTopWidth: 1, borderTopColor: colors.border }}
                >
                  <Pressable onPress={() => advance.run()} className="px-3 py-1" hitSlop={8}>
                    <Text className="font-label uppercase text-accent">{advance.label}</Text>
                  </Pressable>
                </View>
              </InputAccessoryView>
            )}
          </>
        )}
        </Card>
        {inSupersetGroup && !item.isLastInSupersetGroup && <View className="h-1 bg-accent" />}
      </>
    );
  },
  (prev, next) =>
    prev.sessionId === next.sessionId &&
    prev.modoTreino === next.modoTreino &&
    itemsEqual(prev.item, next.item) &&
    logsAreEqual(prev.logs, next.logs)
);

function SetRow({
  sessionId,
  exerciseId,
  numeroSerie,
  isLastSerie,
  existing,
  onRequestRest,
  suggestedRestSeconds,
  showRestButton,
  modoTreino,
  accessoryViewId,
  registerRepsInput,
  focusReps,
  setAdvance,
}: {
  sessionId: number;
  exerciseId: number;
  numeroSerie: number;
  isLastSerie: boolean;
  existing: LogEntry | undefined;
  onRequestRest: () => void;
  suggestedRestSeconds: number;
  showRestButton: boolean;
  modoTreino: boolean;
  accessoryViewId: string;
  registerRepsInput: (numeroSerie: number, ref: TextInput | null) => void;
  focusReps: (numeroSerie: number) => void;
  setAdvance: (advance: { run: () => void; label: string }) => void;
}) {
  const [reps, setReps] = useState(existing !== undefined ? String(existing.reps) : '');
  const [carga, setCarga] = useState(existing !== undefined ? String(existing.carga) : '');
  const [logId, setLogId] = useState<number | null>(existing?.id ?? null);
  const [rpe, setRpe] = useState<number | null>(existing?.rpe ?? null);
  const isFilled = logId !== null;
  const rpeCategory = rpeValueToCategory(rpe);
  const cargaInputRef = useRef<TextInput>(null);

  const commit = async () => {
    // reps and carga are NOT NULL columns, so a row can't be persisted with
    // only one of them filled in. Wait until BOTH have real values before
    // writing anything — otherwise blurring the first field (to move into
    // the second) would write the still-empty one as a literal 0, which both
    // shows up as a false "0" once the card collapses/reopens and prematurely
    // counts this série as done.
    if (reps.trim() === '' || carga.trim() === '') {
      return;
    }

    const repsNum = Number(reps);
    const cargaNum = Number(carga);
    if (!Number.isFinite(repsNum) || !Number.isFinite(cargaNum)) {
      return;
    }

    try {
      if (logId) {
        await db.update(setLogs).set({ reps: repsNum, carga: cargaNum }).where(eq(setLogs.id, logId));
      } else {
        const [created] = await db
          .insert(setLogs)
          .values({ sessionId, exerciseId, numeroSerie, reps: repsNum, carga: cargaNum })
          .returning();
        setLogId(created.id);
      }
    } catch (err) {
      reportError('Erro ao salvar série', err);
    }
  };

  // Avanço de foco disparado só por ação explícita do teclado (onSubmitEditing
  // — "next"/"done" no Android, ou o botão da barra acima do teclado no iOS),
  // nunca por debounce/tempo parado digitando. Um debounce arriscaria repetir
  // o bug antigo do colapso automático (fechava o card no meio da digitação e
  // gravava um "0" fantasma) — um evento de submit explícito não tem esse
  // risco, porque só dispara quando o usuário decide que terminou o campo.
  // Mover o foco (reps -> carga) já dispara o blur do campo anterior sozinho,
  // então o commit() de sempre (no onBlur) continua sendo o único ponto que
  // escreve no banco — nada aqui grava dado diretamente.
  const handleRepsSubmit = useCallback(() => {
    cargaInputRef.current?.focus();
  }, []);

  const handleCargaSubmit = useCallback(() => {
    if (isLastSerie) {
      Keyboard.dismiss();
    } else {
      focusReps(numeroSerie + 1);
    }
  }, [isLastSerie, focusReps, numeroSerie]);

  // Ref estável (não uma arrow function inline) — senão React desregistraria
  // e reregistraria o input no Map do card pai a cada re-render (ou seja, a
  // cada tecla digitada), já que uma callback ref nova sempre dispara
  // detach+attach mesmo sendo o mesmo elemento nativo.
  const setRepsInputRef = useCallback(
    (ref: TextInput | null) => registerRepsInput(numeroSerie, ref),
    [registerRepsInput, numeroSerie]
  );

  const handleSetRpe = async (category: RpeCategory) => {
    if (!logId) return;
    const value = RPE_CATEGORY_VALUE[category];
    const nextValue = rpe === value ? null : value; // toca de novo na mesma = desmarca
    setRpe(nextValue);
    try {
      await db.update(setLogs).set({ rpe: nextValue }).where(eq(setLogs.id, logId));
    } catch (err) {
      reportError('Erro ao salvar RPE', err);
    }
  };

  return (
    <View className="mb-3">
      <View className="flex-row items-center gap-3">
        <Label className={`w-16 ${isFilled ? 'text-accent' : ''}`}>{`Série ${numeroSerie}`}</Label>
        <View className="flex-1">
          <Input
            ref={setRepsInputRef}
            value={reps}
            onChangeText={setReps}
            onBlur={commit}
            onFocus={() => setAdvance({ run: handleRepsSubmit, label: 'Próximo' })}
            onSubmitEditing={handleRepsSubmit}
            returnKeyType="next"
            inputAccessoryViewID={accessoryViewId}
            keyboardType="number-pad"
            placeholder="0"
            className={`text-center font-display ${modoTreino ? 'text-4xl' : 'text-2xl'}`}
          />
        </View>
        <View className="flex-1">
          <Input
            ref={cargaInputRef}
            value={carga}
            onChangeText={setCarga}
            onBlur={commit}
            onFocus={() =>
              setAdvance({ run: handleCargaSubmit, label: isLastSerie ? 'Concluir' : 'Próximo' })
            }
            onSubmitEditing={handleCargaSubmit}
            returnKeyType={isLastSerie ? 'done' : 'next'}
            inputAccessoryViewID={accessoryViewId}
            keyboardType="decimal-pad"
            placeholder="0"
            className={`text-center font-display ${modoTreino ? 'text-4xl' : 'text-2xl'}`}
          />
        </View>
      </View>

      {isFilled && showRestButton && (
        <Pressable
          onPress={onRequestRest}
          className="mt-2 ml-16 flex-row items-center justify-center gap-2 rounded border border-accent py-3">
          <Ionicons name="time-outline" size={22} color={colors.accent} />
          <Text className="font-label uppercase text-accent">{`Iniciar descanso · ${suggestedRestSeconds}s`}</Text>
        </Pressable>
      )}

      {isFilled && !modoTreino && (
        <View className="ml-16 mt-2 flex-row gap-2">
          {RPE_CATEGORY_ORDER.map((category) => (
            <Chip
              key={category}
              label={RPE_CATEGORY_LABEL[category]}
              selected={rpeCategory === category}
              onPress={() => handleSetRpe(category)}
            />
          ))}
        </View>
      )}
    </View>
  );
}
