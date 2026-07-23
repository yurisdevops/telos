import { useState } from 'react';
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
import { workoutDayExercises, workoutDays, type Exercise } from '@/db/schema';
import { colors } from '@/theme/tokens';

export default function SelecionarExercicioScreen() {
  const router = useRouter();
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const dayIdNum = Number(dayId);

  const [selected, setSelected] = useState<Exercise | null>(null);
  const [series, setSeries] = useState('3');
  const [reps, setReps] = useState('12');
  const [carga, setCarga] = useState('');

  const { data: dayRows } = useLiveQuery(
    db.select({ label: workoutDays.label }).from(workoutDays).where(eq(workoutDays.id, dayIdNum)),
    [dayIdNum]
  );
  const dayLabel = dayRows?.[0]?.label;

  const { data: existing } = useLiveQuery(
    db.select().from(workoutDayExercises).where(eq(workoutDayExercises.dayId, dayIdNum)),
    [dayIdNum]
  );

  const handleConfirm = async () => {
    if (!selected) return;
    const seriesNum = Number(series);
    const repsNum = Number(reps);
    const cargaNum = carga.trim() ? Number(carga) : null;
    if (!seriesNum || !repsNum) return;

    try {
      await db.insert(workoutDayExercises).values({
        dayId: dayIdNum,
        exerciseId: selected.id,
        seriesAlvo: seriesNum,
        repsAlvo: repsNum,
        cargaAlvo: cargaNum,
        ordem: existing?.length ?? 0,
      });

      router.back();
    } catch (err) {
      console.error('Falha ao adicionar exercício ao dia:', err);
      Alert.alert('Erro ao adicionar exercício', String(err instanceof Error ? err.message : err));
    }
  };

  return (
    <Screen showBack>
      <ScreenTitle title="Selecionar exercício" subtitle={dayLabel} />

      <ExerciseCatalogList
        onSelectExercise={setSelected}
        onViewDetails={(exercise) =>
          router.push({ pathname: '/exercicio/[id]', params: { id: String(exercise.id) } })
        }
      />

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
