import { useState } from 'react';
import { Text, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { getCardioWeeklyMinutes } from '@/db/cardio-stats';
import { useUserProfile } from '@/db/user-profile';
import { formatDayMonthLabel, parseLocalIsoDate } from '@/lib/date';
import { chooseNiceStep, formatNumberPtBr } from '@/lib/format';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

const WEEKS_WINDOW = 10;

/**
 * Card IRMÃO de WeeklyVolumeSection/DensitySection (mesmo nível na aba
 * Progresso) — de propósito NÃO dentro do CollapsibleSection do
 * CardioSection: aquele accordion é resumo + histórico, pensado pra ser
 * leve; espremer mais um gráfico de ~160px lá deixaria ele pesado.
 *
 * Só renderiza (o card inteiro, não só o gráfico) se houver ao menos uma
 * semana com cardio na janela — diferente de WeeklyVolumeSection/
 * DensitySection, que sempre mostram o Card com um texto vazio no lugar do
 * gráfico: aqui um gráfico 100% zerado só poluiria o Progresso sem agregar
 * nada, então o card inteiro some enquanto não houver dado.
 */
export function CardioTrendSection() {
  const weeklyRows = useDbQuery(
    () => getCardioWeeklyMinutes(WEEKS_WINDOW),
    ['cardio_logs', 'sessions', 'cardio_sessions'],
    []
  );
  // Reativo por si só (useLiveQuery por baixo, ver db/user-profile.ts) — não
  // precisa entrar em watchTables, já reage sozinho a mudança de meta salva
  // no Perfil.
  const profile = useUserProfile();

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (weeklyRows === undefined) return null;

  const hasAny = weeklyRows.some((week) => week.minutos > 0);
  if (!hasAny) return null;

  const selectedWeek = selectedIndex != null ? weeklyRows[selectedIndex] : null;
  const meta = profile?.metaCardioMinutosSemana ?? null;

  const barData = weeklyRows.map((week, index) => {
    const distanceFromEnd = weeklyRows.length - 1 - index;
    const showLabel = distanceFromEnd % 2 === 0;
    return {
      value: week.minutos,
      label: showLabel ? formatDayMonthLabel(parseLocalIsoDate(week.weekKey)) : '',
      frontColor: index === selectedIndex ? colors.text : colors.accent,
    };
  });

  // A meta entra no cálculo do teto do eixo Y (junto com o maior valor de
  // barra) — senão uma meta acima de todas as barras ficaria fora da área
  // visível do gráfico e a linha de referência nunca apareceria.
  const TARGET_SECTIONS = 4;
  const rawMax = Math.max(...weeklyRows.map((week) => week.minutos), meta ?? 0, 0);
  const step = chooseNiceStep(rawMax / TARGET_SECTIONS || 1);
  const niceMax = step * TARGET_SECTIONS;

  return (
    <Card className="mb-6">
      <Text className="font-card-title text-lg text-text">Cardio por semana</Text>
      <Label className="mb-4">Minutos de cardio · semanas iniciadas na data indicada</Label>

      <BarChart
        data={barData}
        height={160}
        barWidth={16}
        spacing={14}
        initialSpacing={8}
        roundedTop
        hideRules
        xAxisThickness={1}
        xAxisColor={colors.border}
        yAxisThickness={0}
        yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
        xAxisLabelTextStyle={{ color: colors.muted, fontSize: 9 }}
        maxValue={niceMax}
        noOfSections={TARGET_SECTIONS}
        formatYLabel={(label) => formatNumberPtBr(Number(label))}
        onPress={(_item: unknown, index: number) =>
          setSelectedIndex((current) => (current === index ? null : index))
        }
        // Linha horizontal na altura da meta semanal — só quando o usuário
        // definiu uma (Perfil, metaCardioMinutosSemana). referenceLine1Position
        // usa a mesma escala de valor das barras (minutos), não pixels — a
        // lib converte pra pixel internamente usando maxValue/containerHeight.
        showReferenceLine1={meta != null}
        referenceLine1Position={meta ?? 0}
        referenceLine1Config={{
          color: colors.success,
          thickness: 2,
          dashWidth: 4,
          dashGap: 3,
          labelText: meta != null ? `Meta: ${meta} min` : '',
          labelTextStyle: { color: colors.success, fontSize: 9 },
        }}
      />
      <View className="mt-3 items-center" style={{ minHeight: 20 }}>
        {selectedWeek && (
          <Text className="font-body-medium text-sm text-text">
            {`Semana de ${formatDayMonthLabel(parseLocalIsoDate(selectedWeek.weekKey))}: ${selectedWeek.minutos} min de cardio`}
          </Text>
        )}
      </View>
    </Card>
  );
}
