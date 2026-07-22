import { memo, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProgressBar } from '@/components/ui/progress-bar';
import { db } from '@/db';
import {
  exercises,
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
import { colors } from '@/theme/tokens';

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
      await db.insert(sessions).values({ workoutDayId: dayId, data: todayStr, concluida: false });
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
              <Label className="mt-1">{formatShortDateLabel(item.data)}</Label>
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

type LogEntry = { id: number; numeroSerie: number; reps: number; carga: number };

function SessionExecution({ session }: { session: Session }) {
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
        exerciseNome: exercises.nome,
      })
      .from(workoutDayExercises)
      .innerJoin(exercises, eq(workoutDayExercises.exerciseId, exercises.id))
      .where(eq(workoutDayExercises.dayId, session.workoutDayId)),
    [session.workoutDayId]
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
      list.push({ id: log.id, numeroSerie: log.numeroSerie, reps: log.reps, carga: log.carga });
      map.set(log.exerciseId, list);
    }
    return map;
  }, [logs]);

  const totalSeries = useMemo(
    () => (dayExerciseRows ?? []).reduce((sum, ex) => sum + ex.seriesAlvo, 0),
    [dayExerciseRows]
  );
  const completedSeries = logs?.length ?? 0;

  const handleComplete = async () => {
    try {
      await db.update(sessions).set({ concluida: true }).where(eq(sessions.id, session.id));
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
              await db.delete(sessions).where(eq(sessions.id, session.id));
            } catch (err) {
              reportError('Erro ao cancelar sessão', err);
            }
          },
        },
      ]
    );
  };

  return (
    <View>
      <Text className="mb-1 font-display text-5xl uppercase text-text">{dayLabel}</Text>

      {session.concluida && (
        <Card className="mb-4 mt-3 border-l-4 border-l-success">
          <Text className="text-center font-label uppercase text-success">Treino concluído</Text>
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

      {(dayExerciseRows ?? []).map((ex) => (
        <ExerciseSessionCard
          key={ex.id}
          exercise={ex}
          sessionId={session.id}
          logs={logsByExercise.get(ex.exerciseId) ?? EMPTY_LOGS}
        />
      ))}

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

const EMPTY_LOGS: LogEntry[] = [];

type DayExerciseRow = {
  id: number;
  exerciseId: number;
  seriesAlvo: number;
  repsAlvo: number;
  cargaAlvo: number | null;
  exerciseNome: string;
};

function logsAreEqual(a: LogEntry[], b: LogEntry[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const bBySerie = new Map(b.map((log) => [log.numeroSerie, log]));
  for (const log of a) {
    const match = bBySerie.get(log.numeroSerie);
    if (!match || match.id !== log.id || match.reps !== log.reps || match.carga !== log.carga) {
      return false;
    }
  }
  return true;
}

const ExerciseSessionCard = memo(
  function ExerciseSessionCard({
    exercise,
    sessionId,
    logs,
  }: {
    exercise: DayExerciseRow;
    sessionId: number;
    logs: LogEntry[];
  }) {
    const logsBySerie = useMemo(() => {
      const map = new Map<number, LogEntry>();
      for (const log of logs) map.set(log.numeroSerie, log);
      return map;
    }, [logs]);

    const seriesNumbers = Array.from({ length: exercise.seriesAlvo }, (_, i) => i + 1);
    const completedCount = logs.length;
    const isComplete = completedCount === exercise.seriesAlvo;
    const isStarted = completedCount > 0;

    // Collapse is manual-only (never auto-triggered by data changes): toggled
    // exclusively by the header Pressable below. Auto-collapsing on
    // completion used to fire mid-fill of the last field, since a
    // still-typing series briefly looked "complete" the instant the other
    // field's blur wrote a value.
    const [collapsed, setCollapsed] = useState(false);

    const targetLabel = `${exercise.seriesAlvo}x${exercise.repsAlvo}${
      exercise.cargaAlvo != null ? ` · ${exercise.cargaAlvo}kg` : ''
    }`;

    return (
      <Card className={`mb-4 ${isComplete ? 'border-l-4 border-l-accent' : ''}`}>
        <Pressable
          onPress={() => setCollapsed((c) => !c)}
          className="flex-row items-center justify-between">
          <Text className="flex-1 pr-2 font-card-title text-lg text-text" numberOfLines={1}>
            {exercise.exerciseNome}
          </Text>
          <View className="flex-row items-center gap-2">
            {isComplete ? (
              <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
            ) : isStarted ? (
              <Label>{`${completedCount}/${exercise.seriesAlvo}`}</Label>
            ) : null}
            <Ionicons
              name={collapsed ? 'chevron-down' : 'chevron-up'}
              size={18}
              color={colors.muted}
            />
          </View>
        </Pressable>

        {collapsed ? (
          <Label className="mt-1">{targetLabel}</Label>
        ) : (
          <>
            <Label className="mb-3 mt-1">{`Alvo: ${targetLabel}`}</Label>

            {seriesNumbers.map((numeroSerie) => (
              <SetRow
                key={numeroSerie}
                sessionId={sessionId}
                exerciseId={exercise.exerciseId}
                numeroSerie={numeroSerie}
                existing={logsBySerie.get(numeroSerie)}
              />
            ))}
          </>
        )}
      </Card>
    );
  },
  (prev, next) =>
    prev.exercise === next.exercise &&
    prev.sessionId === next.sessionId &&
    logsAreEqual(prev.logs, next.logs)
);

function SetRow({
  sessionId,
  exerciseId,
  numeroSerie,
  existing,
}: {
  sessionId: number;
  exerciseId: number;
  numeroSerie: number;
  existing: LogEntry | undefined;
}) {
  const [reps, setReps] = useState(existing !== undefined ? String(existing.reps) : '');
  const [carga, setCarga] = useState(existing !== undefined ? String(existing.carga) : '');
  const [logId, setLogId] = useState<number | null>(existing?.id ?? null);
  const isFilled = logId !== null;

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

  return (
    <View className="mb-3 flex-row items-center gap-3">
      <Label className={`w-16 ${isFilled ? 'text-accent' : ''}`}>{`Série ${numeroSerie}`}</Label>
      <View className="flex-1">
        <Input
          value={reps}
          onChangeText={setReps}
          onBlur={commit}
          keyboardType="number-pad"
          placeholder="0"
          className="text-center font-display text-2xl"
        />
      </View>
      <View className="flex-1">
        <Input
          value={carga}
          onChangeText={setCarga}
          onBlur={commit}
          keyboardType="decimal-pad"
          placeholder="0"
          className="text-center font-display text-2xl"
        />
      </View>
    </View>
  );
}
