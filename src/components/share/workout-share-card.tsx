import { forwardRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import { colors, fonts } from '@/theme/tokens';

// 4:5 — cabe em stories/status (retrato) e ainda funciona bem no feed
// (Instagram/WhatsApp cortam story em 9:16, mas 4:5 é o "quadrado alto"
// recomendado pra não perder conteúdo em nenhum dos dois). 1080 de largura é
// a resolução de referência do Instagram pra posts.
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

export type WorkoutShareMetrics = {
  dayLabel: string;
  dateLabel: string;
  durationLabel: string | null;
  volumeKg: number;
  totalSeries: number;
  totalExercises: number;
};

const CENTER_X = SHARE_CARD_WIDTH / 2;
const STAT_LEFT_X = SHARE_CARD_WIDTH * 0.28;
const STAT_RIGHT_X = SHARE_CARD_WIDTH * 0.72;
const STAT_ROW_1_Y = 660;
const STAT_ROW_2_Y = 960;
const STAT_LABEL_OFFSET_Y = 56;

/**
 * Card de resumo do treino, desenhado em SVG puro (sem flexbox — cada
 * elemento é posicionado por x/y manual) pra poder ser rasterizado via
 * `toDataURL` do próprio react-native-svg (já linkado no binário atual,
 * transitivo do react-native-gifted-charts — nenhum módulo nativo novo).
 *
 * Fontes: usa os mesmos nomes de `theme/tokens.ts` (`fonts.display`/
 * `fonts.label`) já registrados via expo-font em app/_layout.tsx. Não testado
 * neste ambiente (sem device/emulador aqui) se o renderizador nativo de texto
 * do react-native-svg resolve fonte custom carregada dinamicamente da mesma
 * forma que o <Text> comum do RN — se não resolver, o comportamento padrão do
 * RN é cair pra fonte de sistema (nunca texto invisível), então o pior caso é
 * "fonte errada", não "sem texto". Confirmar visualmente no PNG gerado.
 */
export const WorkoutShareCard = forwardRef<Svg, { metrics: WorkoutShareMetrics; style?: StyleProp<ViewStyle> }>(
  function WorkoutShareCard({ metrics, style }, ref) {
    const durationValue = metrics.durationLabel ?? '—';

    return (
      <Svg ref={ref} width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT} style={style}>
        <Rect x={0} y={0} width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT} fill={colors.bg} />

        {/* Detalhe de topo */}
        <Rect x={CENTER_X - 70} y={150} width={140} height={6} fill={colors.accent} />

        {/* Cabeçalho: nome do dia + data */}
        <SvgText
          x={CENTER_X}
          y={280}
          fontFamily={fonts.display}
          fontSize={92}
          fill={colors.text}
          textAnchor="middle">
          {metrics.dayLabel.toUpperCase()}
        </SvgText>
        <SvgText
          x={CENTER_X}
          y={335}
          fontFamily={fonts.label}
          fontSize={32}
          fill={colors.muted}
          textAnchor="middle"
          letterSpacing={1}>
          {metrics.dateLabel.toUpperCase()}
        </SvgText>

        <Rect x={120} y={420} width={SHARE_CARD_WIDTH - 240} height={2} fill={colors.border} />

        {/* Miolo: 4 números em destaque, 2x2 */}
        <SvgText
          x={STAT_LEFT_X}
          y={STAT_ROW_1_Y}
          fontFamily={fonts.display}
          fontSize={140}
          fill={colors.accent}
          textAnchor="middle">
          {durationValue}
        </SvgText>
        <SvgText
          x={STAT_LEFT_X}
          y={STAT_ROW_1_Y + STAT_LABEL_OFFSET_Y}
          fontFamily={fonts.label}
          fontSize={30}
          fill={colors.muted}
          textAnchor="middle"
          letterSpacing={2}>
          DURAÇÃO
        </SvgText>

        <SvgText
          x={STAT_RIGHT_X}
          y={STAT_ROW_1_Y}
          fontFamily={fonts.display}
          fontSize={140}
          fill={colors.accent}
          textAnchor="middle">
          {metrics.volumeKg}
        </SvgText>
        <SvgText
          x={STAT_RIGHT_X}
          y={STAT_ROW_1_Y + STAT_LABEL_OFFSET_Y}
          fontFamily={fonts.label}
          fontSize={30}
          fill={colors.muted}
          textAnchor="middle"
          letterSpacing={2}>
          VOLUME (KG)
        </SvgText>

        <SvgText
          x={STAT_LEFT_X}
          y={STAT_ROW_2_Y}
          fontFamily={fonts.display}
          fontSize={140}
          fill={colors.accent}
          textAnchor="middle">
          {metrics.totalSeries}
        </SvgText>
        <SvgText
          x={STAT_LEFT_X}
          y={STAT_ROW_2_Y + STAT_LABEL_OFFSET_Y}
          fontFamily={fonts.label}
          fontSize={30}
          fill={colors.muted}
          textAnchor="middle"
          letterSpacing={2}>
          SÉRIES
        </SvgText>

        <SvgText
          x={STAT_RIGHT_X}
          y={STAT_ROW_2_Y}
          fontFamily={fonts.display}
          fontSize={140}
          fill={colors.accent}
          textAnchor="middle">
          {metrics.totalExercises}
        </SvgText>
        <SvgText
          x={STAT_RIGHT_X}
          y={STAT_ROW_2_Y + STAT_LABEL_OFFSET_Y}
          fontFamily={fonts.label}
          fontSize={30}
          fill={colors.muted}
          textAnchor="middle"
          letterSpacing={2}>
          EXERCÍCIOS
        </SvgText>

        {/* Rodapé: assinatura */}
        <Rect x={CENTER_X - 70} y={1190} width={140} height={4} fill={colors.border} />
        <SvgText
          x={CENTER_X}
          y={1270}
          fontFamily={fonts.display}
          fontSize={56}
          fill={colors.text}
          textAnchor="middle"
          letterSpacing={6}>
          TELOS
        </SvgText>
      </Svg>
    );
  }
);
