import { forwardRef, useEffect, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import { formatNumberPtBr } from '@/lib/format';
import { colors } from '@/theme/tokens';

import type { WorkoutShareOptions } from './types';
import { resolvePrParaMostrar, type WorkoutShareMetrics } from './workout-share-card';

// Resolução final do PNG (mesmo raciocínio de SHARE_CARD_WIDTH/HEIGHT em
// workout-share-card.tsx) — passada como width/height de resize pro
// captureRef. 4:5, igual à proporção do layout abaixo (360:450 === 1080:1350).
export const SHARE_CARD_PHOTO_WIDTH = 1080;
export const SHARE_CARD_PHOTO_HEIGHT = 1350;

// Tamanho de layout em pontos (não pixels).
export const PHOTO_CARD_WIDTH = 360;
export const PHOTO_CARD_HEIGHT = 450;

const CORNER_PADDING = 20;

// Foreground do adaptive icon — ver comentário completo em
// workout-share-card.tsx (mesmo asset, mesmo tamanho, mesmo motivo: o
// símbolo ocupa só ~45% do canvas do PNG, então 44pt compensa a margem de
// segurança do formato pra ficar visualmente equivalente a um ícone comum
// de ~20pt ao lado do "TELOS").
const TELOS_ICON_SIZE = 44;

// Sombra escura em todo texto sobreposto — é o que garante legibilidade do
// texto branco em cima de QUALQUER foto (clara ou escura), já que este
// estilo não tem nenhum fundo opaco atrás dos dados (só a camada 2 abaixo,
// um escurecimento sutil e uniforme da foto inteira).
const TEXT_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.8,
  shadowRadius: 3,
} as const;

/**
 * Terceiro estilo do card de compartilhamento (Etapa C) — a foto do usuário
 * como fundo (câmera ou galeria, escolhida na tela de personalização) com os
 * dados do treino sobrepostos nos 4 cantos, sem nenhum fundo opaco atrás
 * deles (só sombra nos textos). Mesma forma (forwardRef<View>, props
 * metrics/options/style/onLayout) que os outros 2 estilos, pro captureRef
 * funcionar do mesmo jeito em hoje.tsx.
 *
 * Timing da captura (2 gates combinados num `onLayout` só, sem prop nova):
 * sem foto (`options.fotoUri === null`) não há nada assíncrono pra esperar,
 * então `imageLoaded` já nasce `true`; COM foto, só vira `true` no `onLoad`
 * real do <Image>. O `onLayout` recebido por prop (o que hoje.tsx usa pra
 * setar `cardPhotoReady`) só é chamado depois que os DOIS gates — o layout
 * nativo já assentou E a imagem já decodificou — estiverem satisfeitos,
 * guardando o evento de layout real (RN 0.86/Fabric não "esvazia" o objeto
 * do evento depois do handler retornar, então é seguro guardá-lo em estado
 * e reemitir mais tarde). Escolhi combinar os 2 gates internamente em vez de
 * expor um `onImageLoaded` novo — mantém a MESMA assinatura de props dos
 * outros 2 cards; hoje.tsx não precisa saber que este tem uma espera a mais.
 */
export const WorkoutShareCardPhoto = forwardRef<
  View,
  {
    metrics: WorkoutShareMetrics;
    options: WorkoutShareOptions;
    style?: StyleProp<ViewStyle>;
    onLayout?: (event: LayoutChangeEvent) => void;
  }
