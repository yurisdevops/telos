import { Text, View } from 'react-native';

import { Screen } from '@/components/screen';

export default function HojeScreen() {
  return (
    <Screen edges={['top', 'left', 'right']}>
      <View className="flex-1 items-center justify-center">
        <Text className="text-xl font-bold text-white">Hoje</Text>
      </View>
    </Screen>
  );
}
