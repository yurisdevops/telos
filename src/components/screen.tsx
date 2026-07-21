import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export const CONTENT_HORIZONTAL_PADDING = 16;

const HEADER_CONTENT_HEIGHT = 56;

type Edge = 'top' | 'bottom' | 'left' | 'right';

const ALL_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

type ScreenProps = {
  children: ReactNode;
  showBack?: boolean;
  scrollable?: boolean;
  edges?: Edge[];
  style?: ViewStyle;
};

export function Screen({
  children,
  showBack = false,
  scrollable = false,
  edges = ALL_EDGES,
  style,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Outer container: exactly the safe-area insets on each enabled edge.
  const insetStyle: ViewStyle = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
    paddingLeft: edges.includes('left') ? insets.left : 0,
    paddingRight: edges.includes('right') ? insets.right : 0,
  };

  const header = showBack ? (
    <View
      className="pb-3 pt-3"
      style={{ paddingHorizontal: CONTENT_HORIZONTAL_PADDING }}>
      <Pressable onPress={() => router.back()} hitSlop={8} className="-ml-1 self-start">
        <Ionicons name="chevron-back" size={24} color="#ffffff" />
      </Pressable>
    </View>
  ) : null;

  return (
    <View className="flex-1 bg-bg" style={[insetStyle, style]}>
      {header}
      {scrollable ? (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={showBack ? HEADER_CONTENT_HEIGHT : 0}>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
              paddingBottom: 24,
              flexGrow: 1,
            }}
            keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View className="flex-1" style={{ paddingHorizontal: CONTENT_HORIZONTAL_PADDING }}>
          {children}
        </View>
      )}
    </View>
  );
}
