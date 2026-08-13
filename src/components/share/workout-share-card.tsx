import { forwardRef } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import { colors } from '@/theme/tokens';

// Fonte de sistema, não a Barlow/Inter custom do app — ver comentário grande
// abaixo do porquê. 'Helvetica' é uma fonte real garantida em todo iOS;
// 'sans-serif' é o alias genérico do Android pra Roboto (ou o que o
// fabricante tiver como padrão). `undefined` deixa o react-native-svg cair no
// próprio default nativo em qualquer outra plataforma.
const SYSTEM_FONT_FAMILY = Platform.select<string | undefined>({ ios: 'Helvetica', android: 'sans-serif' });
const HEAVY_WEIGHT = '900';
const LABEL_WEIGHT = '600';

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
// Colunas ficam a ~238px de raio uma da outra (238*2 = distância entre os
// centros) antes de colidir — números grandes demais (ex: volume de 5+
// dígitos) precisam de um fontSize menor que caberia numa fonte condensada.
const STAT_VALUE_FONT_SIZE = 116;
const STAT_VALUE_FONT_SIZE_LONG = 90; // usado quando o valor tem 6+ caracteres

/**
 * Card de resumo do treino, desenhado em SVG puro (sem flexbox — cada
 * elemento é posicionado por x/y manual) pra poder ser rasterizado via
 * `toDataURL` do próprio react-native-svg (já linkado no binário atual,
 * transitivo do react-native-gifted-charts — nenhum módulo nativo novo).
 *
 * FONTE DE SISTEMA, não a Barlow Condensed/Inter custom do app: um card
 * gerado com fontFamily custom saiu com o texto inteiro ausente do PNG (só
 * fundo e linhas divisórias apareceram) — as duas hipóteses investigadas
 * foram (A) o renderizador nativo de texto do react-native-svg não resolve
 * fonte custom carregada via expo-font em `toDataURL`, ou (B) um bug mais
 * geral dessa lib na combinação toDataURL+Text, independente de fonte (tem
 * issue documentada de crash exatamente nessa combinação). Fonte de sistema
 * resolve (A) com certeza — é o único ajuste que não depende de saber qual
 * das duas é a causa real, então foi o escolhido.
 *
 * PLANO B se o texto AINDA sumir com fonte de sistema: descarta (A), sobra
 * (B) — bug da lib nessa versão, não a fonte. Nesse caso a saída não é mais
 * ajuste de fonte, é trocar de abordagem de captura (ex: `react-native-view-
 * shot`, que tira print do que já está na tela via <Text> normal em vez de
 * desenhar em SVG — mas isso exige lib nativa nova e build, não é mais OTA).
 */
export const WorkoutShareCard = forwardRef<Svg, { metrics: WorkoutShareMetrics; style?: StyleProp<ViewStyle> }>(
  function WorkoutShareCard({ metrics, style }, ref) {
    const durationValue = metrics.durationLabel ?? '—';
    const volumeValue = String(metrics.volumeKg);

    // Fonte de sistema é mais LARGA que a Barlow Condensed (que é estreita
    // de propósito) — nome do dia é texto livre do usuário (ex: templates já
    // têm rótulo de 19+ caracteres, tipo "A · Peito e Tríceps"), então reduz
    // o tamanho conforme o comprimento pra caber nos ~840px de largura útil
    // (1080 menos as margens de 120px de cada lado, mesma largura da linha
    // divisória abaixo). Números grandes (volume) recebem o mesmo tratamento.
    const dayLabelFontSize = metrics.dayLabel.length > 18 ? 56 : metrics.dayLabel.length > 12 ? 70 : 92;
    const volumeFontSize = volumeValue.length > 5 ? STAT_VALUE_FONT_SIZE_LONG : STAT_VALUE_FONT_SIZE;

    return (
      <Svg ref={ref} width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT} style={style}>
        <Rect x={0} y={0} width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT} fill={colors.bg} />

        {/* Detalhe de topo */}
        <Rect x={CENTER_X - 70} y={150} width={140} height={6} fill={colors.accent} />

        {/* Cabeçalho: nome do dia + data */}
        <SvgText
          x={CENTER_X}
          y={280}
          fontFamily={SYSTEM_FONT_FAMILY}
          fontWeight={HEAVY_WEIGHT}
          fontSize={dayLabelFontSize}
          fill={colors.text}
          textAnchor="middle">
          {metrics.dayLabel.toUpperCase()}
        </SvgText>
        <SvgText
          x={CENTER_X}
          y={335}
          fontFamily={SYSTEM_FONT_FAMILY}
          fontWeight={LABEL_WEIGHT}
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
          fontFamily={SYSTEM_FONT_FAMILY}
          fontWeight={HEAVY_WEIGHT}
          fontSize={STAT_VALUE_FONT_SIZE}
          fill={colors.accent}
          textAnchor="middle">
          {durationValue}
        </SvgText>
        <SvgText
          x={STAT_LEFT_X}
          y={STAT_ROW_1_Y + STAT_LABEL_OFFSET_Y}
          fontFamily={SYSTEM_FONT_FAMILY}
          fontWeight={LABEL_WEIGHT}
          fontSize={30}
          fill={colors.muted}
          textAnchor="middle"
          letterSpacing={2}>
          DURAÇÃO
        </SvgText>

        <SvgText
          x={STAT_RIGHT_X}
          y={STAT_ROW_1_Y}
          fontFamily={SYSTEM_FONT_FAMILY}
          fontWeight={HEAVY_WEIGHT}
          fontSize={volumeFontSize}
          fill={colors.accent}
          textAnchor="middle">
          {volumeValue}
        </SvgText>
        <SvgText
          x={STAT_RIGHT_X}
          y={STAT_ROW_1_Y + STAT_LABEL_OFFSET_Y}
          fontFamily={SYSTEM_FONT_FAMILY}
          fontWeight={LABEL_WEIGHT}
          fontSize={30}
          fill={colors.muted}
          textAnchor="middle"
          letterSpacing={2}>
          VOLUME (KG)
        </SvgText>

        <SvgText
          x={STAT_LEFT_X}
          y={STAT_ROW_2_Y}
          fontFamily={SYSTEM_FONT_FAMILY}
          fontWeight={HEAVY_WEIGHT}
          fontSize={STAT_VALUE_FONT_SIZE}
          fill={colors.accent}
          textAnchor="middle">
          {metrics.totalSeries}
        </SvgText>
        <SvgText
          x={STAT_LEFT_X}
          y={STAT_ROW_2_Y + STAT_LABEL_OFFSET_Y}
          fontFamily={SYSTEM_FONT_FAMILY}
          fontWeight={LABEL_WEIGHT}
          fontSize={30}
          fill={colors.muted}
          textAnchor="middle"
          letterSpacing={2}>
          SÉRIES
        </SvgText>

        <SvgText
          x={STAT_RIGHT_X}
          y={STAT_ROW_2_Y}
          fontFamily={SYSTEM_FONT_FAMILY}
          fontWeight={HEAVY_WEIGHT}
          fontSize={STAT_VALUE_FONT_SIZE}
          fill={colors.accent}
          textAnchor="middle">
          {metrics.totalExercises}
        </SvgText>
        <SvgText
          x={STAT_RIGHT_X}
          y={STAT_ROW_2_Y + STAT_LABEL_OFFSET_Y}
          fontFamily={SYSTEM_FONT_FAMILY}
          fontWeight={LABEL_WEIGHT}
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
          fontFamily={SYSTEM_FONT_FAMILY}
          fontWeight={HEAVY_WEIGHT}
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
