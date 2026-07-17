import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db';
import { workoutDays, workoutPlans, type WorkoutPlan } from '@/db/schema';

export default function PlanilhasScreen() {
  const router = useRouter();
  const { data: plans } = useLiveQuery(db.select().from(workoutPlans));
  const { data: days } = useLiveQuery(db.select().from(workoutDays));

  const dayCountByPlan = useMemo(() => {
    const counts = new Map<number, number>();
    for (const day of days ?? []) {
      counts.set(day.planId, (counts.get(day.planId) ?? 0) + 1);
    }
    return counts;
  }, [days]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-950">
      <View className="flex-row items-center justify-between px-4 pb-3 pt-4">
        <Text className="text-2xl font-bold text-white">Planilhas</Text>
        <Pressable
          onPress={() => router.push('/plano/novo')}
          className="rounded-full bg-green-600 px-4 py-2">
          <Text className="font-semibold text-black">+ Novo plano</Text>
        </Pressable>
      </View>

      <FlatList
        data={plans ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}
        renderItem={({ item }) => <PlanCard item={item} count={dayCountByPlan.get(item.id) ?? 0} />}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-neutral-500">Nenhum plano criado ainda.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function PlanCard({ item, count }: { item: WorkoutPlan; count: number }) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/plano/[id]', params: { id: String(item.id) } })}
      className="rounded-xl bg-neutral-800 px-4 py-3">
      <Text className="text-base font-semibold text-white">{item.nome}</Text>
      <Text className="mt-1 text-sm text-neutral-400">
        {count} {count === 1 ? 'dia' : 'dias'}
      </Text>
    </Pressable>
  );
}
