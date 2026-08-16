import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { getLatestMeasurements } from '@/db/body-measurements';
import { useUserProfile, type Sexo } from '@/db/user-profile';
import { buildBodyPathD, VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from '@/lib/body-silhouette';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

// Altura de exibição fixa (~320px, como pedido) — largura calculada pra
// preservar a proporção do viewBox (240x480), não esticar o boneco.
const DISPLAY_HEIGHT = 320;
const DISPLAY_WIDTH = (VIEWBOX_WIDTH / VIEWBOX_HEIGHT) * DISPLAY_HEIGHT;

function isSexo(value: string | null | undefined): value is Sexo {
  return value === 'masculino' || value === 'feminino';
}

/**
 * Silhueta 2D — v1 "tosca de propósito" (Fase 2 do boneco). Reage só a
 * ombro/cintura/quadril (buildBodyPathD, src/lib/body-silhouette.ts);
 * braço/coxa/panturrilha, lado esquerdo/direito e refinamento visual ficam
 * pra rodadas seguintes.
 *
 * Fallbacks (nunca quebra por falta de dado):
 * - Sem sexo escolhido → não dá pra saber qual template base usar (masc/fem
 *   diferem na estrutura, não só numa escala) — CTA em vez de um boneco
 *   ambíguo.
 * - Sexo escolhido, sem NENHUMA medida → a própria buildBodyPathD já cai no
 *   valor base de cada âncora (ver BASE_PROPORTIONS) quando a medida ou a
 *   altura faltam — a silhueta "base pura" do sexo escolhido aparece sozinha,
 *   sem precisar de nenhum `if` especial aqui; só soma um aviso sutil.
 */
export function BodySilhouette() {
  const profile = useUserProfile();
  const latest = useDbQuery(getLatestMeasurements, ['body_measurements'], []);

  if (!isSexo(profile?.sexo)) {
    return (
      <Card className="mb-6 items-center py-8">
        <Text className="mb-1 text-center font-card-title text-lg text-text">Escolha seu sexo no Perfil</Text>
        <Label className="text-center">pra ver sua silhueta</Label>
      </Card>
    );
  }

  const hasAnyMeasurement =
    latest != null && (latest.ombrosCm != null || latest.cinturaCm != null || latest.quadrilCm != null);

  const d = buildBodyPathD({
    sexo: profile.sexo,
    alturaCm: profile.alturaCm,
    ombrosCm: latest?.ombrosCm ?? null,
    cinturaCm: latest?.cinturaCm ?? null,
    quadrilCm: latest?.quadrilCm ?? null,
  });

  return (
    <Card className="mb-6 items-center">
      <Text className="mb-4 self-start font-card-title text-lg text-text">Minha silhueta</Text>

      <View style={{ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT }}>
        <Svg width={DISPLAY_WIDTH} height={DISPLAY_HEIGHT} viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
          <Path d={d} fill={colors.accent} stroke={colors.border} strokeWidth={2} />
        </Svg>
      </View>

      {!hasAnyMeasurement && (
        <Label className="mt-3 text-center">Registre suas medidas pra personalizar</Label>
      )}
    </Card>
  );
}
