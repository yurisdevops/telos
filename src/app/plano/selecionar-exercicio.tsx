import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { ExerciseCatalogList } from '@/components/exercise-catalog-list';
import { FormModal } from '@/components/form-modal';
import { Screen } from '@/components/screen';
import { db } from '@/db';
import { workoutDayExercises, type Exercise } from '@/db/schema';

export default function SelecionarExercicioScreen() {
  const router = useRouter();
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const dayIdNum = Number(dayId);

  const [selected, setSelected] = useState<Exercise | null>(null);
  const [series, setSeries] = useState('3');
  const [reps, setReps] = useState('12');
  const [carga, setCarga] = useState('');

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

    await db.insert(workoutDayExercises).values({
      dayId: dayIdNum,
      exerciseId: selected.id,
      seriesAlvo: seriesNum,
      repsAlvo: repsNum,
      cargaAlvo: cargaNum,
      ordem: existing?.length ?? 0,
    });

    router.back();
  };

  return (
    <Screen title="Selecionar exercício" showBack>
      <ExerciseCatalogList onSelectExercise={setSelected} searchPlaceholder="Buscar exercício..." />

      <FormModal visible={!!selected} onRequestClose={() => setSelected(null)}>
        <Text className="mb-3 text-lg font-semibold text-white">{selected?.nome}</Text>

        <Text className="mb-1 text-sm text-neutral-400">Séries</Text>
        <TextInput
          value={series}
          onChangeText={setSeries}
          keyboardType="number-pad"
          className="mb-3 rounded-xl bg-neutral-800 px-4 py-3 text-white"
        />

        <Text className="mb-1 text-sm text-neutral-400">Repetições</Text>
        <TextInput
          value={reps}
          onChangeText={setReps}
          keyboardType="number-pad"
          className="mb-3 rounded-xl bg-neutral-800 px-4 py-3 text-white"
        />

        <Text className="mb-1 text-sm text-neutral-400">Carga alvo (kg, opcional)</Text>
        <TextInput
          value={carga}
          onChangeText={setCarga}
          keyboardType="numeric"
          placeholder="Ex: 20"
          placeholderTextColor="#737373"
          className="mb-4 rounded-xl bg-neutral-800 px-4 py-3 text-white"
        />

        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setSelected(null)}
            className="flex-1 rounded-xl bg-neutral-800 px-4 py-3">
            <Text className="text-center font-semibold text-neutral-300">Cancelar</Text>
          </Pressable>
          <Pressable onPress={handleConfirm} className="flex-1 rounded-xl bg-green-600 px-4 py-3">
            <Text className="text-center font-semibold text-black">Adicionar</Text>
          </Pressable>
        </View>
      </FormModal>
    </Screen>
  );
}
