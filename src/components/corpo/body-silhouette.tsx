import { Text, View } from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useUserProfile, type Sexo } from '@/db/user-profile';
import { buildFigurePaths, getHeadEllipse, VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from '@/lib/body-silhouette';
import { colors } from '@/theme/tokens';

// Altura de exibição fixa (~320px) — largura calculada pra preservar a
// proporção do viewBox (240x480), não esticar o boneco.
const DISPLAY_HEIGHT = 320;
const DISPLAY_WIDTH = (VIEWBOX_WIDTH / VIEWBOX_HEIGHT) * DISPLAY_HEIGHT;

// Mesmo fill/stroke em TODAS as formas (cabeça + tronco + 2 braços + 2
// pernas) — como são peças de um multi-path, usar a mesma cor em cada uma
// faz a costura entre elas sumir visualmente (nenhuma linha aparece onde um
// braço encosta no tronco, por exemplo). `stroke` em `colors.bg` (o fundo
// mais escuro do app, mais escuro que o Card) em vez de `colors.border`
// (cinza sutil) — contraste nítido tanto contra o preenchimento accent
// quanto contra o surface do Card, lê como "ícone com contorno definido" em
// vez de "mancha" (era o problema da v1/v2, preenchimento sólido sem
// nenhuma borda visível).
const FILL = colors.accent;
const STROKE = colors.bg;
const STROKE_WIDTH = 2.5;

function isSexo(value: string | null | undefined): value is Sexo {
  return value === 'masculino' || value === 'feminino';
}

/**
 * Silhueta 2D — v3, multi-path anatômico (cabeça/tronco/braço esq/braço
 * dir/perna esq/perna dir), proporções FIXAS por sexo nesta rodada (ver
 * body-silhouette.ts). A reação a ombro/cintura/quadril fica pra depois, se
 * o visual for aprovado — por isso não lê nenhuma medida aqui, só o sexo.
 *
 * Fallback: sem sexo escolhido → não dá pra saber qual template usar
 * (masc/fem diferem na estrutura inteira, não só numa escala) → CTA em vez
 * de um boneco ambíguo.
 */
export function BodySilhouette() {
  const profile = useUserProfile();

  if (!isSexo(profile?.sexo)) {
    return (
      <Card className="mb-6 items-center py-8">
        <Text className="mb-1 text-center font-card-title text-lg text-text">Escolha seu sexo no Perfil</Text>
        <Label className="text-center">pra ver sua silhueta</Label>
      </Card>
    );
  }

  const figure = buildFigurePaths(profile.sexo);
  const head = getHeadEllipse(profile.sexo);

  return (
    <Card className="mb-6 items-center">
      <Text className="mb-4 self-start font-card-title text-lg text-text">Minha silhueta</Text>

      <View style={{ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT }}>
        <Svg width={DISPLAY_WIDTH} height={DISPLAY_HEIGHT} viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
          <Path d={figure.pernaEsquerda} fill={FILL} stroke={STROKE} strokeWidth={STROKE_WIDTH} />
          <Path d={figure.pernaDireita} fill={FILL} stroke={STROKE} strokeWidth={STROKE_WIDTH} />
          <Path d={figure.bracoEsquerdo} fill={FILL} stroke={STROKE} strokeWidth={STROKE_WIDTH} />
          <Path d={figure.bracoDireito} fill={FILL} stroke={STROKE} strokeWidth={STROKE_WIDTH} />
          <Path d={figure.torso} fill={FILL} stroke={STROKE} strokeWidth={STROKE_WIDTH} />
          <Ellipse
            cx={head.cx}
            cy={head.cy}
            rx={head.rx}
            ry={head.ry}
            fill={FILL}
            stroke={STROKE}
            strokeWidth={STROKE_WIDTH}
          />
        </Svg>
      </View>
    </Card>
  );
}
