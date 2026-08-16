import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter';

import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Label } from '@/components/ui/label';
import { computeWeeklyMuscleSeries } from '@/db/analysis';
import { useUserProfile, type Sexo } from '@/db/user-profile';
import { MUSCLE_PT_TO_SLUG, SLUG_TO_MUSCLE_LABEL } from '@/lib/muscle-slug-map';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

// Mesmos cortes já usados em VolumeAnalysisSection (Perfil) e
// MuscleSeriesVolumeSection (Progresso) — "faixa comum de hipertrofia" de
// 10-20 séries/semana. Reusar os mesmos números em vez de inventar um
// terceiro critério de "o que é bastante volume" nesta tela.
const REFERENCE_MIN = 10;
const REFERENCE_MAX = 20;

// Escala de accent — escuro (fraco) → accent (na faixa) → claro/quente
// (acima da faixa). Primeiro palpite de cor, ajuste livre ao ver na tela.
const INTENSITY_COLORS = ['#802613', colors.accent, '#F18F7F'];

function isSexo(value: string | null | undefined): value is Sexo {
  return value === 'masculino' || value === 'feminino';
}

function seriesToIntensity(series: number): 1 | 2 | 3 | null {
  if (series <= 0) return null; // ausente de `data` -> defaultFill (apagado)
  if (series < REFERENCE_MIN) return 1; // fraco
  if (series <= REFERENCE_MAX) return 2; // na faixa
  return 3; // acima da faixa
}

/**
 * Agrupa a média semanal de séries por músculo PT (computeWeeklyMuscleSeries)
 * pelo SLUG da lib (vários PT podem, em tese, cair no mesmo slug — soma) e
 * converte em `intensity`. PT sem correspondente no mapa (ex: "Corpo
 * inteiro") é ignorado — não existe slug que faça sentido pra eles.
 */
function buildBodyData(weeklyMuscleSeries: Record<string, number>): {
  data: ExtendedBodyPart[];
  seriesBySlug: Map<Slug, number>;
} {
  const seriesBySlug = new Map<Slug, number>();
  for (const [pt, series] of Object.entries(weeklyMuscleSeries)) {
    const slug = MUSCLE_PT_TO_SLUG[pt];
    if (!slug) continue;
    seriesBySlug.set(slug, (seriesBySlug.get(slug) ?? 0) + series);
  }

  const data: ExtendedBodyPart[] = [];
  for (const [slug, series] of seriesBySlug) {
    const intensity = seriesToIntensity(series);
    if (intensity == null) continue;
    data.push({ slug, intensity });
  }

  return { data, seriesBySlug };
}

/**
 * Corpo anatômico (react-native-body-highlighter) com os músculos acesos
 * conforme a MÉDIA das últimas 4 semanas completas de treino
 * (computeWeeklyMuscleSeries, src/db/analysis.ts — não é só "esta semana":
 * a semana atual, ainda em andamento, fica de fora de propósito, mesmo
 * critério já usado em VolumeAnalysisSection). Substitui a silhueta
 * paramétrica (removida) — corpo de verdade, desenhado pela lib, em vez de
 * geometria nossa.
 *
 * Fallback sem sexo: não dá pra saber que template usar (masc/fem são
 * desenhos DIFERENTES na lib, não uma escala) — CTA em vez de assumir.
 */
export function MuscleBody() {
  const profile = useUserProfile();
  const weeklyMuscleSeries = useDbQuery(computeWeeklyMuscleSeries, ['set_logs', 'sessions'], []);
  const [side, setSide] = useState<'front' | 'back'>('front');

  const { data, seriesBySlug } = useMemo(
    () => buildBodyData(weeklyMuscleSeries ?? {}),
    [weeklyMuscleSeries]
  );

  const handlePress = (part: ExtendedBodyPart) => {
    if (!part.slug) return;
    const label = SLUG_TO_MUSCLE_LABEL[part.slug] ?? part.slug;
    const series = seriesBySlug.get(part.slug) ?? 0;
    Alert.alert(label, `${series.toFixed(1)} séries por semana, média das últimas 4 semanas.`);
  };

  if (!isSexo(profile?.sexo)) {
    return (
      <Card className="mb-6 items-center py-8">
        <Text className="mb-1 text-center font-card-title text-lg text-text">Escolha seu sexo no Perfil</Text>
        <Label className="text-center">pra ver seu corpo</Label>
      </Card>
    );
  }

  return (
    <Card className="mb-6 items-center">
      <Text className="mb-4 self-start font-card-title text-lg text-text">Músculos treinados</Text>

      <View className="mb-3 flex-row gap-2 self-start">
        <Chip label="Frente" selected={side === 'front'} onPress={() => setSide('front')} />
        <Chip label="Costas" selected={side === 'back'} onPress={() => setSide('back')} />
      </View>

      <Body
        data={data}
        gender={profile.sexo === 'masculino' ? 'male' : 'female'}
        side={side}
        colors={INTENSITY_COLORS}
        defaultFill={colors.border}
        border="none"
        scale={1.1}
        onBodyPartPress={handlePress}
      />

      <Label className="mt-3 self-start text-center">
        Cor = volume de séries por músculo, média das últimas 4 semanas. Escuro: pouco · Accent: faixa
        comum de hipertrofia ({REFERENCE_MIN}-{REFERENCE_MAX}) · Claro: acima disso. Toque num músculo pra
        ver o número.
      </Label>
    </Card>
  );
}
