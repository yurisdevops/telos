import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';

import { ExerciseCatalogList } from '@/components/exercise-catalog-list';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { exercises } from '@/db/schema';

export default function CatalogoScreen() {
  const router = useRouter();
  const [totalCount, setTotalCount] = useState<number | null>(null);

  useEffect(() => {
    db.$count(exercises).then(setTotalCount);
  }, []);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScreenTitle title="Catálogo" subtitle={totalCount !== null ? `${totalCount} exercícios` : undefined} />

      <ExerciseCatalogList
        onSelectExercise={(item) =>
          router.push({ pathname: '/exercicio/[id]', params: { id: String(item.id) } })
        }
      />
    </Screen>
  );
}
