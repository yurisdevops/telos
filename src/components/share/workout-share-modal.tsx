import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CONTENT_HORIZONTAL_PADDING } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { relativeGain, type SessionPr } from '@/lib/personal-records';
import { colors } from '@/theme/tokens';

import { DEFAULT_SHARE_OPTIONS, type WorkoutShareOptions } from './types';
import { CARD_HEIGHT, CARD_WIDTH, WorkoutShareCard, type WorkoutShareMetrics } from './workout-share-card';

// Tamanho de layout (não pixels) da prévia — escalada por `transform`, não
// redimensionada, pra manter as fontes/paddings do card real proporcionais
// entre si (redimensionar só a `style.width/height` do card espremeria o
// conteúdo sem escalar as fontes, que são valores fixos em pt).
const PREVIEW_SCALE = 0.35;

type BooleanOptionKey = Exclude<keyof WorkoutShareOptions, 'prEscolhido'>;

/**
 * Tela de personalização do compartilhamento — abre ao tocar "Compartilhar
 * treino" em hoje.tsx, ANTES de gerar a imagem. Mostra uma prévia ao vivo
 * (uma instância PRÓPRIA do WorkoutShareCard, só visual, escalada) que
 * reflete as opções conforme o usuário mexe nos controles; a imagem de
 * verdade continua sendo gerada a partir do card off-screen (opacity:0) que
 * já existe em hoje.tsx — este modal só decide QUAIS opções esse card
 * off-screen deve receber antes de ser capturado (ver onShare).
 */
export function WorkoutShareModal({
  visible,
  onClose,
  metrics,
  sessionPrs,
  onShare,
}: {
  visible: boolean;
  onClose: () => void;
  metrics: WorkoutShareMetrics;
  sessionPrs: SessionPr[];
  onShare: (options: WorkoutShareOptions) => void;
}) {
  const insets = useSafeAreaInsets();

  // Reseta pro padrão sempre que o modal ABRE — evita herdar um
  // `prEscolhido` de uma sessão/abertura anterior que não faz mais sentido
  // (índice de uma lista de PRs diferente).
  const [options, setOptions] = useState<WorkoutShareOptions>(DEFAULT_SHARE_OPTIONS);
  useEffect(() => {
    if (visible) setOptions(DEFAULT_SHARE_OPTIONS);
  }, [visible]);

  // Índice do PR automático (o que `metrics.prDestaque` representa) dentro
  // de `sessionPrs` — só pra pré-marcar visualmente a linha certa na lista
  // de escolha enquanto `options.prEscolhido` ainda é `null`. Casado por
  // nome+carga (não por índice/id) porque `prDestaque` é o tipo reduzido
  // `{exerciseNome, cargaNova}`, sem `exerciseId`.
  const autoIndex = useMemo(() => {
    if (!metrics.prDestaque) return -1;
    return sessionPrs.findIndex(
      (pr) => pr.exerciseNome === metrics.prDestaque!.exerciseNome && pr.cargaNova === metrics.prDestaque!.cargaNova
    );
  }, [sessionPrs, metrics.prDestaque]);
  const selectedPrIndex = options.prEscolhido ?? (autoIndex >= 0 ? autoIndex : null);

  const toggle = (key: BooleanOptionKey) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <View
        className="flex-1 bg-bg"
        style={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}>
        <View
          className="flex-row items-center justify-between border-b border-border pb-3 pt-3"
          style={{ paddingHorizontal: CONTENT_HORIZONTAL_PADDING }}>
          <Text className="font-display text-xl uppercase text-text">Compartilhar treino</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: CONTENT_HORIZONTAL_PADDING, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}>
          {/* Prévia ao vivo — instância separada da que fica off-screen em
              hoje.tsx, só pra visualização; nunca é o alvo do captureRef. */}
          <View
            className="mb-6 self-center overflow-hidden rounded border border-border"
            style={{ width: CARD_WIDTH * PREVIEW_SCALE, height: CARD_HEIGHT * PREVIEW_SCALE }}>
            <WorkoutShareCard
              metrics={metrics}
              options={options}
              style={{ transform: [{ scale: PREVIEW_SCALE }], transformOrigin: '0 0' }}
            />
          </View>

          {sessionPrs.length > 0 && (
            <View className="mb-6">
              <Text className="mb-2 font-label text-xs uppercase tracking-wider text-muted">Recorde</Text>
              <OptionToggle label="Mostrar recorde" active={options.mostrarPr} onPress={() => toggle('mostrarPr')} />

              {options.mostrarPr && sessionPrs.length === 1 && (
                <View className="mt-3 rounded border border-border bg-surface px-3 py-2.5">
                  <PrLine pr={sessionPrs[0]} />
                </View>
              )}

              {options.mostrarPr && sessionPrs.length > 1 && (
                <View className="mt-3 gap-2">
                  {sessionPrs.map((pr, index) => (
                    <Pressable
                      key={pr.exerciseId}
                      onPress={() => setOptions((prev) => ({ ...prev, prEscolhido: index }))}
                      className={`flex-row items-center gap-3 rounded border px-3 py-2.5 ${
                        index === selectedPrIndex ? 'border-accent bg-accent/10' : 'border-border bg-surface'
                      }`}>
                      <Ionicons
                        name={index === selectedPrIndex ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={index === selectedPrIndex ? colors.accent : colors.muted}
                      />
                      <View className="flex-1">
                        <PrLine pr={pr} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          <View className="mb-8">
            <Text className="mb-2 font-label text-xs uppercase tracking-wider text-muted">Métricas</Text>
            <View className="flex-row flex-wrap gap-2">
              <OptionToggle label="Duração" active={options.mostrarDuracao} onPress={() => toggle('mostrarDuracao')} />
              <OptionToggle label="Volume (kg)" active={options.mostrarVolume} onPress={() => toggle('mostrarVolume')} />
              <OptionToggle label="Séries" active={options.mostrarSeries} onPress={() => toggle('mostrarSeries')} />
              <OptionToggle
                label="Exercícios"
                active={options.mostrarExercicios}
                onPress={() => toggle('mostrarExercicios')}
              />
            </View>
          </View>

          <Button onPress={() => onShare(options)}>
            <View className="flex-row items-center gap-2">
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text className="font-label text-sm uppercase tracking-wide text-white">Compartilhar</Text>
            </View>
          </Button>
        </ScrollView>
      </View>
    </Modal>
  );
}

function PrLine({ pr }: { pr: SessionPr }) {
  const gainLabel = pr.cargaAnterior == null ? '1ª vez' : `+${Math.round(relativeGain(pr) * 100)}%`;
  return (
    <View className="flex-row items-center justify-between">
      <Text numberOfLines={1} className="flex-1 font-body-medium text-sm text-text">
        {pr.exerciseNome} · {pr.cargaNova}kg
      </Text>
      <Text className="ml-2 font-label text-xs uppercase text-accent">{gainLabel}</Text>
    </View>
  );
}

function OptionToggle({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-2 rounded border px-3 py-2 ${
        active ? 'border-accent bg-accent' : 'border-border bg-transparent'
      }`}>
      <Ionicons
        name={active ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={active ? '#fff' : colors.muted}
      />
      <Text className={`font-label text-xs uppercase tracking-wide ${active ? 'text-white' : 'text-muted'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
