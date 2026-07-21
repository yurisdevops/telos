import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONTENT_HORIZONTAL_PADDING } from './screen';

type FormModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
};

export function FormModal({ visible, onRequestClose, children }: FormModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onRequestClose}>
      <KeyboardAvoidingView
        className="flex-1 bg-black/70"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            paddingLeft: insets.left + CONTENT_HORIZONTAL_PADDING,
            paddingRight: insets.right + CONTENT_HORIZONTAL_PADDING,
          }}
          keyboardShouldPersistTaps="handled">
          <View className="w-full rounded border border-border bg-surface p-4">{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
