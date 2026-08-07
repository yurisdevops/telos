import { useMemo } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { inArray } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { exercises } from '@/db/schema';
import { criarESalvar, READY_WORKOUTS, treinarAgora } from '@/db/ready-workouts';

function reportError(context: string, err: unknown) {
  console.error(context, err);
  Alert.alert(context, String(err instanceof Error ? err.message : err));
}

export default function TreinoProntoDetailScreen() {
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();
  const workout = useMemo(() => READY_WORKOUTS.find((w) => w.key === key), [key]);
  const wgerIds = useMemo(() => workout?.exercises.map((ex) => ex.wgerId) ?? [], [workout]);

  const { data: exerciseRows } = useLiveQuery(
    db.select({ wgerId: exercises.wgerId, nome: exercises.nome }).from(exercises).where(inArray(exercises.wgerId, wgerIds)),
    [wgerIds.join(',')]
  );
  const nomeByWgerId = useMemo(() => new Map((exerciseRows ?? []).map((r) => [r.wgerId, r.nome])), [exerciseRows]);

  if (!workout) {
    return (
      <Screen showBack scrollable>
        <View className="items-center justify-center pt-12">
          <Text className="font-body text-muted">Treino pronto não encontrado.</Text>
        </View>
      </Screen>
    );
  }

  // Transações síncronas (mesmo padrão de duplicatePlanTx/applyTemplate) —
  // sem await, o resultado já está pronto quando a chamada retorna.
  const handleTreinarAgora = () => {
    try {
      const result = treinarAgora(workout.key);
      if (result.status === 'already_has_session_today') {
        Alert.alert(
          'Você já tem um treino hoje',
          'Termine ou cancele a sessão de hoje antes de começar outra. Se quiser, salve este treino pronto como planilha pra usar depois.'
        );
        return;
      }
      router.replace('/hoje');
    } catch (err) {
      reportError('Erro ao iniciar treino', err);
    }
  };

  const handleSalvar = () => {
    try {
      const planId = criarESalvar(workout.key);
      router.replace({ pathname: '/plano/[id]', params: { id: String(planId) } });
    } catch (err) {
      reportError('Erro ao salvar treino', err);
    }
  };

  return (
    <Screen showBack scrollable>
      <ScreenTitle title={workout.nome} subtitle={workout.subtitulo} />

      {workout.exercises.map((ex, index) => (
        <Card key={`${ex.wgerId}-${index}`} className="mb-2 flex-row items-center justify-between">
          <Text className="flex-1 pr-2 font-body-medium text-base text-text" numberOfLines={1}>
            {nomeByWgerId.get(ex.wgerId) ?? 'Exercício'}
          </Text>
          <Text className="font-display text-lg text-text">{`${ex.seriesAlvo}x${ex.repsAlvo}`}</Text>
        </Card>
      ))}

      <Button className="mb-3 mt-4 py-4" onPress={handleTreinarAgora}>
        Treinar agora
      </Button>
      <Button variant="secondary" onPress={handleSalvar}>
        Salvar como planilha
      </Button>
    </Screen>
  );
}
