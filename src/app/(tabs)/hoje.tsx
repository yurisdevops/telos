import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  InputAccessoryView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  Vibration,
  View,
  useWindowDimensions,
} from 'react-native';
import { eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '@/components/screen';
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  WorkoutShareCard,
  type WorkoutShareMetrics,
} from '@/components/share/workout-share-card';
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
import {
  cancelRestEndNotification,
  ensureRestNotificationPermission,
  scheduleRestEndNotification,
} from '@/lib/rest-notification';
import { RPE_CATEGORY_LABEL, RPE_CATEGORY_ORDER, RPE_CATEGORY_VALUE, rpeValueToCategory, type RpeCategory } from '@/lib/rpe';
import { suggestNextLoad } from '@/lib/suggest-load';
import { suggestRestSeconds } from '@/lib/suggest-rest';
import { shareWorkoutImage } from '@/lib/share-image';
import { formatLastPerformance, useLastPerformance } from '@/lib/use-last-performance';
import { colors } from '@/theme/tokens';

const DEFAULT_REST_SECONDS = 90;
// Padrão longo e repetido (não o pulso único do expo-haptics) — pra ser
// percebido com o celular na bancada. Repete até o usuário fechar o overlay
// ou até o teto de segurança abaixo, o que vier primeiro.
const REST_DONE_VIBRATION_PATTERN = [0, 700, 400, 700, 400, 700];
const REST_DONE_VIBRATION_MAX_MS = 20000;

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

type LogEntry = {
  id: number;
  numeroSerie: number;
  reps: number;
  carga: number;
  rpe: number | null;
  pesoCorporal: boolean;
};

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
  dica: string | null;
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
    a.equipamento === b.equipamento &&
    a.dica === b.dica
  );
}

