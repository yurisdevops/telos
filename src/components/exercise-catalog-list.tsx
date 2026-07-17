import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db';
import { exercises, type Exercise } from '@/db/schema';

const CATEGORIES = [
  'Pernas',
  'Costas',
  'Braços',
  'Abdômen',
  'Ombros',
  'Peito',
  'Cardio',
  'Panturrilhas',
];

const CARD_HEIGHT = 68;
const CARD_GAP = 8;
const ROW_HEIGHT = CARD_HEIGHT + CARD_GAP;

function normalize(value: string) {
  const combiningMarks = new RegExp(
    '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
    'g'
  );
  return value.normalize('NFD').replace(combiningMarks, '').toLowerCase();
}

export function ExerciseCatalogList({
  onSelectExercise,
  searchPlaceholder = 'Buscar exercício...',
}: {
  onSelectExercise: (exercise: Exercise) => void;
  searchPlaceholder?: string;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const { data } = useLiveQuery(db.select().from(exercises));

  const filtered = useMemo(() => {
    const normalizedSearch = normalize(search.trim());
    return (data ?? []).filter((item) => {
      if (category && item.categoria !== category) return false;
      if (normalizedSearch && !normalize(item.nome).includes(normalizedSearch)) return false;
      return true;
    });
  }, [data, search, category]);

  return (
    <View className="flex-1">
      <View className="pb-3">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={searchPlaceholder}
          placeholderTextColor="#737373"
          className="rounded-xl bg-neutral-800 px-4 py-3 text-white"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        <CategoryChip label="Todos" selected={category === null} onPress={() => setCategory(null)} />
        {CATEGORIES.map((cat) => (
          <CategoryChip
            key={cat}
            label={cat}
            selected={category === cat}
            onPress={() => setCategory(cat)}
          />
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 16 }}
        renderItem={({ item }) => (
          <ExerciseCard item={item} onPress={() => onSelectExercise(item)} />
        )}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-neutral-500">Nenhum exercício encontrado.</Text>
          </View>
        }
      />
    </View>
  );
}

function ExerciseCard({ item, onPress }: { item: Exercise; onPress: () => void }) {
  const equipamento: string[] = JSON.parse(item.equipamento);
  const subtitle = equipamento.length > 0 ? `${item.categoria} • ${equipamento[0]}` : item.categoria;

  return (
    <Pressable
      onPress={onPress}
      style={{ height: CARD_HEIGHT, marginBottom: CARD_GAP }}
      className="justify-center rounded-xl bg-neutral-800 px-4">
      <Text className="text-base font-semibold text-green-500" numberOfLines={1}>
        {item.nome}
      </Text>
      <Text className="mt-1 text-sm text-neutral-400" numberOfLines={1}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

function CategoryChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-4 py-2 ${selected ? 'bg-green-600' : 'bg-neutral-800'}`}>
      <Text className={selected ? 'font-semibold text-black' : 'text-neutral-300'}>{label}</Text>
    </Pressable>
  );
}
