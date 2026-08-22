import { useMemo } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { cardioLogs, cardioSessions } from '@/db/schema';
import { formatElapsed, useNow } from '@/lib/duration';
import { INTENSIDADES_CARDIO, MODALIDADES_CARDIO } from '@/lib/cardio';
import { colors } from '@/theme/tokens';

function reportError(context: string, err: unknown) {
  console.error(context, err);
  Alert.alert(context, String(err instanceof Error ? err.message : err));
}

export default function CardioSessaoScreen() {
  const router = useRouter();
  const { cardioSessionId } = useLocalSearchParams<{ cardioSessionId: string }>();
  const cardioSessionIdNum = Number(cardioSessionId);
  const now = useNow(1000);

  const { data: cardioSessionRows } = useLiveQuery(
    db.select().from(cardioSessions).where(eq(cardioSessions.id, cardioSessionIdNum)),
    [cardioSessionIdNum]
  );
  const cardioSession = cardioSessionRows?.[0];

  const { data: blocks } = useLiveQuery(
    db.select().from(cardioLogs).where(eq(cardioLogs.cardioSessionId, cardioSessionIdNum)),
    [cardioSessionIdNum]
  );

  // Resumo pro card "Cardio concluído" — total de blocos, minutos somados,
  // modalidades sem repetir (Set + join), mesmo espírito do resumo de
  // ExerciseSessionCard em hoje.tsx (calculado direto de `blocks`, sem
  // query nova).
  const resumo = useMemo(() => {
    const rows = blocks ?? [];
    const totalBlocos = rows.length;
    const totalMinutos = rows.reduce((sum, b) => sum + b.duracaoMin, 0);
    const modalidades = [
      ...new Set(rows.map((b) => MODALIDADES_CARDIO.find((m) => m.key === b.modalidade)?.label ?? b.modalidade)),
    ];
    return { totalBlocos, totalMinutos, modalidades };
  }, [blocks]);

  const handleDeleteBlock = (id: number) => {
    Alert.alert('Remover bloco de cardio', 'Remover este bloco de cardio?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await db.delete(cardioLogs).where(eq(cardioLogs.id, id));
          } catch (err) {
            reportError('Erro ao remover cardio', err);
          }
        },
      },
    ]);
  };

  const handleComplete = async () => {
    try {
      await db
        .update(cardioSessions)
        .set({ concluida: true, horaFim: Date.now() })
        .where(eq(cardioSessions.id, cardioSessionIdNum));
    } catch (err) {
      reportError('Erro ao concluir cardio', err);
    }
  };

  // Filhos antes do pai (cardioLogs referencia cardioSessions) — mesma
  // ordem já usada em handleCancel de hoje.tsx pra sessão de força.
  const handleCancel = () => {
    Alert.alert(
      'Cancelar sessão de cardio',
      'Isso apaga a sessão e todos os blocos registrados nela. Não pode ser desfeito. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.delete(cardioLogs).where(eq(cardioLogs.cardioSessionId, cardioSessionIdNum));
              await db.delete(cardioSessions).where(eq(cardioSessions.id, cardioSessionIdNum));
              router.back();
            } catch (err) {
              reportError('Erro ao cancelar sessão de cardio', err);
            }
          },
        },
      ]
    );
  };

  if (!cardioSession) return null;

  return (
    <Screen showBack scrollable>
      <ScreenTitle title="Sessão de Cardio" />

      {cardioSession.horaInicio != null && (
        <Label className="mb-3">
          {cardioSession.concluida && cardioSession.horaFim != null
            ? `Duração: ${formatElapsed(cardioSession.horaFim - cardioSession.horaInicio)}`
            : `Em andamento: ${formatElapsed(now - cardioSession.horaInicio)}`}
        </Label>
      )}

      {cardioSession.concluida && (
        <Card className="mb-4 border-l-4 border-l-success">
          <Text className="text-center font-label uppercase text-success">Cardio concluído</Text>
          <Label className="mt-2 text-center">
            {`${resumo.totalBlocos} ${resumo.totalBlocos === 1 ? 'bloco' : 'blocos'} · ${resumo.totalMinutos} min${
              resumo.modalidades.length > 0 ? ` · ${resumo.modalidades.join(', ')}` : ''
            }`}
          </Label>
        </Card>
      )}

      {(blocks ?? []).map((log) => {
        const modalidade = MODALIDADES_CARDIO.find((m) => m.key === log.modalidade);
        const intensidade = INTENSIDADES_CARDIO.find((i) => i.key === log.intensidade);
        return (
          <Card key={log.id} className="mb-3 flex-row items-center gap-3 px-4 py-3">
            <Ionicons name={modalidade?.icon ?? 'fitness-outline'} size={20} color={colors.accent} />
            <View className="flex-1">
              <Text className="font-card-title text-sm text-text">{modalidade?.label ?? log.modalidade}</Text>
              <Text className="font-label text-xs text-muted">
                {`${log.duracaoMin} min${log.distanciaKm ? ` · ${log.distanciaKm}km` : ''} · ${
                  intensidade?.label ?? log.intensidade
                }`}
              </Text>
            </View>
            <Pressable onPress={() => handleDeleteBlock(log.id)} hitSlop={8}>
              <Ionicons name="close-outline" size={18} color={colors.muted} />
            </Pressable>
          </Card>
        );
      })}

      {!cardioSession.concluida && (
        <Button
          variant="secondary"
          className="mb-3"
          onPress={() =>
            router.push({
              pathname: '/sessao/adicionar-cardio',
              params: { cardioSessionId: String(cardioSessionIdNum) },
            })
          }
        >
          + Adicionar cardio
        </Button>
      )}

      {!cardioSession.concluida && (
        <Button onPress={handleComplete} className="mb-3 py-4">
          Concluir cardio
        </Button>
      )}

      <Button variant="destructive" onPress={handleCancel}>
        Cancelar sessão
      </Button>
    </Screen>
  );
}
