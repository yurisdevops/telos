import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Label } from './label';

type ScreenTitleProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export function ScreenTitle({ title, subtitle, action }: ScreenTitleProps) {
  return (
    <View className="flex-row items-start justify-between pb-4 pt-2">
      <View className="flex-1 pr-3">
        <Text className="font-display text-4xl uppercase text-text" numberOfLines={1}>
          {title}
        </Text>
        {subtitle && <Label className="mt-1">{subtitle}</Label>}
      </View>
      {action}
    </View>
  );
}
