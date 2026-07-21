import { useMemo, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';

import { FormModal } from '@/components/form-modal';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { exercises, workoutDayExercises, workoutDays, workoutPlans } from '@/db/schema';
import { colors } from '@/theme/tokens';

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
    try {
      await db.insert(workoutDays).values({
        planId,
        label: trimmed,
        ordem: sortedDays.length,
      });
      setDayLabel('');
      setIsAddDayModalVisible(false);
    } catch (err) {
      console.error('Falha ao adicionar dia:', err);
      Alert.alert('Erro ao adicionar dia', String(err instanceof Error ? err.message : err));
    }
  };

  const handleRemoveExercise = (dayExerciseId: number) => {
    Alert.alert('Remover exercício', 'Deseja remover este exercício do dia?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await db.delete(workoutDayExercises).where(eq(workoutDayExercises.id, dayExerciseId));
          } catch (err) {
            console.error('Falha ao remover exercício:', err);
            Alert.alert('Erro ao remover exercício', String(err instanceof Error ? err.message : err));
          }
        },
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
            try {
              await db.delete(workoutDayExercises).where(eq(workoutDayExercises.dayId, dayId));
              await db.delete(workoutDays).where(eq(workoutDays.id, dayId));
            } catch (err) {
              console.error('Falha ao remover dia:', err);
              Alert.alert('Erro ao remover dia', String(err instanceof Error ? err.message : err));
            }
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
            try {
              for (const day of sortedDays) {
                await db.delete(workoutDayExercises).where(eq(workoutDayExercises.dayId, day.id));
              }
              await db.delete(workoutDays).where(eq(workoutDays.planId, planId));
              await db.delete(workoutPlans).where(eq(workoutPlans.id, planId));
              router.back();
            } catch (err) {
              console.error('Falha ao excluir plano:', err);
              Alert.alert('Erro ao excluir plano', String(err instanceof Error ? err.message : err));
            }
          },
        },
      ]
    );
  };

  return (
    <Screen showBack scrollable>
      <ScreenTitle
        title={plan?.nome ?? 'Plano'}
        subtitle={`${sortedDays.length} ${sortedDays.length === 1 ? 'dia' : 'dias'}`}
      />

      <View>
        {sortedDays.map((day) => {
          const dayExerciseList = exercisesByDay.get(day.id) ?? [];
          return (
            <Card key={day.id} className="mb-4">
              <View className="mb-1 flex-row items-center justify-between">
                <Text className="font-display text-2xl uppercase text-text" numberOfLines={1}>
                  {day.label}
                </Text>
                <Button variant="destructive" onPress={() => handleRemoveDay(day.id)}>
                  Remover
                </Button>
              </View>
              <Label className="mb-3">
                {`${dayExerciseList.length} ${dayExerciseList.length === 1 ? 'exercício' : 'exercícios'}`}
              </Label>

              {dayExerciseList.map((row) => (
                <View
                  key={row.id}
                  className="mb-2 flex-row items-center justify-between rounded border border-border bg-bg px-3 py-2">
                  <Text className="flex-1 pr-2 font-body-medium text-base text-text" numberOfLines={1}>
                    {row.exerciseNome}
                  </Text>
                  <Text className="font-display text-lg text-text" numberOfLines={1}>
                    {`${row.seriesAlvo}x${row.repsAlvo}`}
                    {row.cargaAlvo != null && (
                      <Text className="font-display text-lg text-muted">{` · ${row.cargaAlvo}kg`}</Text>
                    )}
                  </Text>
                  <Button variant="ghost" onPress={() => handleRemoveExercise(row.id)}>
                    <Ionicons name="close" size={18} color={colors.muted} />
                  </Button>
                </View>
              ))}

              <Button
                variant="primary"
                className="mt-2"
                onPress={() =>
                  router.push({ pathname: '/plano/selecionar-exercicio', params: { dayId: String(day.id) } })
                }>
                + Adicionar exercício
              </Button>
            </Card>
          );
        })}

        <Button className="mb-3" onPress={() => setIsAddDayModalVisible(true)}>
          + Adicionar dia
        </Button>

        <Button variant="destructive" onPress={handleDeletePlan}>
          Excluir plano
        </Button>
      </View>

      <FormModal
        visible={isAddDayModalVisible}
        onRequestClose={() => setIsAddDayModalVisible(false)}>
        <Text className="mb-3 font-card-title text-lg text-text">Nome do dia</Text>
        <TextInput
          value={dayLabel}
          onChangeText={setDayLabel}
          placeholder="Ex: Peito e Tríceps"
          placeholderTextColor={colors.muted}
          autoFocus
          className="rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
        />
        <View className="mt-4 flex-row gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onPress={() => setIsAddDayModalVisible(false)}>
            Cancelar
          </Button>
          <Button className="flex-1" onPress={handleAddDay}>
            Adicionar
          </Button>
        </View>
      </FormModal>
    </Screen>
  );
}
