import { Fragment, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getLatestMeasurementsWithPrevious,
  upsertMeasurementsToday,
  type MeasurementField,
  type MeasurementPatch,
} from '@/db/body-measurements';
import { formatNumberPtBr } from '@/lib/format';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

// Ordem anatômica cima→baixo, como pedido — não alfabética nem de inserção.
const MEASUREMENT_FIELDS: { field: MeasurementField; label: string }[] = [
  { field: 'peitoCm', label: 'Peito' },
  { field: 'cinturaCm', label: 'Cintura' },
  { field: 'quadrilCm', label: 'Quadril' },
  { field: 'bracoCm', label: 'Braço' },
  { field: 'coxaCm', label: 'Coxa' },
  { field: 'panturrilhaCm', label: 'Panturrilha' },
];

type Drafts = Partial<Record<MeasurementField, string>>;

/**
 * Espelha BodyWeightSection (peso), mas com 6 campos opcionais em vez de 1
 * obrigatório: grade de 2 colunas (não uma parede de 6 inputs empilhados) —
 * cada campo mostra o valor atual como placeholder e, se houver um registro
 * anterior pra comparar, a variação com seta ↑/↓. Sem cor de "bom/ruim" na
 * variação de propósito — ao contrário de peso, "medida subiu" não é
 * universalmente positivo nem negativo (depende do objetivo de cada um:
 * braço maior pode ser meta, cintura maior não), então só mostra o número,
 * neutro, mesma filosofia de StagnationSection.
 *
 * Sem `Card`/título próprios — ao contrário de BodyWeightSection, esta
 * seção é renderizada dentro de um `CollapsibleSection` (progresso.tsx), que
 * já fornece os dois por fora. Mesmo ajuste já feito em VolumeAnalysisSection
 * quando ela entrou num CollapsibleSection no Perfil.
 */
export function MeasurementsSection() {
  const data = useDbQuery(getLatestMeasurementsWithPrevious, ['body_measurements'], []);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [saving, setSaving] = useState(false);

  const latest = data?.latest ?? null;
  const previous = data?.previous ?? null;
  const hasAnyMeasurement = latest != null && MEASUREMENT_FIELDS.some(({ field }) => latest[field] != null);
  const hasAnyDraft = Object.values(drafts).some((v) => v?.trim());

  const handleChangeDraft = (field: MeasurementField, text: string) => {
    setDrafts((prev) => ({ ...prev, [field]: text }));
  };

  const handleRegister = async () => {
    const patch: MeasurementPatch = {};
    for (const { field } of MEASUREMENT_FIELDS) {
      const raw = drafts[field]?.trim();
      if (!raw) continue;
      const value = Number(raw.replace(',', '.'));
      if (!value || value <= 0) continue;
      patch[field] = value;
    }
    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    try {
      await upsertMeasurementsToday(patch);
      setDrafts({});
    } catch (err) {
      console.error('Falha ao registrar medidas:', err);
      Alert.alert('Erro ao registrar medidas', String(err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Fragment>
      <Label className="mb-4">Evolução das suas medidas ao longo do tempo</Label>

      {!hasAnyMeasurement && (
        <Text className="mb-4 font-body text-sm text-muted">Sem medidas registradas ainda.</Text>
      )}

      <View className="-mx-1.5 flex-row flex-wrap">
        {MEASUREMENT_FIELDS.map(({ field, label }) => {
          const latestValue = latest?.[field] ?? null;
          const previousValue = previous?.[field] ?? null;
          const delta = latestValue != null && previousValue != null ? latestValue - previousValue : null;

          return (
            <View key={field} className="mb-3 px-1.5" style={{ width: '50%' }}>
              <Label className="mb-1">{label}</Label>
              <Input
                value={drafts[field] ?? ''}
                onChangeText={(text) => handleChangeDraft(field, text)}
                keyboardType="decimal-pad"
                placeholder={latestValue != null ? `${formatNumberPtBr(latestValue)}cm` : 'cm'}
              />
              {latestValue != null && (
                <View className="mt-1 flex-row flex-wrap items-center gap-1">
                  <Text className="font-body text-xs text-muted">{`Atual: ${formatNumberPtBr(latestValue)}cm`}</Text>
                  {delta != null && delta !== 0 && (
                    <View className="flex-row items-center gap-0.5">
                      <Ionicons name={delta > 0 ? 'arrow-up' : 'arrow-down'} size={10} color={colors.muted} />
                      <Text className="font-body text-xs text-muted">{`${formatNumberPtBr(Math.abs(delta))}cm`}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      <Button onPress={handleRegister} disabled={!hasAnyDraft || saving} className="mt-2">
        Registrar hoje
      </Button>
    </Fragment>
  );
}
