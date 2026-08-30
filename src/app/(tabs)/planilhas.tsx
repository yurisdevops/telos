import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { eq, notInArray, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { workoutDayExercises, workoutDays, workoutPlans, type WorkoutPlan } from '@/db/schema';
import { TIPOS_PLANO_EFEMERO } from '@/db/ready-workouts';
import { colors } from '@/theme/tokens';

export default function PlanilhasScreen() {
  const router = useRouter();
  // 'Treino pronto'/'Livre' são planos efêmeros criados por "treinar agora"/
  // "Treino Livre" (ver TIPOS_PLANO_EFEMERO em src/db/ready-workouts.ts) —
  // nunca deveriam poluir a lista de planilhas, mas continuam existindo de
  // verdade no banco: sessões, histórico e métricas (Perfil/Progresso) não
  // filtram por tipo em lugar nenhum, então nada disso deixa de contar esses
  // treinos. Só esta lista esconde.
  const { data: plans } = useLiveQuery(
    db.select().from(workoutPlans).where(notInArray(workoutPlans.tipo, TIPOS_PLANO_EFEMERO))
  );
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

      <Pressable
        onPress={() => router.push('/plano/importar-treino')}
        className="mb-3 flex-row items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <Ionicons name="clipboard-outline" size={22} color={colors.accent} />
        <View className="flex-1">
          <Text className="font-card-title text-sm text-text">Importar treino do professor</Text>
          <Text className="font-label text-xs text-muted">Cole o treino e o Atlas monta o plano</Text>
        </View>
        <Ionicons name="chevron-forward-outline" size={16} color={colors.muted} />
      </Pressable>

      <Pressable onPress={() => router.push('/plano/assistente')} className="mb-4">
        <Card className="flex-row items-center gap-3 border-l-4 border-l-accent">
          <Ionicons name="sparkles-outline" size={26} color={colors.accent} />
          <View className="flex-1">
            <Text className="font-card-title text-lg text-text">Montar com Atlas</Text>
            <Label className="mt-1">O Atlas cria um plano personalizado para o seu perfil</Label>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Card>
      </Pressable>

      <Pressable onPress={() => router.push('/treinos-prontos')} className="mb-4">
        <Card className="flex-row items-center gap-3 border-l-4 border-l-accent">
          <Ionicons name="flash-outline" size={26} color={colors.accent} />
          <View className="flex-1">
            <Text className="font-card-title text-lg text-text">Treinos prontos</Text>
            <Label className="mt-1">Escolha um treino e comece agora</Label>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Card>
      </Pressable>

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
