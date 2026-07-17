import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ExerciseCatalogList } from '@/components/exercise-catalog-list';

export default function CatalogoScreen() {
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-950">
      <Text className="px-4 pb-3 pt-4 text-2xl font-bold text-white">Catálogo</Text>
      <ExerciseCatalogList
        onSelectExercise={(item) =>
          router.push({ pathname: '/exercicio/[id]', params: { id: String(item.id) } })
        }
      />
    </SafeAreaView>
  );
}
