import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { Screen } from '@/components/screen';
import { db } from '@/db';
import { exercises } from '@/db/schema';

export default function ExercicioDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data } = useLiveQuery(
    db.select().from(exercises).where(eq(exercises.id, Number(id))),
    [id]
  );

  const exercise = data?.[0];

  if (!exercise) {
    return (
      <Screen title="Exercício" showBack>
        <View className="flex-1 items-center justify-center">
          <Text className="text-neutral-500">Exercício não encontrado.</Text>
        </View>
      </Screen>
    );
  }

  const equipamento: string[] = JSON.parse(exercise.equipamento);
  const musculos: string[] = JSON.parse(exercise.musculos);
  const musculosSecundarios: string[] = JSON.parse(exercise.musculosSecundarios);

  return (
    <Screen title={exercise.nome} showBack scrollable>
      <View>
        <Text className="text-2xl font-bold text-green-500">{exercise.nome}</Text>
        <Text className="mt-1 text-sm italic text-neutral-400">{exercise.nomeEn}</Text>

        <View className="mt-4 self-start rounded-full bg-neutral-800 px-3 py-1">
          <Text className="text-sm text-neutral-300">{exercise.categoria}</Text>
        </View>

        <Section title="Equipamento">
          <TagList items={equipamento} emptyLabel="Nenhum equipamento necessário" />
        </Section>

        <Section title="Músculos primários">
          <TagList items={musculos} emptyLabel="Não informado" />
        </Section>

        <Section title="Músculos secundários">
          <TagList items={musculosSecundarios} emptyLabel="Não informado" />
        </Section>

        <Section title="Descrição">
          <Text className="text-neutral-300">
            {exercise.descricao ?? 'Sem descrição disponível'}
          </Text>
        </Section>
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-6">
      <Text className="mb-2 text-base font-semibold text-white">{title}</Text>
      {children}
    </View>
  );
}

function TagList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <Text className="text-neutral-500">{emptyLabel}</Text>;
  }

  return (
    <View className="flex-row flex-wrap gap-2">
      {items.map((item) => (
        <View key={item} className="rounded-full bg-neutral-800 px-3 py-1">
          <Text className="text-sm text-neutral-300">{item}</Text>
        </View>
      ))}
    </View>
  );
}
