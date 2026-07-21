import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db";
import { exercises, type Exercise } from "@/db/schema";

const CATEGORIES = [
  "Pernas",
  "Costas",
  "Braços",
  "Abdômen",
  "Ombros",
  "Peito",
  "Cardio",
  "Panturrilhas",
];

const CARD_HEIGHT = 76;
const CARD_GAP = 12;
const ROW_HEIGHT = CARD_HEIGHT + CARD_GAP;

function normalize(value: string) {
  const combiningMarks = new RegExp(
    "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
    "g",
  );
  return value.normalize("NFD").replace(combiningMarks, "").toLowerCase();
}

export function ExerciseCatalogList({
  onSelectExercise,
  searchPlaceholder = "Buscar exercício",
}: {
  onSelectExercise: (exercise: Exercise) => void;
  searchPlaceholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const { data } = useLiveQuery(db.select().from(exercises));

  const filtered = useMemo(() => {
    const normalizedSearch = normalize(search.trim());
    return (data ?? []).filter((item) => {
      if (category && item.categoria !== category) return false;
      if (normalizedSearch && !normalize(item.nome).includes(normalizedSearch))
        return false;
      return true;
    });
  }, [data, search, category]);

  return (
    <View className="flex-1">
      <View className="pb-3">
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder={searchPlaceholder}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0 }} // <- isso resolve
        contentContainerStyle={{
          gap: 8,
          paddingHorizontal: 16,
          alignItems: "center",
        }}
      >
        <Chip
          label="Todos"
          selected={category === null}
          onPress={() => setCategory(null)}
        />
        {CATEGORIES.map((cat) => (
          <Chip
            key={cat}
            label={cat}
            selected={category === cat}
            onPress={() => setCategory(cat)}
          />
        ))}
      </ScrollView>

      <FlatList
        style={{ flex: 1 }}
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        getItemLayout={(_, index) => ({
          length: ROW_HEIGHT,
          offset: ROW_HEIGHT * index,
          index,
        })}
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
            <Text className="font-body text-muted">
              Nenhum exercício encontrado.
            </Text>
          </View>
        }
      />
    </View>
  );
}

function ExerciseCard({
  item,
  onPress,
}: {
  item: Exercise;
  onPress: () => void;
}) {
  const equipamento: string[] = JSON.parse(item.equipamento);
  const subtitle =
    equipamento.length > 0
      ? `${item.categoria} · ${equipamento[0]}`
      : item.categoria;

  return (
    <Pressable
      onPress={onPress}
      style={{ height: CARD_HEIGHT, marginBottom: CARD_GAP }}
    >
      <Card className="flex-1 justify-center">
        <Text
          className="font-body-medium text-base text-text"
          numberOfLines={1}
        >
          {item.nome}
        </Text>
        <Label className="mt-1" numberOfLines={1}>
          {subtitle}
        </Label>
      </Card>
    </Pressable>
  );
}
