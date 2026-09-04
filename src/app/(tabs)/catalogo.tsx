import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';

import { ExerciseCatalogList } from '@/components/exercise-catalog-list';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { exercises } from '@/db/schema';

export default function CatalogoScreen() {
  const router = useRouter();
  const [totalCount, setTotalCount] = useState<number | null>(null);

  useEffect(() => {
    // Mesma curadoria da lista abaixo (visivel = true) — o header conta o
    // que a busca realmente mostra, não o catálogo inteiro (872 no banco).
    db.$count(exercises, eq(exercises.visivel, true)).then(setTotalCount);
  }, []);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScreenTitle
        title="Catálogo"
        subtitle={totalCount !== null ? `${totalCount} exercícios` : undefined}
        action={
          <Button onPress={() => router.push('/mapa-muscular')} className="self-start">
            Mapa muscular
          </Button>
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
