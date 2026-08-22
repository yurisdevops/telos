import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { Label } from '@/components/ui/label';
import { getCardioHistory, getCardioWeekSummary } from '@/db/cardio-stats';
import { MODALIDADES_CARDIO } from '@/lib/cardio';
import { formatShortDateLabel, getTodayDateString, getWeekStartIso, parseLocalIsoDate, toLocalIsoDate } from '@/lib/date';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

const HISTORY_LIMIT = 10;

/**
 * Seção "Cardio" do Progresso — dentro de um CollapsibleSection (sempre
 * nasce colapsada, comportamento padrão do próprio wrapper — não existe
 * prop pra mudar isso, nem precisa: são dados opcionais, não o foco do
 * Progresso). Enquanto colapsada, nada aqui é montado — as duas queries só
 * disparam quando o usuário expande (ver CollapsibleSection).
 */
export function CardioSection() {
  // Semana atual — mesmo cálculo de boundary [início, +7 dias) já usado por
  // computeCurrentWeekVolume em db/stats.ts, pra ficar consistente com o
  // resto do app quanto ao que conta como "semana atual".
  const { startIso, endIso } = useMemo(() => {
    const weekStartIso = getWeekStartIso(getTodayDateString());
    const weekStart = parseLocalIsoDate(weekStartIso);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return { startIso: weekStartIso, endIso: toLocalIsoDate(weekEnd) };
  }, []);

  const summary = useDbQuery(
    () => getCardioWeekSummary(startIso, endIso),
    ['cardio_logs', 'sessions', 'cardio_sessions'],
    [startIso, endIso]
  );
  const history = useDbQuery(() => getCardioHistory(HISTORY_LIMIT), ['cardio_logs', 'sessions', 'cardio_sessions'], []);

  return (
    <CollapsibleSection title="Cardio" icon="flash-outline">
      {summary && (
        <View>
          {summary.totalMinutos === 0 ? (
            <View className="items-center py-2">
              <Text className="text-center font-body text-sm text-muted">Nenhum cardio esta semana</Text>
              <Label className="mt-1 text-center">
                Registre um bloco de cardio dentro de um treino, ou inicie uma sessão separada na aba Treinar.
              </Label>
            </View>
          ) : (
            <View>
              <Text className="font-display text-4xl text-accent">
                {summary.totalMinutos}
                <Text className="font-label text-sm uppercase text-muted"> min esta semana</Text>
              </Text>

              <View className="mt-3 gap-2">
                {summary.porModalidade.map((item) => (
                  <View key={item.modalidade} className="flex-row items-center gap-2">
                    <Ionicons name={item.icon} size={16} color={colors.muted} />
                    <Text className="flex-1 font-body text-sm text-text">{item.label}</Text>
                    <Text className="font-label text-sm text-muted">{`${item.minutos} min`}</Text>
                  </View>
                ))}
              </View>

              <Label className="mt-3">
                {`${summary.totalSessoes} ${summary.totalSessoes === 1 ? 'sessão' : 'sessões'} de cardio`}
              </Label>
            </View>
          )}
        </View>
      )}

      {/* Histórico — omitido por completo se vazio, sem repetir o estado
          vazio da Parte 1 (a semana atual já cobre esse aviso). */}
      {history && history.length > 0 && (
        <View className="mt-5 gap-2">
          <Label>Histórico</Label>
          {history.map((item, index) => (
            <Card key={`${item.tipo}-${item.data}-${index}`} className="px-4 py-3">
              <View className="flex-row items-center justify-between">
                <Text className="font-card-title text-sm text-text">{formatShortDateLabel(item.data)}</Text>
                <Label>{item.tipo === 'forca_com_cardio' ? 'Treino + Cardio' : 'Cardio'}</Label>
              </View>
              <Label className="mt-1">{`${item.duracaoTotalMin} min`}</Label>
              <View className="mt-2 flex-row flex-wrap gap-1">
                {[...new Set(item.blocos.map((b) => b.modalidade))].map((modalidade) => (
                  <Chip key={modalidade} label={MODALIDADES_CARDIO.find((m) => m.key === modalidade)?.label ?? modalidade} />
                ))}
              </View>
            </Card>
          ))}
        </View>
      )}
    </CollapsibleSection>
  );
}
