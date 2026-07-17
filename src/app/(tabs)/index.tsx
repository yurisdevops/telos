import { useRouter } from 'expo-router';

import { ExerciseCatalogList } from '@/components/exercise-catalog-list';
import { Screen } from '@/components/screen';

export default function CatalogoScreen() {
  const router = useRouter();

  return (
    <Screen title="Catálogo" edges={['top', 'left', 'right']}>
      <ExerciseCatalogList
        onSelectExercise={(item) =>
          router.push({ pathname: '/exercicio/[id]', params: { id: String(item.id) } })
        }
      />
    </Screen>
  );
}
