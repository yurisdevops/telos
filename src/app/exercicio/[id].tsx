import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';

import { ExerciseCatalogList } from '@/components/exercise-catalog-list';
import { FormModal } from '@/components/form-modal';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { exercisePreferences, exercises, type Exercise } from '@/db/schema';
import { formatDayMonthLabel, formatShortDateLabel, getTodayDateString, parseLocalIsoDate } from '@/lib/date';
import { fetchCombinedExerciseHistory, markExerciseSubstitution } from '@/lib/exercise-history';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

const HISTORY_PAGE_SIZE = 10;

export default function ExercicioDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exerciseId = Number(id);

  const { data } = useLiveQuery(
    db.select().from(exercises).where(eq(exercises.id, exerciseId)),
    [id]
  );
  const exercise = data?.[0];
  const wgerId = exercise?.wgerId ?? -1;

  const { data: preferenceRows } = useLiveQuery(
    db.select().from(exercisePreferences).where(eq(exercisePreferences.exerciseWgerId, wgerId)),
    [wgerId]
  );
  const preference = preferenceRows?.[0];
  const isFavorito = preference?.favorito ?? false;

  const [notaDraft, setNotaDraft] = useState<string | null>(null);
  const notaValue = notaDraft ?? preference?.nota ?? '';

  const history = useDbQuery(
    () => fetchCombinedExerciseHistory(exerciseId),
    ['set_logs', 'sessions', 'exercise_substitutions', 'exercises'],
    [exerciseId]
  );

  const evolutionByDay = useMemo(() => {
    if (!history) return [];
    const maxByDate = new Map<string, number>();
    for (const s of history.sets) {
      maxByDate.set(s.data, Math.max(maxByDate.get(s.data) ?? -Infinity, s.carga));
    }
    return [...maxByDate.entries()]
      .map(([entryData, maxCarga]) => ({ data: entryData, maxCarga }))
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [history]);

  const bestEntry = useMemo(() => {
    if (evolutionByDay.length === 0) return null;
    return [...evolutionByDay].sort((a, b) => b.maxCarga - a.maxCarga)[0];
  }, [evolutionByDay]);

  const historyByDate = useMemo(() => {
    if (!history) return [];
    const map = new Map<string, typeof history.sets>();
    for (const s of history.sets) {
      const list = map.get(s.data) ?? [];
      list.push(s);
      map.set(s.data, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [history]);

  const [historyPage, setHistoryPage] = useState(1);
  const visibleHistory = historyByDate.slice(0, historyPage * HISTORY_PAGE_SIZE);
  const hasMoreHistory = visibleHistory.length < historyByDate.length;

  const [substitutionPickerVisible, setSubstitutionPickerVisible] = useState(false);
  const [substitutionTarget, setSubstitutionTarget] = useState<Exercise | null>(null);
  const [substitutionDate, setSubstitutionDate] = useState(getTodayDateString());

  const toggleFavorite = async () => {
    try {
      if (preference) {
        await db
          .update(exercisePreferences)
          .set({ favorito: !isFavorito })
          .where(eq(exercisePreferences.id, preference.id));
      } else {
        await db.insert(exercisePreferences).values({ exerciseWgerId: wgerId, favorito: true });
      }
    } catch (err) {
      console.error('Falha ao favoritar exercício:', err);
      Alert.alert('Erro', 'Não foi possível favoritar.');
    }
  };

  const handleSaveNota = async () => {
    const trimmed = notaValue.trim();
    try {
      if (preference) {
        await db
          .update(exercisePreferences)
          .set({ nota: trimmed || null })
          .where(eq(exercisePreferences.id, preference.id));
      } else {
        await db.insert(exercisePreferences).values({ exerciseWgerId: wgerId, nota: trimmed || null });
      }
      setNotaDraft(null);
    } catch (err) {
      console.error('Falha ao salvar nota:', err);
      Alert.alert('Erro', 'Não foi possível salvar a nota.');
    }
  };

  const handleSelectSubstitutionTarget = (candidate: Exercise) => {
    if (candidate.wgerId === wgerId) {
      Alert.alert('Seleção inválida', 'Escolha o exercício anterior, diferente deste.');
      return;
    }
    setSubstitutionTarget(candidate);
  };

  const handleConfirmSubstitution = async () => {
    if (!substitutionTarget) return;
    try {
      await markExerciseSubstitution(substitutionTarget.wgerId, wgerId, substitutionDate);
      setSubstitutionTarget(null);
      setSubstitutionPickerVisible(false);
    } catch (err) {
      console.error('Falha ao marcar substituição:', err);
      Alert.alert('Erro', 'Não foi possível marcar a substituição.');
    }
  };

  if (!exercise) {
    return (
      <Screen showBack scrollable>
        <View className="items-center justify-center pt-12">
          <Text className="font-body text-muted">Exercício não encontrado.</Text>
        </View>
      </Screen>
    );
  }

  const equipamento: string[] = JSON.parse(exercise.equipamento);
  const musculos: string[] = JSON.parse(exercise.musculos);
  const musculosSecundarios: string[] = JSON.parse(exercise.musculosSecundarios);

  const handleOpenExecutionVideo = () => {
    const query = `${exercise.nome} execução correta`;
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    Linking.openURL(url).catch((err) => {
      console.error('Falha ao abrir busca no YouTube:', err);
      Alert.alert('Erro', 'Não foi possível abrir o link.');
    });
  };

  return (
    <Screen showBack scrollable>
      <ScreenTitle
        title={exercise.nome}
        subtitle={exercise.nomeEn}
        action={
          <Pressable onPress={toggleFavorite} hitSlop={8} className="p-1">
            <Ionicons
              name={isFavorito ? 'star' : 'star-outline'}
              size={24}
              color={isFavorito ? colors.accent : colors.muted}
            />
          </Pressable>
        }
      />

      <View className="self-start rounded border border-border px-3 py-1">
        <Label>{exercise.categoria}</Label>
      </View>

      <Section title="Músculos">
        {musculos.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {musculos.map((item) => (
              <Chip key={item} label={item} />
            ))}
          </View>
        ) : (
          <Text className="font-body text-muted">Não informado</Text>
        )}

        {musculosSecundarios.length > 0 && (
          <Text className="mt-3 font-body text-sm text-muted">
            Secundários: {musculosSecundarios.join(', ')}
          </Text>
        )}
      </Section>

      <Section title="Equipamento">
        {equipamento.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {equipamento.map((item) => (
              <Chip key={item} label={item} />
            ))}
          </View>
        ) : (
          <Text className="font-body text-muted">Nenhum equipamento necessário</Text>
        )}
      </Section>

      <Section title="Descrição">
        <Text className={`font-body text-base ${exercise.descricao ? 'text-text' : 'text-muted'}`}>
          {exercise.descricao ?? 'Sem descrição disponível'}
        </Text>
      </Section>

      <Section title="Dica">
        <Card className="border-l-4 border-l-accent">
          <Text className={`font-body text-base ${exercise.dica ? 'text-text' : 'text-muted'}`}>
            {exercise.dica ?? 'Dica não disponível'}
          </Text>
        </Card>
      </Section>

      <Section title="Nota pessoal">
        <TextInput
          value={notaValue}
          onChangeText={setNotaDraft}
          multiline
          placeholder="Ex: banco no furo 4, usar pegada aberta..."
          placeholderTextColor={colors.muted}
          className="rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
        />
        <Button variant="secondary" className="mt-2" onPress={handleSaveNota}>
          Salvar nota
        </Button>
      </Section>

      <Button
        variant="secondary"
        onPress={handleOpenExecutionVideo}
        className="mt-6 flex-row items-center gap-2">
        <Ionicons name="play-circle-outline" size={18} color={colors.text} />
        <Text className="font-label text-sm uppercase tracking-wide text-text">Ver execução</Text>
      </Button>

      <Section title="Evolução">
        {evolutionByDay.length > 0 ? (
          <>
            <LineChart
              data={evolutionByDay.map((row) => ({
                value: row.maxCarga,
                label: formatDayMonthLabel(parseLocalIsoDate(row.data)),
              }))}
              height={160}
              color={colors.accent}
              thickness={2}
              dataPointsColor={colors.accent}
              yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.muted, fontSize: 9 }}
              xAxisColor={colors.border}
              yAxisColor={colors.border}
              hideRules
              noOfSections={4}
              curved
            />
            {bestEntry && (
              <View className="mt-4">
                <Text className="font-body text-base text-text">
                  Melhor carga: <Text className="font-display text-2xl text-accent">{bestEntry.maxCarga}kg</Text>
                </Text>
                <Label className="mt-1">{formatShortDateLabel(bestEntry.data)}</Label>
              </View>
            )}
            {history && history.markers.length > 0 && (
              <View className="mt-4 rounded border border-border bg-surface p-3">
                <Label className="mb-2 text-accent">Trocas de exercício nesta linha</Label>
                {history.markers.map((marker) => (
                  <Text
                    key={`${marker.previousExerciseWgerId}-${marker.newExerciseWgerId}`}
                    className="font-body text-sm text-muted">
                    {`${formatShortDateLabel(marker.substitutedAt)}: ${marker.previousExerciseNome} → ${marker.newExerciseNome}`}
                  </Text>
                ))}
              </View>
            )}
          </>
        ) : (
          <Text className="font-body text-muted">Sem registros ainda.</Text>
        )}
      </Section>

      <Section title="Substituição">
        <Text className="mb-3 font-body text-sm text-muted">
          Se você trocou este exercício por outro (ex: hack squat por leg press), marque aqui pra
          manter a continuidade do histórico e dos gráficos.
        </Text>
        <Button variant="secondary" onPress={() => setSubstitutionPickerVisible(true)}>
          Marcar substituição
        </Button>
      </Section>

      <Section title="Histórico completo">
        {historyByDate.length === 0 ? (
          <Text className="font-body text-muted">Sem séries registradas ainda.</Text>
        ) : (
          <>
            {visibleHistory.map(([dateKey, sets]) => (
              <Card key={dateKey} className="mb-2">
                <View className="mb-2 flex-row items-center justify-between">
                  <Text className="font-card-title text-base text-text">{formatShortDateLabel(dateKey)}</Text>
                  {sets[0].exerciseWgerId !== wgerId && (
                    <Label className="text-accent">{sets[0].exerciseNome}</Label>
                  )}
                </View>
                {sets
                  .slice()
                  .sort((a, b) => a.numeroSerie - b.numeroSerie)
                  .map((set) => (
                    <View key={set.numeroSerie} className="flex-row items-center justify-between py-1">
                      <Label>{`Série ${set.numeroSerie}`}</Label>
                      <Text className="font-body-medium text-sm text-text">
                        {`${set.reps} reps · ${set.carga}kg`}
                        {set.rpe != null && <Text className="text-muted">{`  · RPE ${set.rpe}`}</Text>}
                      </Text>
                    </View>
                  ))}
              </Card>
            ))}
            {hasMoreHistory && (
              <Button variant="secondary" onPress={() => setHistoryPage((p) => p + 1)}>
                Mostrar mais
              </Button>
            )}
          </>
        )}
      </Section>

      <FormModal
        visible={substitutionPickerVisible}
        onRequestClose={() => {
          setSubstitutionPickerVisible(false);
          setSubstitutionTarget(null);
        }}>
        {substitutionTarget ? (
          <>
            <Text className="mb-3 font-card-title text-lg text-text">
              {`${substitutionTarget.nome} → ${exercise.nome}`}
            </Text>
            <Label className="mb-1">Data da troca</Label>
            <TextInput
              value={substitutionDate}
              onChangeText={setSubstitutionDate}
              placeholder="AAAA-MM-DD"
              placeholderTextColor={colors.muted}
              className="mb-4 rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
            />
            <View className="flex-row gap-2">
              <Button variant="secondary" className="flex-1" onPress={() => setSubstitutionTarget(null)}>
                Voltar
              </Button>
              <Button className="flex-1" onPress={handleConfirmSubstitution}>
                Confirmar
              </Button>
            </View>
          </>
        ) : (
          <View style={{ height: 480 }}>
            <Text className="mb-3 font-card-title text-lg text-text">
              Qual exercício este substitui?
            </Text>
            <ExerciseCatalogList onSelectExercise={handleSelectSubstitutionTarget} />
          </View>
        )}
      </FormModal>
    </Screen>
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
