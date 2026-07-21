import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { exercises, sessions, setLogs } from '@/db/schema';
import { formatDayMonthLabel, formatShortDateLabel, parseLocalIsoDate } from '@/lib/date';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

export default function ExercicioDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exerciseId = Number(id);

  const { data } = useLiveQuery(
    db.select().from(exercises).where(eq(exercises.id, exerciseId)),
    [id]
  );

  const evolutionRows = useDbQuery(
    () =>
      db
        .select({ data: sessions.data, maxCarga: sql<number>`max(${setLogs.carga})` })
        .from(setLogs)
        .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
        .where(eq(setLogs.exerciseId, exerciseId))
        .groupBy(sessions.data)
        .orderBy(sessions.data),
    ['set_logs', 'sessions'],
    [exerciseId]
  );

  const bestEntry = useMemo(() => {
    if (!evolutionRows || evolutionRows.length === 0) return null;
    return [...evolutionRows].sort((a, b) => Number(b.maxCarga) - Number(a.maxCarga))[0];
  }, [evolutionRows]);

  const exercise = data?.[0];

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
      <ScreenTitle title={exercise.nome} subtitle={exercise.nomeEn} />

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

      <Button
        variant="secondary"
        onPress={handleOpenExecutionVideo}
        className="mt-6 flex-row items-center gap-2">
        <Ionicons name="play-circle-outline" size={18} color={colors.text} />
        <Text className="font-label text-sm uppercase tracking-wide text-text">Ver execução</Text>
      </Button>

      <Section title="Evolução">
        {evolutionRows === undefined ? null : evolutionRows.length > 0 ? (
          <>
            <LineChart
              data={evolutionRows.map((row) => ({
                value: Number(row.maxCarga),
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
          </>
        ) : (
          <Text className="font-body text-muted">Sem registros ainda.</Text>
        )}
      </Section>
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
