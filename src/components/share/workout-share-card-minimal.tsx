import { forwardRef } from 'react';
import { Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';

import { formatNumberPtBr } from '@/lib/format';
import { colors } from '@/theme/tokens';

import type { WorkoutShareOptions } from './types';
import { resolvePrParaMostrar, type WorkoutShareMetrics } from './workout-share-card';

// Resolução final do PNG (mesmo raciocínio de SHARE_CARD_WIDTH/HEIGHT em
// workout-share-card.tsx) — passada como width/height de resize pro
// captureRef. Quadrado: mesma proporção 360:360 === 1080:1080 do layout
// abaixo, então o resize não distorce.
export const SHARE_CARD_MINIMAL_SIZE = 1080;

// Tamanho de layout em pontos (não pixels) — quadrado, mais compacto que o
// card completo (360×560) de propósito: sem grade de StatCells nem
// marcador de semana, o minimalista não precisa da mesma altura.
export const MINIMAL_CARD_SIZE = 360;

const BACKGROUND = '#1A1A1A';
const ACCENT_BAR_WIDTH = 6;
const CONTENT_PADDING_LEFT = 28;

// Foreground do adaptive icon — ver comentário completo em
// workout-share-card.tsx (mesmo asset, mesmo tamanho, mesmo motivo: o
// símbolo ocupa só ~45% do canvas do PNG, então 44pt compensa a margem de
// segurança do formato pra ficar visualmente equivalente a um ícone comum
// de ~20pt ao lado do "TELOS").
const TELOS_ICON_SIZE = 44;

/**
 * Segundo estilo do card de compartilhamento (Etapa B) — "só essência":
 * barra accent lateral, nome + data, volume em destaque enorme, duração,
 * grupos musculares e um recorde discreto (sem a faixa destacada do card
 * completo, sem grade de StatCells, sem marcador de semana). Mesma forma
 * (forwardRef<View>, props metrics/options/style/onLayout) que
 * WorkoutShareCard, pro captureRef funcionar do mesmo jeito em hoje.tsx —
 * só o layout visual muda.
 *
 * Diferente do card completo, este NÃO segue mostrarDuracao/mostrarVolume/
 * mostrarSeries/mostrarExercicios (esses toggles existem pra ligar/desligar
 * células de uma grade que este estilo simplesmente não tem — volume e
 * duração são o miolo fixo do minimalista). Só `options.mostrarPr` +
 * `prEscolhido` são compartilhados entre os dois estilos, via
 * `resolvePrParaMostrar` (workout-share-card.tsx).
 */
export const WorkoutShareCardMinimal = forwardRef<
  View,
  {
    metrics: WorkoutShareMetrics;
    options: WorkoutShareOptions;
    style?: StyleProp<ViewStyle>;
    onLayout?: (event: LayoutChangeEvent) => void;
  }
>(function WorkoutShareCardMinimal({ metrics, options, style, onLayout }, ref) {
  const prParaMostrar = resolvePrParaMostrar(metrics, options);

  return (
    <View
      ref={ref}
      onLayout={onLayout}
      // collapsable={false}: mesmo cuidado do card completo — sem isso o
      // Android pode otimizar essa View pra fora da árvore nativa antes da
      // captura, já que ela nunca aparece de fato na tela.
      collapsable={false}
      style={[{ width: MINIMAL_CARD_SIZE, height: MINIMAL_CARD_SIZE, backgroundColor: BACKGROUND }, style]}>
      {/* Barra accent lateral — absoluta, pra não disputar espaço no fluxo
          normal (o conteúdo abaixo já reserva o respiro certo via
          CONTENT_PADDING_LEFT, não depende do tamanho real desta barra). */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: ACCENT_BAR_WIDTH,
          height: '100%',
          backgroundColor: colors.accent,
        }}
      />

      {/* Único filho no fluxo normal (a barra é absoluta) — herda a altura
          DEFINIDA do card (MINIMAL_CARD_SIZE) via flex:1, o que garante que
          o miolo abaixo (também flex:1) tenha um eixo principal definido
          pra crescer, sem risco do colapso de altura já visto na grade de
          StatCells do card completo (ver comentário em workout-share-card.tsx). */}
      <View
        style={{
          flex: 1,
          justifyContent: 'space-between',
          paddingLeft: CONTENT_PADDING_LEFT,
          paddingRight: 24,
          paddingVertical: 28,
        }}>
        {/* Topo: nome do treino + data */}
        <View>
          <Text
            numberOfLines={2}
            adjustsFontSizeToFit
            className="font-display uppercase text-white"
            style={{ fontSize: 28 }}>
            {metrics.dayLabel}
          </Text>
          <Text className="mt-1 font-label uppercase text-muted" style={{ fontSize: 11, letterSpacing: 1 }}>
            {metrics.dateLabel}
          </Text>
        </View>

        {/* Miolo: volume em destaque + duração — as 2 métricas fixas deste
            estilo (ver comentário acima sobre não seguir os 4 toggles do
            card completo). */}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text className="font-display text-white" style={{ fontSize: 72 }}>
            {formatNumberPtBr(metrics.volumeKg)}
          </Text>
          <Text className="font-label uppercase text-muted" style={{ fontSize: 13, letterSpacing: 2 }}>
            KG
          </Text>
          {metrics.durationLabel != null && (
            <Text className="mt-4 font-display text-accent" style={{ fontSize: 28 }}>
              {metrics.durationLabel}
            </Text>
          )}
        </View>

        {/* Grupos musculares */}
        {metrics.grupos.length > 0 && (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            className="font-label uppercase text-muted"
            style={{ fontSize: 12, letterSpacing: 1 }}>
            {metrics.grupos.join(' · ')}
          </Text>
        )}

        {/* Recorde — sutil, uma linha só, sem faixa destacada (diferente do
            card completo). */}
        {prParaMostrar && (
          <View className="mt-2 flex-row items-center gap-2">
            <Ionicons name="trophy" size={14} color="#fff" />
            <Text numberOfLines={1} adjustsFontSizeToFit className="font-label text-white" style={{ fontSize: 12 }}>
              {`${prParaMostrar.exerciseNome} · ${prParaMostrar.cargaNova}kg`}
            </Text>
          </View>
        )}

        {/* Rodapé: assinatura, alinhada à direita (diferente do card
            completo, que a centraliza) — `justifyContent:'flex-end'` no lugar
            do `textAlign:'right'` de antes, agora que é uma linha com 2
            elementos (ícone + texto) em vez de um Text sozinho. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <Image
            source={require('../../../assets/images/adaptive-icon.png')}
            style={{ width: TELOS_ICON_SIZE, height: TELOS_ICON_SIZE }}
          />
          <Text className="font-display text-accent" style={{ fontSize: 20, letterSpacing: 4 }}>
            TELOS
          </Text>
        </View>
      </View>
    </View>
  );
});
