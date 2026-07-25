import { useMemo, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import {
  exercises,
  sessionExtraExercises,
  sessions,
  sessionSkips,
  setLogs,
  workoutDays,
} from '@/db/schema';
import { formatShortDateLabel } from '@/lib/date';
import { formatElapsed } from '@/lib/duration';
import { colors } from '@/theme/tokens';

export default function SessaoDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Number(id);

  const { data: sessionRows } = useLiveQuery(
    db
      .select({
        id: sessions.id,
        workoutDayId: sessions.workoutDayId,
        data: sessions.data,
        concluida: sessions.concluida,
        horaInicio: sessions.horaInicio,
        horaFim: sessions.horaFim,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId)),
    [sessionId]
  );
  const session = sessionRows?.[0];

  const { data: dayRows } = useLiveQuery(
    db.select({ label: workoutDays.label }).from(workoutDays).where(eq(workoutDays.id, session?.workoutDayId ?? -1)),
    [session?.workoutDayId]
  );
  const dayLabel = dayRows?.[0]?.label;

  const { data: logRows } = useLiveQuery(
    db
      .select({
        id: setLogs.id,
        exerciseId: setLogs.exerciseId,
        exerciseNome: exercises.nome,
        numeroSerie: setLogs.numeroSerie,
        reps: setLogs.reps,
        carga: setLogs.carga,
      })
      .from(setLogs)
      .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
      .where(eq(setLogs.sessionId, sessionId))
      .orderBy(setLogs.id),
    [sessionId]
  );

  // Agrupado por exercício preservando a ordem em que apareceram na sessão
  // (ordem de inserção do set_logs.id) — não depende de workout_day_exercises
  // nem session_extra_exercises, então funciona igual pra exercício do plano
  // ou avulso, sem distinção nenhuma.
  const groups = useMemo(() => {
    const order: number[] = [];
    const map = new Map<number, { exerciseId: number; exerciseNome: string; sets: NonNullable<typeof logRows> }>();
    for (const row of logRows ?? []) {
      if (!map.has(row.exerciseId)) {
        order.push(row.exerciseId);
        map.set(row.exerciseId, { exerciseId: row.exerciseId, exerciseNome: row.exerciseNome, sets: [] });
      }
      map.get(row.exerciseId)!.sets.push(row);
    }
    return order.map((exerciseId) => map.get(exerciseId)!);
  }, [logRows]);

  const handleDeleteSession = () => {
    Alert.alert(
      'Excluir sessão',
      'Isso apaga essa sessão e todas as séries registradas nela — inclusive dos seus gráficos e recordes de progresso. Não pode ser desfeito. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              db.transaction((tx) => {
                tx.delete(setLogs).where(eq(setLogs.sessionId, sessionId)).run();
                tx.delete(sessionExtraExercises).where(eq(sessionExtraExercises.sessionId, sessionId)).run();
                tx.delete(sessionSkips).where(eq(sessionSkips.sessionId, sessionId)).run();
                tx.delete(sessions).where(eq(sessions.id, sessionId)).run();
              });
              router.back();
            } catch (err) {
              console.error('Falha ao excluir sessão:', err);
              Alert.alert('Erro ao excluir sessão', String(err instanceof Error ? err.message : err));
            }
          },
        },
      ]
    );
  };

  if (!session) {
    return (
      <Screen showBack scrollable>
        <View className="items-center justify-center pt-12">
          <Text className="font-body text-muted">Sessão não encontrada.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen showBack scrollable>
      <ScreenTitle
        title={dayLabel ?? 'Sessão'}
        subtitle={
          session.horaInicio != null && session.horaFim != null
            ? `${formatShortDateLabel(session.data)} · ${formatElapsed(session.horaFim - session.horaInicio)}`
            : formatShortDateLabel(session.data)
        }
      />

      {groups.length === 0 ? (
        <Text className="py-8 text-center font-body text-muted">Nenhuma série registrada nesta sessão.</Text>
      ) : (
        groups.map((group) => (
          <Card key={group.exerciseId} className="mb-3">
            <Text className="mb-2 font-card-title text-lg text-text">{group.exerciseNome}</Text>
            {group.sets
              .slice()
              .sort((a, b) => a.numeroSerie - b.numeroSerie)
              .map((log) => (
                <EditableSetRow key={log.id} logId={log.id} numeroSerie={log.numeroSerie} reps={log.reps} carga={log.carga} />
              ))}
          </Card>
        ))
      )}

      <Button variant="destructive" className="mt-4" onPress={handleDeleteSession}>
        Excluir sessão
      </Button>
    </Screen>
  );
}

function EditableSetRow({
  logId,
  numeroSerie,
  reps,
  carga,
}: {
  logId: number;
  numeroSerie: number;
  reps: number;
  carga: number;
}) {
  const [repsText, setRepsText] = useState(String(reps));
  const [cargaText, setCargaText] = useState(String(carga));

  const commit = async () => {
    const repsNum = Number(repsText);
    const cargaNum = Number(cargaText);
    if (!Number.isFinite(repsNum) || repsNum <= 0 || !Number.isFinite(cargaNum) || cargaNum < 0) {
      // Valor inválido: não grava, deixa como o usuário digitou até corrigir
      // ou sair da tela (nesse caso volta a mostrar o último valor salvo).
      return;
    }
    try {
      await db.update(setLogs).set({ reps: repsNum, carga: cargaNum }).where(eq(setLogs.id, logId));
    } catch (err) {
      console.error('Falha ao editar série:', err);
      Alert.alert('Erro ao editar série', String(err instanceof Error ? err.message : err));
    }
  };

  return (
    <View className="mb-2 flex-row items-center gap-3">
      <Label className="w-16">{`Série ${numeroSerie}`}</Label>
      <View className="flex-1">
        <TextInput
          value={repsText}
          onChangeText={setRepsText}
          onBlur={commit}
          keyboardType="number-pad"
          placeholder="Reps"
          placeholderTextColor={colors.muted}
          className="rounded border border-border bg-surface px-3 py-2 text-center font-display text-xl text-text"
        />
      </View>
      <View className="flex-1">
        <TextInput
          value={cargaText}
          onChangeText={setCargaText}
          onBlur={commit}
          keyboardType="decimal-pad"
          placeholder="Carga"
          placeholderTextColor={colors.muted}
          className="rounded border border-border bg-surface px-3 py-2 text-center font-display text-xl text-text"
        />
      </View>
    </View>
  );
}
