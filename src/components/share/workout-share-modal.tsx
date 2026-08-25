import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CONTENT_HORIZONTAL_PADDING } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { relativeGain, type SessionPr } from '@/lib/personal-records';
import { colors } from '@/theme/tokens';

import { DEFAULT_SHARE_OPTIONS, type WorkoutShareOptions, type WorkoutShareStyle } from './types';
import { MINIMAL_CARD_SIZE, WorkoutShareCardMinimal } from './workout-share-card-minimal';
import { PHOTO_CARD_HEIGHT, PHOTO_CARD_WIDTH, WorkoutShareCardPhoto } from './workout-share-card-photo';
import { CARD_HEIGHT, CARD_WIDTH, WorkoutShareCard, type WorkoutShareMetrics } from './workout-share-card';

// Tamanho de layout (não pixels) da prévia — escalada por `transform`, não
// redimensionada, pra manter as fontes/paddings do card real proporcionais
// entre si (redimensionar só a `style.width/height` do card espremeria o
// conteúdo sem escalar as fontes, que são valores fixos em pt). Mesmo scale
// pros 2 estilos (360×360 e 360×560 — a base 360 é igual nos dois) — dá
// ~126pt de largura pra ambos, só a altura muda com o formato de cada um
// (126×196 no completo, 126×126 no minimalista, quadrado).
const PREVIEW_SCALE = 0.35;

type BooleanOptionKey = Exclude<keyof WorkoutShareOptions, 'prEscolhido' | 'estilo'>;

