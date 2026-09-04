import { useState } from 'react';
import { Text, View } from 'react-native';
import Body, { type Slug } from 'react-native-body-highlighter';

import { Screen } from '@/components/screen';
import { Chip } from '@/components/ui/chip';
import { ScreenTitle } from '@/components/ui/screen-title';
import { colors } from '@/theme/tokens';

type Side = 'front' | 'back';

/**
 * Passo 1 (validação de toque/visual) — SEM lógica de exercícios ainda. Só
 * confirma que a lib renderiza bem no Chapa e Ferro e que o toque devolve o
 * slug certo. A busca "músculo → exercícios" entra numa etapa seguinte.
 */
export default function MapaMuscularScreen() {
  const [side, setSide] = useState<Side>('front');
  const [selectedSlug, setSelectedSlug] = useState<Slug | null>(null);

  return (
    <Screen showBack scrollable>
      <ScreenTitle title="Mapa muscular" />

      <View className="mb-4 flex-row justify-center gap-2">
        <Chip label="Frente" selected={side === 'front'} onPress={() => setSide('front')} />
        <Chip label="Costas" selected={side === 'back'} onPress={() => setSide('back')} />
      </View>

      <View className="items-center">
        <Body
          side={side}
          gender="male"
          scale={1.5}
          // Fundo/traços no tom do Chapa e Ferro — a lib por padrão usa cinza
          // claro (#dfdfdf) de contorno e #3f3f3f de preenchimento, que não
          // batem com o tema escuro do app.
          border={colors.border}
          defaultFill={colors.surface}
          defaultStroke={colors.border}
          defaultStrokeWidth={1}
          data={selectedSlug ? [{ slug: selectedSlug, color: colors.accent }] : []}
          onBodyPartPress={(bodyPart) => setSelectedSlug(bodyPart.slug ?? null)}
        />
      </View>

      <View className="mt-4 items-center" style={{ minHeight: 24 }}>
        <Text className="font-body-medium text-sm text-text">
          {selectedSlug ? `Tocado: ${selectedSlug}` : 'Toque em um músculo'}
        </Text>
      </View>
    </Screen>
  );
}
