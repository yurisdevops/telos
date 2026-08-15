import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { db } from '@/db';
import { sessions, workoutDays } from '@/db/schema';
import { formatShortDateLabel } from '@/lib/date';
import { formatElapsed } from '@/lib/duration';
import { colors } from '@/theme/tokens';

// Extraído de hoje.tsx (Onda "Perfil", etapa 3) — mesma query, mesmo sort,
// mesmo limite de 10. Sem título próprio: quem posiciona este componente
// decide o título da seção (ver perfil.tsx).
export function WorkoutHistorySection() {
  const router = useRouter();

  const { data: historyRows } = useLiveQuery(
    db
      .select({
        id: sessions.id,
        data: sessions.data,
        dayLabel: workoutDays.label,
        horaInicio: sessions.horaInicio,
        horaFim: sessions.horaFim,
        foraDaAcademia: sessions.foraDaAcademia,
      })
      .from(sessions)
      .innerJoin(workoutDays, eq(sessions.workoutDayId, workoutDays.id))
      .where(eq(sessions.concluida, true))
  );

  // Limite de 10 igual ao original — um "ver mais" (como o de recordes
  // pessoais) é uma possibilidade futura, não implementada agora.
  const sortedHistory = useMemo(() => {
    return [...(historyRows ?? [])].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 10);
  }, [historyRows]);

  if (sortedHistory.length === 0) {
    return <Text className="font-body text-muted">Nenhuma sessão concluída ainda.</Text>;
  }

  return (
    <View>
      {sortedHistory.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => router.push({ pathname: '/sessao/[id]', params: { id: String(item.id) } })}>
          <Card className="mb-2">
            <View className="flex-row items-center gap-1.5">
              <Text className="font-card-title text-lg text-text">{item.dayLabel}</Text>
              {item.foraDaAcademia && (
                <Ionicons name="location-outline" size={14} color={colors.muted} />
              )}
            </View>
            <View className="mt-1 flex-row items-center justify-between">
              <Label>{formatShortDateLabel(item.data)}</Label>
              {item.horaInicio != null && item.horaFim != null && (
                <Label>{formatElapsed(item.horaFim - item.horaInicio)}</Label>
              )}
            </View>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}