const STYLE_OPTIONS: { value: WorkoutShareStyle; label: string; disabled?: boolean }[] = [
  { value: 'completo', label: 'Completo' },
  { value: 'minimalista', label: 'Minimalista' },
  { value: 'foto', label: 'Foto' },
];

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

  // Fluxo de escolher/tirar foto (estilo 'foto') — Alert.alert com as 2
  // fontes + cancelar, cada uma pedindo sua própria permissão só na hora
  // (não no mount do modal). Permissão negada avisa e não mexe em nada;
  // cancelamento do picker (`result.canceled`) é no-op silencioso, mesmo
  // padrão já usado no resto do app (ver pickAndSaveProfilePhoto).
  const pickPhotoFrom = useCallback(async (source: 'camera' | 'library') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permissão necessária',
        source === 'camera'
          ? 'Permita o acesso à câmera nas configurações do aparelho pra tirar uma foto.'
          : 'Permita o acesso à galeria nas configurações do aparelho pra escolher uma foto.'
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled) return;

    const picked = result.assets[0];
    if (!picked) return;
    setOptions((prev) => ({ ...prev, fotoUri: picked.uri }));
  }, []);

  const handlePickPhoto = useCallback(() => {
    Alert.alert('Escolher foto', undefined, [
      { text: 'Câmera', onPress: () => pickPhotoFrom('camera') },
      { text: 'Galeria', onPress: () => pickPhotoFrom('library') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }, [pickPhotoFrom]);

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
          <View className="mb-6">
            <Text className="mb-2 font-label text-xs uppercase tracking-wider text-muted">Estilo</Text>
            <View className="flex-row flex-wrap gap-2">
              {STYLE_OPTIONS.map((opt) => {
                const selected = options.estilo === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    disabled={opt.disabled}
                    onPress={() => setOptions((prev) => ({ ...prev, estilo: opt.value }))}
                    className={`rounded border px-3 py-1.5 ${opt.disabled ? 'opacity-40' : ''} ${
                      selected && !opt.disabled ? 'border-accent bg-accent' : 'border-border bg-transparent'
                    }`}>
                    <Text
                      className={`font-label text-xs uppercase tracking-wide ${
                        selected && !opt.disabled ? 'text-white' : 'text-muted'
                      }`}>
                      {opt.label}
                      {opt.disabled ? ' · Em breve' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Prévia ao vivo — instância separada da que fica off-screen em
              hoje.tsx, só pra visualização; nunca é o alvo do captureRef.
              Componente e tamanho do container trocam com options.estilo —
              cada estilo tem sua própria proporção (360×560 no completo,
              360×360 quadrado no minimalista, 360×450 no foto), mesmo
              PREVIEW_SCALE nos 3. */}
          {options.estilo === 'completo' && (
            <View
              className="mb-6 self-center overflow-hidden rounded border border-border"
              style={{ width: CARD_WIDTH * PREVIEW_SCALE, height: CARD_HEIGHT * PREVIEW_SCALE }}>
              <WorkoutShareCard
                metrics={metrics}
                options={options}
                style={{ transform: [{ scale: PREVIEW_SCALE }], transformOrigin: '0 0' }}
              />
            </View>
          )}

          {options.estilo === 'minimalista' && (
            <View
              className="mb-6 self-center overflow-hidden rounded border border-border"
              style={{ width: MINIMAL_CARD_SIZE * PREVIEW_SCALE, height: MINIMAL_CARD_SIZE * PREVIEW_SCALE }}>
              <WorkoutShareCardMinimal
                metrics={metrics}
                options={options}
                style={{ transform: [{ scale: PREVIEW_SCALE }], transformOrigin: '0 0' }}
              />
            </View>
          )}

          {options.estilo === 'foto' &&
            (options.fotoUri ? (
              <View className="mb-6 items-center">
                <View
                  className="overflow-hidden rounded border border-border"
                  style={{ width: PHOTO_CARD_WIDTH * PREVIEW_SCALE, height: PHOTO_CARD_HEIGHT * PREVIEW_SCALE }}>
                  <WorkoutShareCardPhoto
                    metrics={metrics}
                    options={options}
                    style={{ transform: [{ scale: PREVIEW_SCALE }], transformOrigin: '0 0' }}
                  />
                </View>
                <Pressable onPress={handlePickPhoto} className="mt-3 py-1">
                  <Text className="font-label text-xs uppercase tracking-wide text-accent">Trocar foto</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={handlePickPhoto}
                className="mb-6 items-center justify-center self-center rounded border border-dashed border-border bg-surface"
                style={{ width: PHOTO_CARD_WIDTH * PREVIEW_SCALE, height: PHOTO_CARD_HEIGHT * PREVIEW_SCALE }}>
                <Ionicons name="camera-outline" size={28} color={colors.muted} />
                <Text className="mt-2 px-4 text-center font-label text-xs uppercase tracking-wide text-muted">
                  Toque para escolher uma foto
                </Text>
              </Pressable>
            ))}

          {/* Só faz sentido junto do estilo 'foto' — é a foto que recebe o
              efeito, os outros 2 estilos não têm imagem de fundo nenhuma pra
              escurecer. Aparece independente de já haver foto escolhida (o
              padrão vale assim que o usuário troca pro estilo 'foto', antes
              mesmo de escolher a imagem). */}
          {options.estilo === 'foto' && (
            <View className="mb-6 flex-row items-center justify-between py-3">
              <View>
                <Text className="font-card-title text-sm text-text">Efeito dark</Text>
                <Text className="font-label text-xs text-muted">Contraste dramático na foto</Text>
              </View>
              <Switch
                value={options.efeitoDark}
                onValueChange={(v) => setOptions((prev) => ({ ...prev, efeitoDark: v }))}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.text}
              />
            </View>
          )}

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

          {/* Métricas: só faz sentido pro estilo 'completo' — é a grade de
              StatCells que esses 4 toggles ligam/desligam; o 'minimalista'
              não tem essa grade (volume+duração são fixos nele, ver
              workout-share-card-minimal.tsx), então os toggles ficariam sem
              efeito visível se mostrados ali. */}
          {options.estilo === 'completo' && (
            <View className="mb-8">
              <Text className="mb-2 font-label text-xs uppercase tracking-wider text-muted">Métricas</Text>
              <View className="flex-row flex-wrap gap-2">
                <OptionToggle
                  label="Duração"
                  active={options.mostrarDuracao}
                  onPress={() => toggle('mostrarDuracao')}
                />
                <OptionToggle
                  label="Volume (kg)"
                  active={options.mostrarVolume}
                  onPress={() => toggle('mostrarVolume')}
                />
                <OptionToggle label="Séries" active={options.mostrarSeries} onPress={() => toggle('mostrarSeries')} />
                <OptionToggle
                  label="Exercícios"
                  active={options.mostrarExercicios}
                  onPress={() => toggle('mostrarExercicios')}
                />
              </View>
            </View>
          )}

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
