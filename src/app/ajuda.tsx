import { Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { HELP_SECTIONS } from '@/content/help';

export default function AjudaScreen() {
  return (
    <Screen showBack scrollable>
      <ScreenTitle title="Ajuda" subtitle="Consulta rápida por área do app" />

      {HELP_SECTIONS.map((section, sectionIndex) => (
        <View key={section.area} className={sectionIndex === 0 ? 'mb-6' : 'mb-6 mt-2'}>
          <Text className="mb-3 font-display text-2xl uppercase text-text">{section.area}</Text>

          {section.items.map((item, itemIndex) => (
            <View
              key={item.title}
              className={
                itemIndex < section.items.length - 1 ? 'mb-4 border-b border-border pb-4' : 'mb-4'
              }>
              <Text className="font-body-medium text-base text-text">{item.title}</Text>
              <Text className="mt-1 font-body text-sm text-muted">{item.body}</Text>

              {item.warning && (
                <View className="mt-2 rounded border-l-4 border-l-warning bg-surface px-3 py-2">
                  <Label className="text-warning">Atenção</Label>
                  <Text className="mt-1 font-body text-sm text-text">{item.warning}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      ))}
    </Screen>
  );
}
