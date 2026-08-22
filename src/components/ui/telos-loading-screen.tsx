import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, fonts } from '@/theme/tokens';

// Ícones já usados em outras partes do app, representando o que o Telos
// cobre de verdade — só decoração/personalidade da tela de loading, sem
// nenhuma lógica ligada a eles.
const SPORT_ICONS = [
  { name: 'barbell-outline', label: 'Musculação' },
  { name: 'flame-outline', label: 'Aquecimento' },
  { name: 'trophy-outline', label: 'Recordes' },
  { name: 'stats-chart-outline', label: 'Evolução' },
  { name: 'calendar-outline', label: 'Planejamento' },
  { name: 'trending-up-outline', label: 'Progressão' },
  { name: 'timer-outline', label: 'Descanso' },
  { name: 'heart-outline', label: 'Cardio' },
] as const;

const ICON_SWAP_INTERVAL_MS = 1200;
const ICON_FADE_DURATION_MS = 300;
const PROGRESS_DURATION_MS = 3000;

/**
 * Tela de loading em RN (não a splash nativa, que continua em app.json) —
 * mostrada por _layout.tsx enquanto migrações/seed/fontes carregam, no
 * lugar do ActivityIndicator genérico que havia antes ali. Toda a animação
 * usa só `Animated`/`Easing` do core do RN (reanimated é só dependência
 * transitiva de expo-router/gesture-handler neste projeto, nunca importado
 * direto pelo app) — mesmo critério já usado no overlay de descanso e no de
 * celebração de PR em hoje.tsx.
 *
 * `appReady` não estava na lista de props do pedido original (só `onReady`
 * aparecia) — mas sem um jeito de RECEBER de fora quando migrações/fontes
 * terminam, a garantia "só some quando a barra completar E o app estiver
 * pronto" não teria como funcionar (o componente não tem nenhuma visibilidade
 * própria sobre isso). Adicionei como prop opcional (default `false`), sem
 * a qual o componente ainda roda sozinho (barra enche, ícones trocam) — só
 * nunca chama `onReady`, o que é um comportamento razoável na ausência do
 * sinal externo.
 */
export function TelosLoadingScreen({
  appReady = false,
  onReady,
}: {
  appReady?: boolean;
  onReady?: () => void;
}) {
  // Troca de ícone: fade out (300ms) -> troca -> fade in (300ms), a cada
  // 1.2s. Opacity é compatível com useNativeDriver, ao contrário da largura
  // da barra de progresso abaixo (ver CUIDADO no pedido original).
  const [iconIndex, setIconIndex] = useState(0);
  const iconOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(iconOpacity, {
        toValue: 0,
        duration: ICON_FADE_DURATION_MS,
        useNativeDriver: true,
      }).start(() => {
        setIconIndex((i) => (i + 1) % SPORT_ICONS.length);
        Animated.timing(iconOpacity, {
          toValue: 1,
          duration: ICON_FADE_DURATION_MS,
          useNativeDriver: true,
        }).start();
      });
    }, ICON_SWAP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [iconOpacity]);

  // Barra de progresso: enche 0->100% em ~3s, sempre — puramente visual,
  // independente do carregamento real (esse é o papel do `appReady` acima).
  // `useNativeDriver: false` porque `width` não é uma propriedade animável
  // pelo native driver; um listener espelha o valor num state (`percent`)
  // só pra exibir o número, já que não dá pra ler um Animated.Value direto
  // dentro do render.
  const progress = useRef(new Animated.Value(0)).current;
  const [percent, setPercent] = useState(0);
  const [barraCompleta, setBarraCompleta] = useState(false);

  useEffect(() => {
    const listenerId = progress.addListener(({ value }) => setPercent(Math.round(value * 100)));
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: PROGRESS_DURATION_MS,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) setBarraCompleta(true);
    });
    return () => {
      progress.removeListener(listenerId);
      animation.stop();
    };
  }, [progress]);

  // Garantia central: só chama onReady quando os DOIS forem true — mesmo
  // que appReady já tenha virado true antes, espera a barra terminar (o
  // mínimo de ~3s de tela, pra nunca "piscar" nem num boot muito rápido);
  // mesmo que a barra já tenha terminado antes, espera appReady virar true.
  useEffect(() => {
    if (barraCompleta && appReady) onReady?.();
  }, [barraCompleta, appReady, onReady]);

  const icon = SPORT_ICONS[iconIndex];
  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 80,
      }}>
      <View style={{ alignItems: 'center' }}>
        {/* Caminho relativo: este arquivo vive em src/components/ui/, 3
            níveis acima da raiz do repo — mesmo cálculo já confirmado pra
            o card de compartilhamento (src/components/share/), mesma
            profundidade. */}
        <Image
          source={require('../../../assets/images/adaptive-icon.png')}
          style={{ width: 96, height: 96 }}
          resizeMode="contain"
        />
        <Text
          style={{
            marginTop: 16,
            fontFamily: fonts.display,
            fontSize: 48,
            color: colors.accent,
            letterSpacing: 6,
            textTransform: 'uppercase',
          }}>
          TELOS
        </Text>
        <Text
          style={{
            marginTop: 4,
            fontFamily: fonts.label,
            fontSize: 13,
            color: colors.muted,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}>
          Treine com propósito
        </Text>
      </View>

      <Animated.View style={{ alignItems: 'center', opacity: iconOpacity }}>
        <Ionicons name={icon.name} size={52} color={colors.text} />
        <Text
          style={{
            marginTop: 8,
            fontFamily: fonts.label,
            fontSize: 11,
            color: colors.muted,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}>
          {icon.label}
        </Text>
      </Animated.View>

      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            width: 200,
            height: 3,
            backgroundColor: colors.border,
            borderRadius: 2,
            overflow: 'hidden',
          }}>
          <Animated.View
            style={{ width: barWidth, height: '100%', backgroundColor: colors.accent, borderRadius: 2 }}
          />
        </View>
        <Text
          style={{
            marginTop: 6,
            width: 200,
            fontFamily: fonts.label,
            fontSize: 11,
            color: colors.muted,
            textAlign: 'right',
          }}>
          {`${percent}%`}
        </Text>
      </View>
    </View>
  );
}