>(function WorkoutShareCardPhoto({ metrics, options, style, onLayout }, ref) {
  const { fotoUri } = options;
  const prParaMostrar = resolvePrParaMostrar(metrics, options);

  const [imageLoaded, setImageLoaded] = useState(fotoUri == null);
  const [layoutEvent, setLayoutEvent] = useState<LayoutChangeEvent | null>(null);

  // Foto trocada (ou removida) depois do mount: reseta o gate — uma foto
  // NOVA precisa do seu próprio onLoad antes de ser considerada pronta pra
  // captura; `null` (sem foto, fallback sólido) não tem nada pra esperar.
  useEffect(() => {
    setImageLoaded(fotoUri == null);
  }, [fotoUri]);

  useEffect(() => {
    if (imageLoaded && layoutEvent) onLayout?.(layoutEvent);
  }, [imageLoaded, layoutEvent, onLayout]);

  const showWeekMarker = metrics.diasSemana.some(Boolean);

  return (
    <View
      ref={ref}
      onLayout={setLayoutEvent}
      // collapsable={false}: mesmo cuidado dos outros 2 cards — sem isso o
      // Android pode otimizar essa View pra fora da árvore nativa antes da
      // captura, já que ela nunca aparece de fato na tela.
      collapsable={false}
      style={[{ width: PHOTO_CARD_WIDTH, height: PHOTO_CARD_HEIGHT, overflow: 'hidden' }, style]}>
      {/* Camada 1: fundo — a foto do usuário, ou (sem foto) um fallback
          sólido. O card off-screen real em hoje.tsx só monta este
          componente quando `fotoUri !== null` (ver Passo 4), então o
          fallback só aparece de fato na prévia do modal, antes de o usuário
          escolher uma foto. */}
      {fotoUri ? (
        <Image
          source={{ uri: fotoUri }}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          contentFit="cover"
          onLoad={() => setImageLoaded(true)}
        />
      ) : (
        <View
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: colors.bg }}
        />
      )}

      {/* Camada 2: escurecimento geral — mais forte que o 0.35 original
          (subiu pra 0.50) porque agora é a base do efeito dark dramático, não
          só a garantia mínima de legibilidade de antes (que continua valendo,
          só que como consequência, não mais o único motivo da camada). */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.50)' }]} />

      {/* Camada 3: vinheta cinematográfica topo/base — escurece as bordas
          superior e inferior, mantendo o centro (onde a cena principal da
          foto costuma estar) mais claro. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.70)', 'transparent', 'transparent', 'rgba(0,0,0,0.70)']}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Camada 4: vinheta lateral — mesmo raciocínio da Camada 3, na
          horizontal, reforçando as bordas esquerda/direita. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.50)', 'transparent', 'rgba(0,0,0,0.50)']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Camada 5: tonalidade fria/dramática — um overlay quase-preto
          azulado com `mixBlendMode: 'overlay'` (RN 0.86/Fabric), pra dar um
          leve tom "cinematográfico" em vez de só escurecer. Suporte de
          `mixBlendMode` ainda não confirmado em device nesta versão — se
          causar artefato visual ou a camada sumir, remover só esta (as
          camadas 2-4 já sustentam o efeito dark sozinhas). */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(20,20,35,0.25)', mixBlendMode: 'overlay' },
        ]}
      />

      {/* Camada 6: dados sobrepostos, 4 cantos — sem fundo opaco, só sombra
          nos textos (TEXT_SHADOW) pra legibilidade. */}
      <View style={{ position: 'absolute', top: CORNER_PADDING, left: CORNER_PADDING, maxWidth: PHOTO_CARD_WIDTH - CORNER_PADDING * 2 - 56 }}>
        <Text
          numberOfLines={2}
          adjustsFontSizeToFit
          className="font-display uppercase text-white"
          style={[{ fontSize: 22 }, TEXT_SHADOW]}>
          {metrics.dayLabel}
        </Text>
        <Text className="mt-1 font-label text-white" style={[{ fontSize: 12, opacity: 0.8 }, TEXT_SHADOW]}>
          {metrics.dateLabel}
        </Text>
      </View>

      {showWeekMarker && (
        <View
          style={{ position: 'absolute', top: CORNER_PADDING, right: CORNER_PADDING, flexDirection: 'row', gap: 3 }}>
          {metrics.diasSemana.map((trained, index) => (
            <View
              key={index}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: trained ? '#fff' : 'transparent',
                borderWidth: trained ? 0 : 1,
                borderColor: 'rgba(255,255,255,0.6)',
              }}
            />
          ))}
        </View>
      )}

      <View style={{ position: 'absolute', bottom: CORNER_PADDING, left: CORNER_PADDING, maxWidth: PHOTO_CARD_WIDTH * 0.62 }}>
        <Text className="font-display text-white" style={[{ fontSize: 28 }, TEXT_SHADOW]}>
          {formatNumberPtBr(metrics.volumeKg)} KG
        </Text>
        {metrics.durationLabel != null && (
          <Text className="mt-0.5 font-label text-white" style={[{ fontSize: 13, opacity: 0.9 }, TEXT_SHADOW]}>
            {metrics.durationLabel}
          </Text>
        )}
        {prParaMostrar && (
          <View className="mt-1.5 flex-row items-center gap-1.5">
            <Ionicons name="trophy" size={12} color={colors.accent} />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              className="font-label text-white"
              style={[{ fontSize: 12, flexShrink: 1 }, TEXT_SHADOW]}>
              {`${prParaMostrar.exerciseNome} · ${prParaMostrar.cargaNova}kg`}
            </Text>
          </View>
        )}
      </View>

      {/* Ícone do app ao lado de "TELOS" — sombra fica nos elementos de
          texto (TEXT_SHADOW), como no resto do card; o ícone em si não
          precisa de sombra própria pra ficar legível sobre a foto (é opaco,
          diferente do texto). Foreground do adaptive icon (transparente ao
          redor, sem borderRadius — ver TELOS_ICON_SIZE acima), não mais o
          assets/images/icon.png (ícone completo, com fundo quadrado opaco,
          que exigia o borderRadius:8 de antes pra suavizar o quadrado). */}
      <View
        style={{
          position: 'absolute',
          bottom: CORNER_PADDING,
          right: CORNER_PADDING,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}>
        <Image
          source={require('../../../assets/images/adaptive-icon.png')}
          style={{ width: TELOS_ICON_SIZE, height: TELOS_ICON_SIZE }}
        />
        <Text className="font-display text-accent" style={[{ fontSize: 14, letterSpacing: 4 }, TEXT_SHADOW]}>
          TELOS
        </Text>
      </View>
    </View>
  );
});
