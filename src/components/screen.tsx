import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export const CONTENT_HORIZONTAL_PADDING = 16;

const HEADER_CONTENT_HEIGHT = 56;

type Edge = 'top' | 'bottom' | 'left' | 'right';

const ALL_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

type ScreenProps = {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
  scrollable?: boolean;
  headerRight?: ReactNode;
  edges?: Edge[];
  style?: ViewStyle;
};

export function Screen({
  children,
  title,
  showBack = false,
  scrollable = false,
  headerRight,
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

  const hasHeader = Boolean(title || showBack || headerRight);

  const header = hasHeader ? (
    <View
      className="flex-row items-center justify-between pb-3 pt-3"
      style={{ paddingHorizontal: CONTENT_HORIZONTAL_PADDING }}>
      <View className="flex-1 flex-row items-center">
        {showBack && (
          <Pressable onPress={() => router.back()} hitSlop={8} className="-ml-1 mr-2">
            <Ionicons name="chevron-back" size={24} color="#ffffff" />
          </Pressable>
        )}
        {title && (
          <Text className="text-2xl font-bold text-white" numberOfLines={1}>
            {title}
          </Text>
        )}
      </View>
      {headerRight}
    </View>
  ) : null;

  return (
    <View className="flex-1 bg-neutral-950" style={[insetStyle, style]}>
      {header}
      {scrollable ? (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={hasHeader ? HEADER_CONTENT_HEIGHT : 0}>
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
