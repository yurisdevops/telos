import { forwardRef } from 'react';
import { Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors } from '@/theme/tokens';

// Resolução final do PNG (passada como `width`/`height` de resize pro
// `captureRef` em share-image.ts) — 4:5, cabe bem em stories/status
// (retrato) e no feed. Não é o tamanho de layout do card em si (ver
// CARD_WIDTH/CARD_HEIGHT abaixo): captureRef captura na resolução nativa do
// dispositivo e REDIMENSIONA pro valor pedido, então o card pode (e deve)
// ter um tamanho de layout modesto em pontos.
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

// Tamanho do layout em pontos (não pixels) — mesma proporção 4:5. Um card
// do tamanho de uma tela de celular é suficiente; capturar em 1080x1350 via
// resize dá um PNG nítido independente do pixelRatio do aparelho de teste.
const CARD_WIDTH = 360;
const CARD_HEIGHT = 450;

export type WorkoutShareMetrics = {
  dayLabel: string;
  dateLabel: string;
  durationLabel: string | null;
  volumeKg: number;
  totalSeries: number;
  totalExercises: number;
  /** Top grupos musculares treinados, já ordenados por relevância (mais
   * séries primeiro) e já limitados (ver hoje.tsx) — o card só junta com
   * " · " e mostra, sem lógica de ordenar/cortar aqui. Vazio = omite a linha. */
  grupos: string[];
  /** PR em destaque desta sessão (já escolhido por quem monta as métricas,
   * ver pickHighlightPr em lib/personal-records.ts) — null = nenhum PR
   * batido, omite a faixa inteira. */
  prDestaque: { exerciseNome: string; cargaNova: number } | null;
};

/**
 * Card de resumo do treino — componente RN comum (View/Text, NativeWind),
 * capturado via `react-native-view-shot`'s `captureRef` em vez de SVG.
 *
 * Histórico: a primeira versão desenhava o card em SVG puro (react-native-svg
 * + toDataURL) pra evitar lib nativa nova — mas o SvgText simplesmente não
 * renderizava texto no PNG gerado (só formas/linhas apareciam), um problema
 * documentado dessa combinação específica (toDataURL + Text) na lib. Como
 * este é um <Text> de verdade, a fonte custom do app (Barlow Condensed via
 * `font-display`, Inter via `font-label`) volta a funcionar igual ao resto
 * do app — não depende mais de resolver fonte custom dentro do pipeline de
 * texto do SVG.
 */
export const WorkoutShareCard = forwardRef<
  View,
  { metrics: WorkoutShareMetrics; style?: StyleProp<ViewStyle>; onLayout?: (event: LayoutChangeEvent) => void }
>(function WorkoutShareCard({ metrics, style, onLayout }, ref) {
  return (
    <View
      ref={ref}
      onLayout={onLayout}
      // collapsable={false}: sem isso o Android pode "otimizar" essa View pra
      // fora da árvore nativa de views antes da captura (ela nunca aparece na
      // tela, então não teria razão óbvia pra existir como view nativa aos
      // olhos do RN) — o mesmo cuidado que o próprio componente <ViewShot> da
      // lib toma automaticamente por baixo dos panos.
      collapsable={false}
      style={[{ width: CARD_WIDTH, height: CARD_HEIGHT }, style]}
      className="justify-between bg-bg px-8 py-8">
      {/* Cabeçalho: nome do dia + data */}
      <View className="items-center">
        <View className="h-1 w-12 bg-accent" />
        <Text
          numberOfLines={2}
          adjustsFontSizeToFit
          className="mt-4 text-center font-display uppercase text-text"
          style={{ fontSize: 30 }}>
          {metrics.dayLabel}
        </Text>
        <Text className="mt-1 font-label uppercase text-muted" style={{ fontSize: 12, letterSpacing: 1 }}>
          {metrics.dateLabel}
        </Text>
        {metrics.grupos.length > 0 && (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            className="mt-2 text-center font-label uppercase text-text"
            style={{ fontSize: 13, letterSpacing: 1 }}>
            {metrics.grupos.join(' · ')}
          </Text>
        )}
      </View>

      <View className="h-px bg-border" />

      {/* Miolo: 4 números em destaque, 2x2 */}
      <View className="flex-1 justify-center gap-8">
        <View className="flex-row">
          <StatCell value={metrics.durationLabel ?? '—'} label="DURAÇÃO" />
          <StatCell value={String(metrics.volumeKg)} label="VOLUME (KG)" />
        </View>
        <View className="flex-row">
          <StatCell value={String(metrics.totalSeries)} label="SÉRIES" />
          <StatCell value={String(metrics.totalExercises)} label="EXERCÍCIOS" />
        </View>
      </View>

      {/* Faixa de PR — só existe quando há recorde; sem espaço reservado
          quando não há (justify-between do container redistribui sozinho). */}
      {metrics.prDestaque && (
        <View className="flex-row items-center justify-center gap-2">
          <Ionicons name="trophy" size={16} color={colors.accent} />
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            className="font-label uppercase text-accent"
            style={{ fontSize: 13, letterSpacing: 1 }}>
            {`Novo recorde · ${metrics.prDestaque.exerciseNome} ${metrics.prDestaque.cargaNova}kg`}
          </Text>
        </View>
      )}

      {/* Rodapé: assinatura */}
      <View className="items-center">
        <View className="mb-3 h-px w-12 bg-border" />
        <Text className="font-display uppercase text-text" style={{ fontSize: 20, letterSpacing: 4 }}>
          TELOS
        </Text>
      </View>
    </View>
  );
});

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center">
      <Text numberOfLines={1} adjustsFontSizeToFit className="font-display text-accent" style={{ fontSize: 46 }}>
        {value}
      </Text>
      <Text className="mt-1 font-label uppercase text-muted" style={{ fontSize: 11, letterSpacing: 1 }}>
        {label}
      </Text>
    </View>
  );
}
