import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Body, { type Slug } from 'react-native-body-highlighter';

import { FormModal } from '@/components/form-modal';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { getExercisesByMuscle } from '@/db/exercises-by-muscle';
import { MUSCLE_KEY_BY_SLUG } from '@/lib/muscle-map';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

type Side = 'front' | 'back';

/**
 * Toque num músculo com chave válida → acende (accent) e abre a lista de
 * exercícios daquele músculo. Slugs sem chave no catálogo (hair, head,
 * hands, feet, ankles, tibialis, knees — ver MUSCLE_KEY_BY_SLUG) são
 * ignorados: nem acendem, nem abrem nada. O slug em si (inglês) nunca
 * aparece na UI — só serve pra achar a chave em português via
 * MUSCLE_KEY_BY_SLUG e pra alimentar o `data` da lib (que exige o slug
 * original de volta pra saber qual `<Path>` colorir).
 */
export default function MapaMuscularScreen() {
  const router = useRouter();
  const [side, setSide] = useState<Side>('front');
  const [selectedSlug, setSelectedSlug] = useState<Slug | null>(null);

  const selectedKey = selectedSlug ? MUSCLE_KEY_BY_SLUG[selectedSlug] : undefined;

  const results = useDbQuery(
    () => (selectedKey ? getExercisesByMuscle(selectedKey) : Promise.resolve([])),
    ['exercises'],
    [selectedKey]
  );

  const handleBodyPartPress = (slug?: Slug) => {
    if (!slug || !MUSCLE_KEY_BY_SLUG[slug]) return; // slug sem chave no catálogo — ignora
    setSelectedSlug(slug);
  };

  const openExercise = (exerciseId: number) => {
    setSelectedSlug(null);
    router.push({ pathname: '/exercicio/[id]', params: { id: String(exerciseId) } });
  };

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
          onBodyPartPress={(bodyPart) => handleBodyPartPress(bodyPart.slug)}
        />
      </View>

      <FormModal visible={selectedKey != null} onRequestClose={() => setSelectedSlug(null)}>
        <Text className="mb-4 font-card-title text-lg text-text">{selectedKey}</Text>

        {results === undefined ? null : results.length === 0 ? (
          <Text className="py-8 text-center font-body text-muted">
            Nenhum exercício visível para este músculo.
          </Text>
        ) : (
          <View className="gap-2">
            {results.map(({ exercise, isPrimario }) => (
              <Pressable key={exercise.id} onPress={() => openExercise(exercise.id)}>
                <Card className="flex-row items-center justify-between px-4 py-3">
                  <Text className="flex-1 pr-2 font-body-medium text-sm text-text" numberOfLines={1}>
                    {exercise.nome}
                  </Text>
                  <Label className={isPrimario ? 'text-accent' : 'text-warning'}>
                    {isPrimario ? 'Primário' : 'Secundário'}
                  </Label>
                </Card>
              </Pressable>
            ))}
          </View>
        )}

        <Button variant="secondary" className="mt-4" onPress={() => setSelectedSlug(null)}>
          Fechar
        </Button>
      </FormModal>
    </Screen>
  );
}
