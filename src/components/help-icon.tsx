import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { FormModal } from '@/components/form-modal';
import { Button } from '@/components/ui/button';
import { colors } from '@/theme/tokens';

type HelpIconProps = {
  title: string;
  children: ReactNode;
};

/** Ícone ⓘ discreto que abre uma explicação curta do recurso ao lado do qual é colocado. */
export function HelpIcon({ title, children }: HelpIconProps) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable onPress={() => setVisible(true)} hitSlop={8} className="p-1">
        <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
      </Pressable>
      <FormModal visible={visible} onRequestClose={() => setVisible(false)}>
        <Text className="mb-3 font-card-title text-lg text-text">{title}</Text>
        <Text className="mb-4 font-body text-base text-text">{children}</Text>
        <Button onPress={() => setVisible(false)}>Entendi</Button>
      </FormModal>
    </>
  );
}
