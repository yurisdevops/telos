import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '@/components/screen';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { READY_WORKOUTS, type ReadyWorkout } from '@/db/ready-workouts';
import { colors } from '@/theme/tokens';

const CATEGORY_LABEL: Record<ReadyWorkout['categoria'], string> = {
  completo: 'Completos',
  focado: 'Focados',
};

export default function TreinosProntosScreen() {
  const router = useRouter();
  const completos = READY_WORKOUTS.filter((w) => w.categoria === 'completo');
  const focados = READY_WORKOUTS.filter((w) => w.categoria === 'focado');

  const openDetail = (key: string) => router.push({ pathname: '/treinos-prontos/[key]', params: { key } });

  return (
    <Screen showBack scrollable>
      <ScreenTitle title="Treinos prontos" subtitle="Escolha um e comece agora, ou salve pra depois" />

      <Section title={CATEGORY_LABEL.completo}>
        {completos.map((workout) => (
          <ReadyWorkoutCard key={workout.key} workout={workout} onPress={() => openDetail(workout.key)} />
        ))}
      </Section>

      <Section title={CATEGORY_LABEL.focado}>
        {focados.map((workout) => (
          <ReadyWorkoutCard key={workout.key} workout={workout} onPress={() => openDetail(workout.key)} />
        ))}
      </Section>
    </Screen>
  );
}

function ReadyWorkoutCard({ workout, onPress }: { workout: ReadyWorkout; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="mb-2">
      <Card className="flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text className="font-card-title text-lg text-text" numberOfLines={1}>
            {workout.nome}
          </Text>
          <Label className="mt-1" numberOfLines={1}>
            {workout.subtitulo}
          </Label>
          <Label className="mt-1">{`${workout.exercises.length} exercícios`}</Label>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Card>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-6">
      <Label className="mb-3">{title}</Label>
      {children}
    </View>
  );
}
