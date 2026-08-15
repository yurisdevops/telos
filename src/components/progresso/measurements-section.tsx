import { Fragment, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  PAIRED_MEASUREMENTS,
  TRUNK_MEASUREMENTS,
  getLatestMeasurementsWithPrevious,
  upsertMeasurementsToday,
  type MeasurementField,
  type MeasurementPatch,
} from '@/db/body-measurements';
import { formatNumberPtBr } from '@/lib/format';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

const ALL_FIELDS: MeasurementField[] = [
  ...TRUNK_MEASUREMENTS.map((m) => m.field),
  ...PAIRED_MEASUREMENTS.flatMap((p) => [p.esq, p.dir]),
];

type Drafts = Partial<Record<MeasurementField, string>>;

/** "Atual: Xcm ↓Ycm" — sem cor de bom/ruim de propósito (ver docstring do
 * componente principal). Compartilhado pelas células de tronco e de par. */
function CurrentAndDelta({ latest, previous }: { latest: number | null; previous: number | null }) {
  if (latest == null) return null;
  const delta = previous != null ? latest - previous : null;
  return (
    <View className="mt-1 flex-row flex-wrap items-center gap-1">
      <Text className="font-body text-xs text-muted">{`${formatNumberPtBr(latest)}cm`}</Text>
      {delta != null && delta !== 0 && (
        <View className="flex-row items-center gap-0.5">
          <Ionicons name={delta > 0 ? 'arrow-up' : 'arrow-down'} size={10} color={colors.muted} />
          <Text className="font-body text-xs text-muted">{`${formatNumberPtBr(Math.abs(delta))}cm`}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * Espelha BodyWeightSection (peso), mas com 12 campos opcionais em vez de 1
 * obrigatório, agrupados por região (Tronco / Braços / Pernas) — 12 inputs
 * soltos virariam parede; agrupados com cabeçalho e os pares esquerdo/
 * direito lado a lado ficam legíveis. Cada campo mostra o valor atual como
 * placeholder e, se houver um registro anterior, a variação com seta ↑/↓.
 * Sem cor de "bom/ruim" na variação de propósito — ao contrário de peso,
 * "medida subiu" não é universalmente positivo nem negativo (depende do
 * objetivo de cada um: braço maior pode ser meta, cintura maior não), então
 * só mostra o número, neutro, mesma filosofia de StagnationSection.
 *
 * Sem `Card`/título próprios — esta seção é renderizada dentro de um
 * `CollapsibleSection` (progresso.tsx), que já fornece os dois por fora.
 */
export function MeasurementsSection() {
  const data = useDbQuery(getLatestMeasurementsWithPrevious, ['body_measurements'], []);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [saving, setSaving] = useState(false);

  const latest = data?.latest ?? null;
  const previous = data?.previous ?? null;
  const hasAnyMeasurement = latest != null && ALL_FIELDS.some((field) => latest[field] != null);
  const hasAnyDraft = Object.values(drafts).some((v) => v?.trim());

  const handleChangeDraft = (field: MeasurementField, text: string) => {
    setDrafts((prev) => ({ ...prev, [field]: text }));
  };

  // "Igualar lados" — copia o rascunho de UM lado pro outro, na direção
  // pedida (ex: digitou o esquerdo, quer que o direito repita o mesmo
  // valor). Opera só nos rascunhos locais (ainda não salvos) — o usuário
  // confirma tudo junto no "Registrar hoje", igual a preencher os dois campos
  // à mão. Por PAR (não um botão geral "igualar tudo"): equalizar braço não
  // deveria mexer em coxa, cada par é uma decisão independente.
  const handleEqualizeSides = (esq: MeasurementField, dir: MeasurementField) => {
    setDrafts((prev) => {
      const esqValue = prev[esq]?.trim();
      if (esqValue) return { ...prev, [dir]: esqValue };
      const dirValue = prev[dir]?.trim();
      if (dirValue) return { ...prev, [esq]: dirValue };
      return prev;
    });
  };

  const handleRegister = async () => {
    const patch: MeasurementPatch = {};
    for (const field of ALL_FIELDS) {
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

  const regions = ['Braços', 'Pernas'] as const;

  return (
    <Fragment>
      <Label className="mb-4">Evolução das suas medidas ao longo do tempo</Label>

      {!hasAnyMeasurement && (
        <Text className="mb-4 font-body text-sm text-muted">Sem medidas registradas ainda.</Text>
      )}

      <Text className="mb-2 font-card-title text-base text-text">Tronco</Text>
      <View className="-mx-1.5 mb-2 flex-row flex-wrap">
        {TRUNK_MEASUREMENTS.map(({ field, label }) => (
          <View key={field} className="mb-3 px-1.5" style={{ width: '50%' }}>
            <Label className="mb-1">{label}</Label>
            <Input
              value={drafts[field] ?? ''}
              onChangeText={(text) => handleChangeDraft(field, text)}
              keyboardType="decimal-pad"
              placeholder={latest?.[field] != null ? `${formatNumberPtBr(latest[field]!)}cm` : 'cm'}
            />
            <CurrentAndDelta latest={latest?.[field] ?? null} previous={previous?.[field] ?? null} />
          </View>
        ))}
      </View>

      {regions.map((region) => (
        <View key={region}>
          <Text className="mb-2 mt-3 font-card-title text-base text-text">{region}</Text>
          {PAIRED_MEASUREMENTS.filter((pair) => pair.region === region).map((pair) => (
            <View key={pair.label} className="mb-3">
              <Label className="mb-1">{pair.label}</Label>
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  <Input
                    value={drafts[pair.esq] ?? ''}
                    onChangeText={(text) => handleChangeDraft(pair.esq, text)}
                    keyboardType="decimal-pad"
                    placeholder={latest?.[pair.esq] != null ? `${formatNumberPtBr(latest[pair.esq]!)}cm` : 'E'}
                  />
                </View>
                <View className="flex-1">
                  <Input
                    value={drafts[pair.dir] ?? ''}
                    onChangeText={(text) => handleChangeDraft(pair.dir, text)}
                    keyboardType="decimal-pad"
                    placeholder={latest?.[pair.dir] != null ? `${formatNumberPtBr(latest[pair.dir]!)}cm` : 'D'}
                  />
                </View>
                <Pressable
                  onPress={() => handleEqualizeSides(pair.esq, pair.dir)}
                  hitSlop={8}
                  className="p-1"
                  accessibilityLabel={`Igualar lados de ${pair.label.toLowerCase()}`}>
                  <Ionicons name="swap-horizontal-outline" size={18} color={colors.muted} />
                </Pressable>
              </View>
              <View className="flex-row gap-4">
                <View className="flex-1">
                  <CurrentAndDelta latest={latest?.[pair.esq] ?? null} previous={previous?.[pair.esq] ?? null} />
                </View>
                <View className="flex-1">
                  <CurrentAndDelta latest={latest?.[pair.dir] ?? null} previous={previous?.[pair.dir] ?? null} />
                </View>
              </View>
            </View>
          ))}
        </View>
      ))}

      <Button onPress={handleRegister} disabled={!hasAnyDraft || saving} className="mt-2">
        Registrar hoje
      </Button>
    </Fragment>
  );
}
