import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { eq } from "drizzle-orm";
import { Ionicons } from "@expo/vector-icons";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db";
import { exercisePreferences, exercises, type Exercise } from "@/db/schema";
import { colors } from "@/theme/tokens";

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
  onViewDetails,
  searchPlaceholder = "Buscar exercício",
}: {
  onSelectExercise: (exercise: Exercise) => void;
  onViewDetails?: (exercise: Exercise) => void;
  searchPlaceholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const { data } = useLiveQuery(db.select().from(exercises));
  const { data: preferenceRows } = useLiveQuery(db.select().from(exercisePreferences));

  const favoriteWgerIds = useMemo(
    () => new Set((preferenceRows ?? []).filter((p) => p.favorito).map((p) => p.exerciseWgerId)),
    [preferenceRows]
  );

  const filtered = useMemo(() => {
    const normalizedSearch = normalize(search.trim());
    const result = (data ?? []).filter((item) => {
      if (favoritesOnly && !favoriteWgerIds.has(item.wgerId)) return false;
      if (category && item.categoria !== category) return false;
      if (normalizedSearch && !normalize(item.nome).includes(normalizedSearch))
        return false;
      return true;
    });

    // Favoritos sempre primeiro — é o "acesso rápido" pedido pra tela de
    // adicionar exercício a um dia, e não atrapalha em nenhum outro uso.
    // Desempate preserva a ordem original (estável), não reordena o resto.
    return result
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const aFav = favoriteWgerIds.has(a.item.wgerId) ? 0 : 1;
        const bFav = favoriteWgerIds.has(b.item.wgerId) ? 0 : 1;
        if (aFav !== bFav) return aFav - bFav;
        return a.index - b.index;
      })
      .map(({ item }) => item);
  }, [data, search, category, favoritesOnly, favoriteWgerIds]);

  const toggleFavorite = async (item: Exercise) => {
    try {
      const existing = (preferenceRows ?? []).find((p) => p.exerciseWgerId === item.wgerId);
      if (existing) {
        await db
          .update(exercisePreferences)
          .set({ favorito: !existing.favorito })
          .where(eq(exercisePreferences.id, existing.id));
      } else {
        await db.insert(exercisePreferences).values({ exerciseWgerId: item.wgerId, favorito: true });
      }
    } catch (err) {
      console.error("Falha ao favoritar exercício:", err);
    }
  };

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
        <Chip
          label="★ Favoritos"
          selected={favoritesOnly}
          onPress={() => setFavoritesOnly((f) => !f)}
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
          <ExerciseCard
            item={item}
            isFavorito={favoriteWgerIds.has(item.wgerId)}
            onPress={() => onSelectExercise(item)}
            onPressInfo={onViewDetails ? () => onViewDetails(item) : undefined}
            onToggleFavorite={() => toggleFavorite(item)}
          />
        )}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="font-body text-muted">
              {favoritesOnly ? "Nenhum favorito ainda." : "Nenhum exercício encontrado."}
            </Text>
          </View>
        }
      />
    </View>
  );
}

function ExerciseCard({
  item,
  isFavorito,
  onPress,
  onPressInfo,
  onToggleFavorite,
}: {
  item: Exercise;
  isFavorito: boolean;
  onPress: () => void;
  onPressInfo?: () => void;
  onToggleFavorite: () => void;
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
      <Card className="flex-1 flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text
            className="font-body-medium text-base text-text"
            numberOfLines={1}
          >
            {item.nome}
          </Text>
          <Label className="mt-1" numberOfLines={1}>
            {subtitle}
          </Label>
        </View>
        <View className="flex-row items-center gap-1">
          <Pressable onPress={onToggleFavorite} hitSlop={8} className="p-1">
            <Ionicons
              name={isFavorito ? "star" : "star-outline"}
              size={20}
              color={isFavorito ? colors.accent : colors.muted}
            />
          </Pressable>
          {onPressInfo && (
            <Pressable onPress={onPressInfo} hitSlop={8} className="p-1">
              <Ionicons
                name="information-circle-outline"
                size={22}
                color={colors.muted}
              />
            </Pressable>
          )}
        </View>
      </Card>
    </Pressable>
  );
}
