import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ExerciseCatalogList } from '@/components/exercise-catalog-list';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { exercises } from '@/db/schema';
import { colors } from '@/theme/tokens';

export default function CatalogoScreen() {
  const router = useRouter();
  const [totalCount, setTotalCount] = useState<number | null>(null);

  useEffect(() => {
    db.$count(exercises).then(setTotalCount);
  }, []);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScreenTitle
        title="Catálogo"
        subtitle={totalCount !== null ? `${totalCount} exercícios` : undefined}
        action={
          <Pressable onPress={() => router.push('/sobre')} hitSlop={8} className="p-1">
            <Ionicons name="information-circle-outline" size={24} color={colors.muted} />
          </Pressable>
        }
      />

      <ExerciseCatalogList
        onSelectExercise={(item) =>
          router.push({ pathname: '/exercicio/[id]', params: { id: String(item.id) } })
        }
      />
    </Screen>
  );
}
