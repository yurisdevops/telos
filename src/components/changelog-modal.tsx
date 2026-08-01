import { Text, View } from 'react-native';

import { FormModal } from '@/components/form-modal';
import { Button } from '@/components/ui/button';
import type { ChangelogEntry } from '@/lib/changelog';

/**
 * Reusado em dois contextos com comportamento de dismiss diferente:
 * no boot (_layout.tsx), `entries` são só as não vistas e o dismiss marca
 * CURRENT_CHANGELOG_VERSION como visto; no Perfil ("reler"), `entries` é o
 * changelog inteiro e o dismiss só fecha, sem marcar nada — a decisão de
 * qual `entries` passar e o que fazer no `onDismiss` é de quem usa este
 * componente, não dele.
 */
export function ChangelogModal({
  visible,
  entries,
  onDismiss,
}: {
  visible: boolean;
  entries: ChangelogEntry[];
  onDismiss: () => void;
}) {
  return (
    <FormModal visible={visible} onRequestClose={onDismiss}>
      <Text className="mb-4 font-display text-2xl uppercase text-text">Novidades</Text>

      {entries.map((entry) =>
        entry.items.map((item, index) => (
          <View key={`${entry.version}-${index}`} className="mb-4">
            <Text className="font-card-title text-base text-accent">{item.titulo}</Text>
            <Text className="mt-1 font-body text-sm text-muted">{item.descricao}</Text>
          </View>
        ))
      )}

      <Button className="mt-2" onPress={onDismiss}>
        Entendi
      </Button>
    </FormModal>
  );
}
