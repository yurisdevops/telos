import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { SessionPr } from '@/lib/personal-records';
import { colors } from '@/theme/tokens';

/**
 * Tela comemorativa cheia ao concluir um treino com PR(s) — mesmo molde do
 * RestTimerOverlay concluído (hoje.tsx): Modal full-screen, fundo accent
 * sólido, "respiração" de opacidade lenta em vez de qualquer flash, pelo
 * mesmo cuidado de fotossensibilidade. Sem useKeepAwake — é momentâneo, o
 * usuário fecha e segue, não precisa manter a tela acesa sozinha.
 *
 * Quem chama controla a montagem (mesmo padrão do RestTimerOverlay: não
 * recebe `visible`, é montado/desmontado condicionalmente pelo pai) — a
 * animação de respiração começa no mount e para no unmount, sem estado
 * "contando" intermediário como o overlay de descanso tem.
 */
export function PrCelebrationOverlay({ prs, onDismiss }: { prs: SessionPr[]; onDismiss: () => void }) {
  // Mesma técnica do RestTimerOverlay: camada preta semi-transparente por
  // cima do accent, opacidade 0→~0,2, ~1500ms por meia-fase (~3s por ciclo
  // completo), Easing.inOut — nunca um flash rápido.
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      breathe.setValue(0);
    };
  }, [breathe]);

  const breatheOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0, 0.2] });

  const title = prs.length === 1 ? 'Novo recorde!' : `${prs.length} novos recordes!`;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: colors.accent }}>
        {/* pointerEvents="none": só uma camada visual por cima do fundo, não
            pode interceptar o toque na lista/botão abaixo. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#000000',
            opacity: breatheOpacity,
          }}
        />

        <View className="my-4 items-center justify-center">
          <Ionicons name="trophy" size={96} color="#FFFFFF" />
          <Text
            className="mt-4 text-center font-display text-5xl uppercase text-white"
            numberOfLines={2}
            adjustsFontSizeToFit
          >
            {title}
          </Text>
        </View>

        <ScrollView
          className="mb-6 max-h-64 w-full"
          contentContainerStyle={{ gap: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {prs.map((pr) => (
            <View key={pr.exerciseId} className="rounded-lg border border-white/40 bg-white/10 px-4 py-3">
              <Text className="font-card-title text-base text-white" numberOfLines={1}>
                {pr.exerciseNome}
              </Text>
              <Text className="mt-1 font-display text-2xl text-white">
                {pr.cargaAnterior != null ? `${pr.cargaAnterior}kg → ` : ''}
                {pr.cargaNova}
                <Text className="font-label text-sm uppercase"> kg</Text>
              </Text>
            </View>
          ))}
        </ScrollView>

        <Pressable onPress={onDismiss} className="w-full max-w-xs rounded border border-white py-4">
          <Text className="text-center font-label uppercase text-white">Continuar</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