function SessionExecution({ session }: { session: Session }) {
  const router = useRouter();
  const now = useNow(1000);
  // Cobertura do card de compartilhamento escondido (ver render abaixo) —
  // tamanho de tela real, sempre maior que o card, sem precisar sincronizar
  // com as dimensões internas de WorkoutShareCard.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

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
        dica: exercises.dica,
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
        dica: exercises.dica,
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
      list.push({
        id: log.id,
        numeroSerie: log.numeroSerie,
        reps: log.reps,
        carga: log.carga,
        rpe: log.rpe,
        pesoCorporal: log.pesoCorporal,
      });
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
        dica: ex.dica,
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
      dica: ex.dica,
    }));
    return [...planItems, ...extraItems];
  }, [dayExerciseRows, extraExerciseRows, skipByDayExerciseId]);

  const activeItems = items.filter((item) => !item.skipped);
  const totalSeries = activeItems.reduce((sum, item) => sum + item.seriesAlvo, 0);
  const completedSeries = activeItems.reduce(
    (sum, item) => sum + Math.min(logsByExercise.get(item.exerciseId)?.length ?? 0, item.seriesAlvo),
    0
  );

  // Volume total em kg (Σ reps×carga), excluindo peso corporal — mesma regra
  // já aplicada nos cálculos de Progresso (carga 0 por convenção não é carga
  // real). `logs` já é a query única de set_logs da sessão, sem query nova.
  const volumeKg = useMemo(
    () =>
      Math.round(
        (logs ?? []).filter((log) => !log.pesoCorporal).reduce((sum, log) => sum + log.reps * log.carga, 0)
      ),
    [logs]
  );

  // Métricas do card de compartilhamento — tudo já em memória (nenhuma query
  // nova): duração igual ao Label visível acima, séries reaproveita
  // `completedSeries` (o mesmo número já mostrado na barra de progresso, pra
  // nunca divergir do que a tela exibe), exercícios conta só os ativos
  // (não pulados).
  const shareMetrics: WorkoutShareMetrics = useMemo(
    () => ({
      dayLabel,
      dateLabel: formatShortDateLabel(session.data),
      durationLabel:
        session.horaInicio != null && session.horaFim != null
          ? formatElapsed(session.horaFim - session.horaInicio)
          : null,
      volumeKg,
      totalSeries: completedSeries,
      totalExercises: activeItems.length,
    }),
    [dayLabel, session.data, session.horaInicio, session.horaFim, volumeKg, completedSeries, activeItems.length]
  );

  // O card fica sempre montado (fora da tela, ver render abaixo) desde que a
  // sessão existe, recalculando as métricas a cada mudança. Mesmo assim,
  // `captureRef` (view-shot) espera pelo menos um onLayout antes da view
  // estar pronta pra captura — `cardReady` (setado no onLayout do card)
  // desabilita o botão de compartilhar até lá, então nunca dá pra tocar
  // antes da hora (na prática isso já é verdade antes do primeiro render do
  // próprio botão, já que ele só aparece quando session.concluida).
  const shareCardRef = useRef<View>(null);
  const [cardReady, setCardReady] = useState(false);
  const handleShareImage = useCallback(async () => {
    await shareWorkoutImage(shareCardRef, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  }, []);

  const handleComplete = async () => {
    try {
      await db
        .update(sessions)
        .set({
          concluida: true,
          restTimerStartedAt: null,
          // Só grava horaFim na primeira conclusão — reconcluir um treino
          // reaberto preserva o horário original, senão a duração fica
          // inflada pelo tempo que a sessão ficou reaberta parada.
          ...(session.horaFim == null ? { horaFim: Date.now() } : {}),
        })
        .where(eq(sessions.id, session.id));
      await cancelRestEndNotification();
    } catch (err) {
      reportError('Erro ao concluir treino', err);
    }
  };

  const handleReopen = () => {
    Alert.alert(
      'Reabrir treino?',
      'O treino volta pro estado editável — você poderá corrigir séries, cargas e exercícios, e concluir de novo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reabrir',
          onPress: async () => {
            try {
              await db.update(sessions).set({ concluida: false }).where(eq(sessions.id, session.id));
            } catch (err) {
              reportError('Erro ao reabrir treino', err);
            }
          },
        },
      ]
    );
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
        const granted = await ensureRestNotificationPermission();
        if (granted) await scheduleRestEndNotification(suggestedSeconds);
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
        if (session.restTimerStartedAt != null) {
          const elapsedSeconds = (Date.now() - session.restTimerStartedAt) / 1000;
          await scheduleRestEndNotification(next - elapsedSeconds);
        }
      } catch (err) {
        reportError('Erro ao ajustar descanso', err);
      }
    },
    [session.id, session.restTimerDurationSeconds, session.restTimerStartedAt]
  );

  const cancelRestTimer = useCallback(async () => {
    try {
      await db.update(sessions).set({ restTimerStartedAt: null }).where(eq(sessions.id, session.id));
      await cancelRestEndNotification();
    } catch (err) {
      reportError('Erro ao cancelar descanso', err);
    }
  }, [session.id]);

  const restRemaining =
    session.restTimerStartedAt != null
      ? (session.restTimerDurationSeconds ?? DEFAULT_REST_SECONDS) - (now - session.restTimerStartedAt) / 1000
      : null;

  // Depende do booleano (não de `restRemaining` bruto, que muda a cada
  // segundo) — senão o efeito re-executaria a cada tick e cancelaria o timeout
  // de segurança antes da hora. Assim ele só dispara na transição pra "pronto"
  // e só limpa (cancela a vibração) na transição de volta pra null/reiniciado.
  const isRestDone = restRemaining !== null && restRemaining <= 0;
  useEffect(() => {
    if (!isRestDone) return;
    Vibration.vibrate(REST_DONE_VIBRATION_PATTERN, true);
    const safetyTimeout = setTimeout(() => Vibration.cancel(), REST_DONE_VIBRATION_MAX_MS);
    return () => {
      clearTimeout(safetyTimeout);
      Vibration.cancel();
    };
  }, [isRestDone]);

  return (
    <View>
      {/* Escondido do usuário, mas DENTRO dos limites da tela — não a
          -9999pt de distância (o Android pula a pintura de views longe
          demais de qualquer viewport real, o que gerava PNG válido só que
          vazio/preto no captureRef). Aqui o card fica em (0,0) de verdade,
          só que coberto por cima por uma View opaca do tamanho da tela
          inteira — visualmente invisível pro usuário, mas realmente pintado
          pelo Android, então o captureRef captura o conteúdo de verdade.
          pointerEvents="none" no wrapper garante que nada aqui dentro
          intercepta toque — os controles reais da tela continuam abaixo. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0 }}>
        <WorkoutShareCard
          ref={shareCardRef}
          metrics={shareMetrics}
          onLayout={() => setCardReady(true)}
          style={{ position: 'absolute', top: 0, left: 0 }}
        />
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: windowWidth,
            height: windowHeight,
            zIndex: 1,
            backgroundColor: colors.bg,
          }}
        />
      </View>

      <Text className="mb-1 font-display text-5xl uppercase text-text" numberOfLines={1}>
        {dayLabel}
      </Text>

      {session.horaInicio != null && (
        <Label className="mb-1">
          {session.concluida && session.horaFim != null
            ? `Duração: ${formatElapsed(session.horaFim - session.horaInicio)}`
            : `Em andamento: ${formatElapsed(now - session.horaInicio)}`}
        </Label>
      )}

      {session.concluida && (
        <Card className="mb-4 mt-3 border-l-4 border-l-success">
          <Text className="text-center font-label uppercase text-success">Treino concluído</Text>
        </Card>
      )}

      {session.concluida && (
        <Button variant="secondary" className="mb-3" onPress={handleReopen}>
          Reabrir treino
        </Button>
      )}

      {session.concluida && (
        <Button className="mb-4" disabled={!cardReady} onPress={handleShareImage}>
          <View className="flex-row items-center gap-2">
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text className="font-label text-sm uppercase tracking-wide text-white">Compartilhar treino</Text>
          </View>
        </Button>
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
  // Ativa enquanto este overlay estiver montado (ou seja, exatamente enquanto
  // o timer está rodando ou mostrando "concluído") e desativa sozinho ao
  // desmontar — não precisa de start/stop manual.
  useKeepAwake();

  const isDone = restRemaining <= 0;

  // "Respiração" de tom no estado "concluído" — o fundo fica accent sólido
  // (tela inteira, não mais uma caixinha) e uma camada preta semi-transparente
  // por cima pulsa de opacidade 0 a ~0,2, escurecendo levemente o accent e
  // voltando — visualmente equivalente a variar entre accent e uma versão
  // ~20% mais escura dele, sem precisar animar backgroundColor diretamente
  // (que não é compatível com useNativeDriver: só transform/opacity são).
  // ~1500ms por meia-fase, ~3s por ciclo completo — bem devagar, entre tons
  // próximos, nunca um flash (risco de fotossensibilidade é o motivo). Roda
  // só enquanto isDone; para e reseta no cleanup do efeito, que dispara
  // tanto na transição de volta pra "contando" quanto no desmonte do overlay
  // inteiro.
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isDone) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();

    return () => {
      loop.stop();
      breathe.setValue(0);
    };
  }, [isDone, breathe]);

  const breatheOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0, 0.2] });

  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: isDone ? colors.accent : 'rgba(20,20,20,0.94)' }}
      >
        {isDone && (
          // pointerEvents="none": é só uma camada visual por cima do fundo,
          // não pode interceptar o toque no botão "Fechar" logo abaixo.
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: '#000000',
              opacity: breatheOpacity,
            }}
          />
        )}

        {!isDone && <Label>Descanso</Label>}

        {isDone ? (
          <View className="my-6 items-center justify-center">
            <Ionicons name="checkmark-circle" size={112} color="#FFFFFF" />
            <Text
              className="mt-4 text-center font-display text-6xl uppercase text-white"
              numberOfLines={2}
              adjustsFontSizeToFit
            >
              Descanso concluído
            </Text>
          </View>
        ) : (
          <View className="my-6 items-center justify-center rounded-lg border-2 border-accent bg-surface px-10 py-8">
            <Text
              className="font-display text-8xl text-accent"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatCountdown(restRemaining)}
            </Text>
          </View>
        )}

        {!isDone && (
          <View className="mb-8 flex-row items-center gap-4">
            <Button variant="primary" onPress={() => onAdjust(-30)} className="px-8 py-4">
              <Text className="font-label text-base uppercase tracking-wide text-white">-30s</Text>
            </Button>
            <Button variant="primary" onPress={() => onAdjust(30)} className="px-8 py-4">
              <Text className="font-label text-base uppercase tracking-wide text-white">+30s</Text>
            </Button>
          </View>
        )}

        <Pressable
          onPress={onDismiss}
          className={`w-full max-w-xs rounded border py-4 ${isDone ? 'border-white' : 'border-accent'}`}>
          <Text className={`text-center font-label uppercase ${isDone ? 'text-white' : 'text-accent'}`}>
            Fechar
          </Text>
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
      match.rpe !== log.rpe ||
      match.pesoCorporal !== log.pesoCorporal
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
  }: {
    item: SessionExerciseItem;
    sessionId: number;
    logs: LogEntry[];
    onSkip: (workoutDayExerciseId: number) => void;
    onUnskip: (skipId: number) => void;
    onRemove: (extraId: number, hasLogs: boolean) => void;
    onRequestRest: (suggestedSeconds: number) => void;
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

    // Colapso automático quando o exercício completa (todas as séries
    // preenchidas) — só entra em jogo depois de pronto; enquanto incompleto,
    // fica sempre expandido (nada muda pro fluxo de preenchimento em si). O
    // botão de "Iniciar descanso" continua acessível no resumo colapsado
    // (abaixo) — evitando repetir o bug antigo de esconder essa ação bem no
    // momento em que ela aparece, ao preencher a última série.
    const [manualExpanded, setManualExpanded] = useState(false);
    const expanded = !isComplete || manualExpanded;

    const targetLabel = `${item.seriesAlvo}x${item.repsAlvo}${
      item.cargaAlvo != null ? ` · ${item.cargaAlvo}kg` : ''
    }`;

    // Resumo do card colapsado (só relevante quando isComplete, mas o cálculo
    // em si é barato e já vem de `logs`, sem query nova). Peso corporal sai do
    // cálculo de maior carga (é 0 por convenção, não uma carga real) — se
    // TODAS as séries forem peso corporal, mostra "PC" em vez de "0kg".
    const weightedLogs = logs.filter((log) => !log.pesoCorporal);
    const maiorCarga = weightedLogs.length > 0 ? Math.max(...weightedLogs.map((log) => log.carga)) : 0;
    const allPesoCorporal = logs.length > 0 && logs.every((log) => log.pesoCorporal);
    const completedSummaryLabel =
      maiorCarga > 0
        ? `${item.seriesAlvo}× · ${maiorCarga}kg`
        : allPesoCorporal
          ? `${item.seriesAlvo}× · PC`
          : `${item.seriesAlvo}×`;

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
            onPress={() => isComplete && setManualExpanded((v) => !v)}
            className="flex-row items-center justify-between">
            <Text className="flex-1 pr-2 font-card-title text-lg text-text" numberOfLines={1}>
              {item.exerciseNome}
            </Text>
          <View className="flex-row items-center gap-2">
            {isComplete ? (
              <>
                <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                {!expanded && <Label className="text-accent">{completedSummaryLabel}</Label>}
              </>
            ) : isStarted ? (
              <Label>{`${completedCount}/${item.seriesAlvo}`}</Label>
            ) : null}
            {isComplete && (
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.muted}
              />
            )}
          </View>
        </Pressable>

        {(canSkip || canRemove) && (
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

        {!expanded ? (
          item.isLastInSupersetGroup && (
            <Pressable
              onPress={handleRequestRest}
              className="mt-3 flex-row items-center justify-center gap-2 rounded border border-accent py-3">
              <Ionicons name="time-outline" size={22} color={colors.accent} />
              <Text className="font-label uppercase text-accent">{`Iniciar descanso · ${suggestedRestSeconds}s`}</Text>
            </Pressable>
          )
        ) : (
          <>
            <Label className="mt-1">{`Alvo: ${targetLabel}`}</Label>
            {item.dica && (
              <Card className="mb-1 mt-2 border-l-4 border-l-accent">
                <Text className="font-body text-sm text-text">{item.dica}</Text>
              </Card>
            )}
            {nota && <Label className="mt-1 italic text-muted">{nota}</Label>}
            <Label className="mt-1 text-muted">
              {lastPerformanceLabel ? `Última vez: ${lastPerformanceLabel}` : ' '}
            </Label>
            {loadSuggestionLabel ? (
              <Label className="mb-3 mt-1 text-accent">{loadSuggestionLabel}</Label>
            ) : (
              <View className="mb-3" />
            )}

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
  accessoryViewId: string;
  registerRepsInput: (numeroSerie: number, ref: TextInput | null) => void;
  focusReps: (numeroSerie: number) => void;
  setAdvance: (advance: { run: () => void; label: string }) => void;
}) {
  const [reps, setReps] = useState(existing !== undefined ? String(existing.reps) : '');
  // Carga gravada como 0 (sentinela) numa série de peso corporal não é um
  // texto útil de reexibir — nasce em branco tanto ao ligar o toggle quanto
  // ao carregar uma série já salva assim, forçando reentrada explícita se o
  // usuário desligar o peso corporal depois (nunca reaproveita o "0" antigo
  // como se fosse uma carga real digitada).
  const [carga, setCarga] = useState(
    existing !== undefined && !existing.pesoCorporal ? String(existing.carga) : ''
  );
  const [pesoCorporal, setPesoCorporal] = useState(existing?.pesoCorporal ?? false);
  const [logId, setLogId] = useState<number | null>(existing?.id ?? null);
  const [rpe, setRpe] = useState<number | null>(existing?.rpe ?? null);
  const isFilled = logId !== null;
  const rpeCategory = rpeValueToCategory(rpe);
  const cargaInputRef = useRef<TextInput>(null);

  // Aceita um override explícito de pesoCorporal pro caso do toggle: como
  // setState é assíncrono, o handler do toggle não pode confiar no valor de
  // `pesoCorporal` já atualizado no mesmo tick — passa o valor novo direto.
  const commit = async (pesoCorporalOverride?: boolean) => {
    const effectivePesoCorporal = pesoCorporalOverride ?? pesoCorporal;

    // reps and carga are NOT NULL columns, so a row can't be persisted
    // without reps. Carga só é exigida quando NÃO é peso corporal — peso
    // corporal sempre grava carga 0 (sentinela) sem exigir texto no campo,
    // já que ele nem aparece nesse caso. Continua esperando as duas partes
    // reais antes de gravar (senão a mesma condição de corrida de sempre:
    // blurrar o primeiro campo gravaria o segundo, ainda vazio, como 0).
    if (reps.trim() === '' || (!effectivePesoCorporal && carga.trim() === '')) {
      return;
    }

    const repsNum = Number(reps);
    const cargaNum = effectivePesoCorporal ? 0 : Number(carga);
    if (!Number.isFinite(repsNum) || !Number.isFinite(cargaNum)) {
      return;
    }

    try {
      if (logId) {
        await db
          .update(setLogs)
          .set({ reps: repsNum, carga: cargaNum, pesoCorporal: effectivePesoCorporal })
          .where(eq(setLogs.id, logId));
      } else {
        const [created] = await db
          .insert(setLogs)
          .values({
            sessionId,
            exerciseId,
            numeroSerie,
            reps: repsNum,
            carga: cargaNum,
            pesoCorporal: effectivePesoCorporal,
          })
          .returning();
        setLogId(created.id);
      }
    } catch (err) {
      reportError('Erro ao salvar série', err);
    }
  };

  const handleTogglePesoCorporal = () => {
    const next = !pesoCorporal;
    setPesoCorporal(next);
    if (next) setCarga('');
    commit(next);
  };

  // Realce de RPE + descanso ao concluir a série normalmente (ver abaixo) —
  // acende suave e desvanece sozinho, ou some no primeiro toque em RPE/
  // descanso. Nunca um flash rápido (mesmo cuidado do overlay de fim de
  // descanso): ~700ms pra acender, ~1,2s de espera, ~900ms pra desvanecer.
  const [highlightActive, setHighlightActive] = useState(false);
  const highlightOpacity = useRef(new Animated.Value(0)).current;

  const triggerHighlight = useCallback(() => setHighlightActive(true), []);
  const clearHighlight = useCallback(() => setHighlightActive(false), []);

  useEffect(() => {
    if (!highlightActive) {
      highlightOpacity.setValue(0);
      return;
    }
    const sequence = Animated.sequence([
      Animated.timing(highlightOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.delay(1200),
      Animated.timing(highlightOpacity, {
        toValue: 0,
        duration: 900,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]);
    sequence.start(({ finished }) => {
      if (finished) setHighlightActive(false);
    });
    return () => {
      sequence.stop();
      highlightOpacity.setValue(0);
    };
  }, [highlightActive, highlightOpacity]);

  // Dois gatilhos, dois papéis — não são a mesma ação disfarçada:
  //
  // - *AdvanceShortcut (ligado ao botão da barra do teclado via setAdvance,
  //   iOS): atalho de velocidade, preserva o comportamento antigo (pula pra
  //   próxima série). É a ÚNICA forma de "submeter" um campo number-pad/
  //   decimal-pad no iOS — esses teclados não têm tecla de retorno nativa lá,
  //   então esse botão manual é o único jeito de sair do campo continuando o
  //   fluxo rápido.
  // - *Done (ligado a onSubmitEditing, dispara com a tecla "next"/"done" do
  //   teclado nativo — só existe de fato no Android, já que o iOS nunca gera
  //   esse evento pra esses teclados): fluxo novo, fecha o teclado e conduz
  //   ao RPE/descanso em vez de pular direto pra próxima série.
  //
  // Como as duas plataformas nunca dividem o mesmo caminho físico (no iOS só
  // o toque na barra existe; no Android só a tecla nativa existe), não há
  // conflito real entre elas — são handlers diferentes.
  const handleRepsAdvanceShortcut = useCallback(() => {
    if (pesoCorporal) {
      if (isLastSerie) {
        Keyboard.dismiss();
      } else {
        focusReps(numeroSerie + 1);
      }
    } else {
      cargaInputRef.current?.focus();
    }
  }, [pesoCorporal, isLastSerie, focusReps, numeroSerie]);

  // Com peso corporal ativo, reps é o último campo focável da linha (carga
  // vira um rótulo fixo "PC", não-focável) — então é aqui, não na carga, que
  // o fluxo novo se aplica.
  const handleRepsDone = useCallback(() => {
    if (pesoCorporal) {
      Keyboard.dismiss();
      triggerHighlight();
    } else {
      cargaInputRef.current?.focus();
    }
  }, [pesoCorporal, triggerHighlight]);

  const handleCargaAdvanceShortcut = useCallback(() => {
    if (isLastSerie) {
      Keyboard.dismiss();
    } else {
      focusReps(numeroSerie + 1);
    }
  }, [isLastSerie, focusReps, numeroSerie]);

  const handleCargaDone = useCallback(() => {
    Keyboard.dismiss();
    triggerHighlight();
  }, [triggerHighlight]);

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
            onBlur={() => commit()}
            onFocus={() =>
              setAdvance({
                run: handleRepsAdvanceShortcut,
                label: pesoCorporal && isLastSerie ? 'Concluir' : 'Próximo',
              })
            }
            onSubmitEditing={handleRepsDone}
            returnKeyType={pesoCorporal ? 'done' : 'next'}
            inputAccessoryViewID={accessoryViewId}
            keyboardType="number-pad"
            placeholder="0"
            className="text-center font-display text-2xl"
          />
        </View>
        <View className="flex-1 flex-row items-center gap-1">
          {pesoCorporal ? (
            <View className="flex-1 items-center justify-center rounded border border-accent bg-surface py-3">
              <Text className="font-display text-2xl text-accent">PC</Text>
            </View>
          ) : (
            <Input
              ref={cargaInputRef}
              value={carga}
              onChangeText={setCarga}
              onBlur={() => commit()}
              onFocus={() =>
                setAdvance({ run: handleCargaAdvanceShortcut, label: isLastSerie ? 'Concluir' : 'Próximo' })
              }
              onSubmitEditing={handleCargaDone}
              returnKeyType="done"
              inputAccessoryViewID={accessoryViewId}
              keyboardType="decimal-pad"
              placeholder="0"
              className="flex-1 text-center font-display text-2xl"
            />
          )}
          <Pressable
            onPress={handleTogglePesoCorporal}
            hitSlop={8}
            className="p-1"
            accessibilityLabel="Marcar série como peso corporal">
            <Ionicons name="body-outline" size={20} color={pesoCorporal ? colors.accent : colors.muted} />
          </Pressable>
        </View>
      </View>

      {isFilled && showRestButton && (
        <View className="relative mt-2 ml-16">
          {highlightActive && <HighlightRing opacity={highlightOpacity} />}
          <Pressable
            onPress={() => {
              clearHighlight();
              onRequestRest();
            }}
            className="flex-row items-center justify-center gap-2 rounded border border-accent py-3">
            <Ionicons name="time-outline" size={22} color={colors.accent} />
            <Text className="font-label uppercase text-accent">{`Iniciar descanso · ${suggestedRestSeconds}s`}</Text>
          </Pressable>
        </View>
      )}

      {isFilled && (
        <View className="relative ml-16 mt-2">
          {highlightActive && <HighlightRing opacity={highlightOpacity} />}
          <View className="flex-row gap-2">
            {RPE_CATEGORY_ORDER.map((category) => (
              <Chip
                key={category}
                label={RPE_CATEGORY_LABEL[category]}
                selected={rpeCategory === category}
                onPress={() => {
                  clearHighlight();
                  handleSetRpe(category);
                }}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// Anel de realce (glow) sobreposto — chama atenção pro RPE/descanso sem
// obscurecer o conteúdo embaixo: só uma borda accent que acende e desvanece
// via opacity (transform/opacity são o que useNativeDriver anima; nunca cor).
// pointerEvents="none" pra nunca capturar o toque que deveria ir pro chip ou
// pro botão logo abaixo dela na pilha.
function HighlightRing({ opacity }: { opacity: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -4,
        left: -4,
        right: -4,
        bottom: -4,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: colors.accent,
        opacity,
      }}
    />
  );
}
