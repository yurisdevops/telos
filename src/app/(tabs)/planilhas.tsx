import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { workoutDayExercises, workoutDays, workoutPlans, type WorkoutPlan } from '@/db/schema';

export default function PlanilhasScreen() {
  const router = useRouter();
  const { data: plans } = useLiveQuery(db.select().from(workoutPlans));
  const { data: days } = useLiveQuery(db.select().from(workoutDays));

  const { data: dayExerciseRows } = useLiveQuery(
    db
      .select({ planId: workoutDays.planId, count: sql<number>`count(*)` })
      .from(workoutDayExercises)
      .innerJoin(workoutDays, eq(workoutDayExercises.dayId, workoutDays.id))
      .groupBy(workoutDays.planId)
  );

  const dayCountByPlan = useMemo(() => {
    const counts = new Map<number, number>();
    for (const day of days ?? []) {
      counts.set(day.planId, (counts.get(day.planId) ?? 0) + 1);
    }
    return counts;
  }, [days]);

  const exerciseCountByPlan = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of dayExerciseRows ?? []) map.set(row.planId, Number(row.count));
    return map;
  }, [dayExerciseRows]);

  const planCount = plans?.length ?? 0;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScreenTitle
        title="Planilhas"
        subtitle={`${planCount} ${planCount === 1 ? 'plano' : 'planos'}`}
        action={
          <Button onPress={() => router.push('/plano/novo')} className="self-start">
            + Novo plano
          </Button>
        }
      />

      <FlatList
        style={{ flex: 1 }}
        data={plans ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 16, gap: 8 }}
        renderItem={({ item }) => (
          <PlanCard
            item={item}
            dayCount={dayCountByPlan.get(item.id) ?? 0}
            exerciseCount={exerciseCountByPlan.get(item.id) ?? 0}
          />
        )}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="font-body text-muted">Nenhum plano criado ainda.</Text>
          </View>
        }
      />
    </Screen>
  );
}

function PlanCard({
  item,
  dayCount,
  exerciseCount,
}: {
  item: WorkoutPlan;
  dayCount: number;
  exerciseCount: number;
}) {
  const router = useRouter();

  return (
    <Pressable onPress={() => router.push({ pathname: '/plano/[id]', params: { id: String(item.id) } })}>
      <Card>
        <Text className="font-display text-2xl uppercase text-text">{item.nome}</Text>
        <View className="mt-2 flex-row gap-4">
          <Label>{`${dayCount} ${dayCount === 1 ? 'dia' : 'dias'}`}</Label>
          <Label>{`${exerciseCount} ${exerciseCount === 1 ? 'exercício' : 'exercícios'}`}</Label>
        </View>
      </Card>
    </Pressable>
  );
}
