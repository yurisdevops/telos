import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

export const CONTENT_HORIZONTAL_PADDING = 16;

const HEADER_CONTENT_HEIGHT = 56;

type Edge = 'top' | 'bottom' | 'left' | 'right';

const ALL_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

// Expõe o ScrollView da Screen atual (quando `scrollable`) pra qualquer
// `Input` descendente conseguir rolar até si mesmo ao ganhar foco, sem
// precisar de prop-drilling manual em cada tela — ver `Input` (ui/input.tsx).
// `null` fora de uma Screen scrollable (Input simplesmente não rola nada).
const ScreenScrollContext = createContext<RefObject<ScrollView | null> | null>(null);

export function useScreenScrollRef(): RefObject<ScrollView | null> | null {
  return useContext(ScreenScrollContext);
}

type ScreenProps = {
  children: ReactNode;
  showBack?: boolean;
  scrollable?: boolean;
  edges?: Edge[];
  style?: ViewStyle;
  // Só tem efeito com `scrollable` — deixa quem usa a tela controlar o
  // scroll de fora (ex: rolar pro topo depois de um evento específico).
  scrollRef?: RefObject<ScrollView | null>;
};

export function Screen({
  children,
  showBack = false,
  scrollable = false,
  edges = ALL_EDGES,
  style,
  scrollRef,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Sempre existe um ref real pro contexto poder oferecer, mesmo quando quem
  // usa a Screen não passou `scrollRef` — `effectiveScrollRef` é o que vira
  // tanto o `ref` do ScrollView quanto o valor do Context, então os dois
  // (rolagem manual de fora E auto-scroll de Input em foco) sempre apontam
  // pro mesmo ScrollView.
  const internalScrollRef = useRef<ScrollView>(null);
  const effectiveScrollRef = scrollRef ?? internalScrollRef;

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
        <ScreenScrollContext.Provider value={effectiveScrollRef}>
          <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={showBack ? HEADER_CONTENT_HEIGHT : 0}>
            <ScrollView
              ref={effectiveScrollRef}
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
        </ScreenScrollContext.Provider>
      ) : (
        <View className="flex-1" style={{ paddingHorizontal: CONTENT_HORIZONTAL_PADDING }}>
          {children}
        </View>
      )}
    </View>
  );
}
