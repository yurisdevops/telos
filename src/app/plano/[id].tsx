import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { FormModal } from '@/components/form-modal';
import { Screen } from '@/components/screen';
import { db } from '@/db';
import { exercises, workoutDayExercises, workoutDays, workoutPlans } from '@/db/schema';

export default function PlanoDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const planId = Number(id);
  const [isAddDayModalVisible, setIsAddDayModalVisible] = useState(false);
  const [dayLabel, setDayLabel] = useState('');

  const { data: planRows } = useLiveQuery(
    db.select().from(workoutPlans).where(eq(workoutPlans.id, planId)),
    [planId]
  );
  const plan = planRows?.[0];

  const { data: days } = useLiveQuery(
    db.select().from(workoutDays).where(eq(workoutDays.planId, planId)),
    [planId]
  );
  const sortedDays = useMemo(() => [...(days ?? [])].sort((a, b) => a.ordem - b.ordem), [days]);

  const { data: dayExercises } = useLiveQuery(
    db
      .select({
        id: workoutDayExercises.id,
        dayId: workoutDayExercises.dayId,
        seriesAlvo: workoutDayExercises.seriesAlvo,
        repsAlvo: workoutDayExercises.repsAlvo,
        cargaAlvo: workoutDayExercises.cargaAlvo,
        exerciseNome: exercises.nome,
      })
      .from(workoutDayExercises)
      .innerJoin(exercises, eq(workoutDayExercises.exerciseId, exercises.id))
  );

  const exercisesByDay = useMemo(() => {
    const map = new Map<number, NonNullable<typeof dayExercises>>();
    for (const row of dayExercises ?? []) {
      const list = map.get(row.dayId) ?? [];
      list.push(row);
      map.set(row.dayId, list);
    }
    return map;
  }, [dayExercises]);

  const handleAddDay = async () => {
    const trimmed = dayLabel.trim();
    if (!trimmed) return;
    await db.insert(workoutDays).values({
      planId,
      label: trimmed,
      ordem: sortedDays.length,
    });
    setDayLabel('');
    setIsAddDayModalVisible(false);
  };

  const handleRemoveExercise = (dayExerciseId: number) => {
    Alert.alert('Remover exercício', 'Deseja remover este exercício do dia?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => db.delete(workoutDayExercises).where(eq(workoutDayExercises.id, dayExerciseId)),
      },
    ]);
  };

  const handleRemoveDay = (dayId: number) => {
    Alert.alert(
      'Remover dia',
      'Isso também remove os exercícios adicionados nele. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            await db.delete(workoutDayExercises).where(eq(workoutDayExercises.dayId, dayId));
            await db.delete(workoutDays).where(eq(workoutDays.id, dayId));
          },
        },
      ]
    );
  };

  const handleDeletePlan = () => {
    Alert.alert(
      'Excluir plano',
      `Tem certeza que deseja excluir "${plan?.nome}"? Essa ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            for (const day of sortedDays) {
              await db.delete(workoutDayExercises).where(eq(workoutDayExercises.dayId, day.id));
            }
            await db.delete(workoutDays).where(eq(workoutDays.planId, planId));
            await db.delete(workoutPlans).where(eq(workoutPlans.id, planId));
            router.back();
          },
        },
      ]
    );
  };

  return (
    <Screen title={plan?.nome ?? 'Plano'} showBack scrollable>
      <View>
        {sortedDays.map((day) => (
          <View key={day.id} className="mb-4 rounded-xl bg-neutral-900 p-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-white">{day.label}</Text>
              <Pressable onPress={() => handleRemoveDay(day.id)}>
                <Text className="text-sm text-red-500">Remover dia</Text>
              </Pressable>
            </View>

            {(exercisesByDay.get(day.id) ?? []).map((row) => (
              <View
                key={row.id}
                className="mb-2 flex-row items-center justify-between rounded-lg bg-neutral-800 px-3 py-2">
                <View className="flex-1">
                  <Text className="text-white">{row.exerciseNome}</Text>
                  <Text className="text-sm text-neutral-400">
                    {row.seriesAlvo}x{row.repsAlvo}
                    {row.cargaAlvo != null ? ` - ${row.cargaAlvo}kg` : ''}
                  </Text>
                </View>
                <Pressable onPress={() => handleRemoveExercise(row.id)}>
                  <Text className="text-red-500">✕</Text>
                </Pressable>
              </View>
            ))}

            <Pressable
              onPress={() =>
                router.push({ pathname: '/plano/selecionar-exercicio', params: { dayId: String(day.id) } })
              }
              className="mt-2 rounded-lg bg-neutral-800 px-3 py-2">
              <Text className="text-center font-semibold text-green-500">+ Adicionar exercício</Text>
            </Pressable>
          </View>
        ))}

        <Pressable
          onPress={() => setIsAddDayModalVisible(true)}
          className="mb-8 rounded-xl bg-green-600 px-4 py-3">
          <Text className="text-center font-semibold text-black">+ Adicionar dia</Text>
        </Pressable>

        <Pressable onPress={handleDeletePlan} className="rounded-xl bg-neutral-900 px-4 py-3">
          <Text className="text-center font-semibold text-red-500">Excluir plano</Text>
        </Pressable>
      </View>

      <FormModal
        visible={isAddDayModalVisible}
        onRequestClose={() => setIsAddDayModalVisible(false)}>
        <Text className="mb-3 text-lg font-semibold text-white">Nome do dia</Text>
        <TextInput
          value={dayLabel}
          onChangeText={setDayLabel}
          placeholder="Ex: Peito e Tríceps"
          placeholderTextColor="#737373"
          autoFocus
          className="rounded-xl bg-neutral-800 px-4 py-3 text-white"
        />
        <View className="mt-4 flex-row gap-2">
          <Pressable
            onPress={() => setIsAddDayModalVisible(false)}
            className="flex-1 rounded-xl bg-neutral-800 px-4 py-3">
            <Text className="text-center font-semibold text-neutral-300">Cancelar</Text>
          </Pressable>
          <Pressable onPress={handleAddDay} className="flex-1 rounded-xl bg-green-600 px-4 py-3">
            <Text className="text-center font-semibold text-black">Adicionar</Text>
          </Pressable>
        </View>
      </FormModal>
    </Screen>
  );
}
