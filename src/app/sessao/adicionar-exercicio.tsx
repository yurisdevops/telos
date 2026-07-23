import { useMemo, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { ExerciseCatalogList } from '@/components/exercise-catalog-list';
import { FormModal } from '@/components/form-modal';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import {
  sessionExtraExercises,
  sessions,
  workoutDayExercises,
  workoutDays,
  type Exercise,
} from '@/db/schema';
import { colors } from '@/theme/tokens';

export default function AdicionarExercicioScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const sessionIdNum = Number(sessionId);

  const [selected, setSelected] = useState<Exercise | null>(null);
  const [series, setSeries] = useState('3');
  const [reps, setReps] = useState('12');
  const [carga, setCarga] = useState('');

  const { data: sessionRows } = useLiveQuery(
    db.select().from(sessions).where(eq(sessions.id, sessionIdNum)),
    [sessionIdNum]
  );
  const session = sessionRows?.[0];

  const { data: dayRows } = useLiveQuery(
    db
      .select({ label: workoutDays.label })
      .from(workoutDays)
      .where(eq(workoutDays.id, session?.workoutDayId ?? -1)),
    [session?.workoutDayId]
  );
  const dayLabel = dayRows?.[0]?.label;

  const { data: planExercises } = useLiveQuery(
    db
      .select({ exerciseId: workoutDayExercises.exerciseId })
      .from(workoutDayExercises)
      .where(eq(workoutDayExercises.dayId, session?.workoutDayId ?? -1)),
    [session?.workoutDayId]
  );

  const { data: extraExercises } = useLiveQuery(
    db
      .select({ exerciseId: sessionExtraExercises.exerciseId, ordem: sessionExtraExercises.ordem })
      .from(sessionExtraExercises)
      .where(eq(sessionExtraExercises.sessionId, sessionIdNum)),
    [sessionIdNum]
  );

  // Um exercício só pode aparecer uma vez por sessão — senão dois cards
  // (plano + avulso) iriam brigar pelo mesmo grupo de séries registradas.
  const alreadyInSession = useMemo(() => {
    const set = new Set<number>();
    for (const row of planExercises ?? []) set.add(row.exerciseId);
    for (const row of extraExercises ?? []) set.add(row.exerciseId);
    return set;
  }, [planExercises, extraExercises]);

  const handleSelect = (exercise: Exercise) => {
    if (alreadyInSession.has(exercise.id)) {
      Alert.alert('Exercício já na sessão', 'Esse exercício já está no seu treino de hoje.');
      return;
    }
    setSelected(exercise);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    const seriesNum = Number(series);
    const repsNum = Number(reps);
    const cargaNum = carga.trim() ? Number(carga) : null;
    if (!seriesNum || !repsNum) return;

    try {
      await db.insert(sessionExtraExercises).values({
        sessionId: sessionIdNum,
        exerciseId: selected.id,
        seriesAlvo: seriesNum,
        repsAlvo: repsNum,
        cargaAlvo: cargaNum,
        ordem:
          extraExercises && extraExercises.length > 0
            ? Math.max(...extraExercises.map((e) => e.ordem)) + 1
            : 0,
      });

      router.back();
    } catch (err) {
      console.error('Falha ao adicionar exercício avulso à sessão:', err);
      Alert.alert('Erro ao adicionar exercício', String(err instanceof Error ? err.message : err));
    }
  };

  return (
    <Screen showBack>
      <ScreenTitle title="Adicionar exercício" subtitle={dayLabel ? `Só no treino de hoje · ${dayLabel}` : 'Só no treino de hoje'} />

      <ExerciseCatalogList onSelectExercise={handleSelect} />

      <FormModal visible={!!selected} onRequestClose={() => setSelected(null)}>
        <Text className="mb-3 font-card-title text-lg text-text">{selected?.nome}</Text>

        <Label className="mb-1">Séries</Label>
        <TextInput
          value={series}
          onChangeText={setSeries}
          keyboardType="number-pad"
          className="mb-3 rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
        />

        <Label className="mb-1">Repetições</Label>
        <TextInput
          value={reps}
          onChangeText={setReps}
          keyboardType="number-pad"
          className="mb-3 rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
        />

        <Label className="mb-1">Carga alvo (kg, opcional)</Label>
        <TextInput
          value={carga}
          onChangeText={setCarga}
          keyboardType="decimal-pad"
          placeholder="Ex: 20"
          placeholderTextColor={colors.muted}
          className="mb-4 rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
        />

        <View className="flex-row gap-2">
          <Button variant="secondary" className="flex-1" onPress={() => setSelected(null)}>
            Cancelar
          </Button>
          <Button className="flex-1" onPress={handleConfirm}>
            Adicionar
          </Button>
        </View>
      </FormModal>
    </Screen>
  );
}
