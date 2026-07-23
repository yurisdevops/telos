import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { eq } from 'drizzle-orm';
import { BarChart } from 'react-native-gifted-charts';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/db';
import { bodyWeightLogs } from '@/db/schema';
import { formatDayMonthLabel, getTodayDateString, parseLocalIsoDate } from '@/lib/date';
import { chooseNiceStep, formatNumberPtBr } from '@/lib/format';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

const RECENT_ENTRIES = 20;

export function BodyWeightSection() {
  const [peso, setPeso] = useState('');
  const rows = useDbQuery(
    () => db.select().from(bodyWeightLogs).orderBy(bodyWeightLogs.data),
    ['body_weight_logs'],
    []
  );

  const chartData = useMemo(() => {
    const recent = (rows ?? []).slice(-RECENT_ENTRIES);
    return recent.map((row) => ({
      value: row.pesoKg,
      label: formatDayMonthLabel(parseLocalIsoDate(row.data)),
      frontColor: colors.accent,
    }));
  }, [rows]);

  const TARGET_SECTIONS = 4;
  const rawMax = Math.max(...chartData.map((d) => d.value), 0);
  const rawMin = chartData.length > 0 ? Math.min(...chartData.map((d) => d.value)) : 0;
  const step = chooseNiceStep((rawMax - rawMin) / TARGET_SECTIONS || 1);
  const niceMax = rawMax > 0 ? Math.ceil(rawMax / step) * step : step * TARGET_SECTIONS;

  const handleAdd = async () => {
    const normalized = peso.trim().replace(',', '.');
    const value = Number(normalized);
    if (!value || value <= 0) return;

    try {
      const today = getTodayDateString();
      const existing = (rows ?? []).find((row) => row.data === today);
      if (existing) {
        await db.update(bodyWeightLogs).set({ pesoKg: value }).where(eq(bodyWeightLogs.id, existing.id));
      } else {
        await db.insert(bodyWeightLogs).values({ data: today, pesoKg: value });
      }
      setPeso('');
    } catch (err) {
      console.error('Falha ao registrar peso corporal:', err);
      Alert.alert('Erro ao registrar peso', String(err instanceof Error ? err.message : err));
    }
  };

  return (
    <Card className="mb-6">
      <Text className="font-card-title text-lg text-text">Peso corporal</Text>
      <Label className="mb-4">Evolução ao longo do tempo</Label>

      {chartData.length > 0 ? (
        <BarChart
          data={chartData}
          height={140}
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
        />
      ) : (
        <Text className="py-8 text-center font-body text-muted">Sem registros de peso ainda.</Text>
      )}

      <View className="mt-4 flex-row items-center gap-2">
        <View className="flex-1">
          <Input
            value={peso}
            onChangeText={setPeso}
            keyboardType="decimal-pad"
            placeholder="Ex: 78,5"
          />
        </View>
        <Button onPress={handleAdd} disabled={!peso.trim()}>
          Registrar hoje
        </Button>
      </View>
    </Card>
  );
}
