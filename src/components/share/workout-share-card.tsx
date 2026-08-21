import { forwardRef } from 'react';
import { Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { formatNumberPtBr } from '@/lib/format';
import type { SessionPr } from '@/lib/personal-records';
import { colors } from '@/theme/tokens';

import type { WorkoutShareOptions } from './types';

// Resolução final do PNG (passada como `width`/`height` de resize pro
// `captureRef` em share-image.ts) — precisa manter a MESMA proporção de
// CARD_WIDTH/CARD_HEIGHT abaixo (senão o resize distorce a imagem). Não é o
// tamanho de layout do card em si: captureRef captura na resolução nativa do
// dispositivo e REDIMENSIONA pro valor pedido, então o card pode (e deve) ter
// um tamanho de layout modesto em pontos.
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1680;

// Tamanho do layout em pontos (não pixels) — mesma proporção de
// SHARE_CARD_WIDTH/HEIGHT acima (360:560 === 1080:1680). Mais alto que um
// 4:5 "puro" de propósito: com grupos musculares + faixa de PR + marcador de
// semana somados aos 4 números, 450pt de altura ficava curto demais e o
// conteúdo se sobrepunha (uma seção "flex-1" tentando absorver espaço
// negativo). Nada aqui usa flex-1/justify-center pra "esticar" mais — cada
// seção tem seu tamanho natural, e o `justify-between` do container só
// distribui o que sobra como respiro, nunca aperta.
// Exportado pra a prévia ao vivo da tela de personalização (workout-share-
// modal.tsx) escalar o card mantendo a proporção exata, sem duplicar os
// números aqui.
export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 560;

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
   * batido, omite a faixa inteira. Usado como fallback automático quando
   * `options.prEscolhido` é `null` ou aponta pra um índice inválido. */
  prDestaque: { exerciseNome: string; cargaNova: number } | null;
  /** Lista COMPLETA de PRs da sessão (mesmo array que alimenta a celebração
   * em hoje.tsx) — a tela de personalização usa pra deixar o usuário
   * escolher qual mostrar (`options.prEscolhido`, índice neste array). */
  sessionPrs: SessionPr[];
  /** Dias com sessão concluída na semana atual (segunda-domingo) — índice 0
   * = segunda ... 6 = domingo, ver computeTrainedDaysInWeek em lib/stats.ts. */
  diasSemana: boolean[];
  /** Índice (0-6, segunda-domingo) do dia de hoje dentro de `diasSemana`,
   * pra destacar o dia atual no marcador. */
  indiceHoje: number;
};

// Card 360×560 tem espaço natural pra 4 StatCell em grade 2×2 — com 1 a 3
// métricas desligadas (WorkoutShareOptions), forçar sempre 2 colunas fixas
// deixaria buraco(s) vazios no meio da grade. Em vez disso, as células
// LIGADAS são listadas e distribuídas num grid flexível (flex-wrap, 2 por
// linha) que se reorganiza sozinho pra qualquer contagem de 1 a 4 — a
// simetria perfeita 2×2 só volta quando as 4 estão ligadas (o caso mais
// comum, já que todas vêm ligadas por padrão).

const WEEKDAY_LABELS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']; // segunda .. domingo

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
  {
    metrics: WorkoutShareMetrics;
    options: WorkoutShareOptions;
    style?: StyleProp<ViewStyle>;
    onLayout?: (event: LayoutChangeEvent) => void;
  }
>(function WorkoutShareCard({ metrics, options, style, onLayout }, ref) {
  // PR a mostrar: options.mostrarPr desliga a faixa inteira; com ela ligada,
  // um índice explícito escolhido pelo usuário (options.prEscolhido) vence —
  // mas só se ainda for válido nesta `sessionPrs` (sessão diferente, lista
  // menor etc. cai de volta pro automático). `null` (modo automático) sempre
  // cai no `prDestaque` já resolvido por pickHighlightPr em hoje.tsx.
  const escolhido =
    options.prEscolhido != null ? metrics.sessionPrs[options.prEscolhido] : undefined;
  const prParaMostrar = options.mostrarPr ? (escolhido ?? metrics.prDestaque) : null;

  const statCells = [
    options.mostrarDuracao && { key: 'duracao', value: metrics.durationLabel ?? '—', label: 'DURAÇÃO' },
    options.mostrarVolume && { key: 'volume', value: formatNumberPtBr(metrics.volumeKg), label: 'VOLUME (KG)' },
    options.mostrarSeries && { key: 'series', value: String(metrics.totalSeries), label: 'SÉRIES' },
    options.mostrarExercicios && {
      key: 'exercicios',
      value: String(metrics.totalExercises),
      label: 'EXERCÍCIOS',
    },
  ].filter((cell): cell is { key: string; value: string; label: string } => cell !== false);

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

      {/* Miolo: números em destaque — tamanho NATURAL (sem flex-1), pra nunca
          ser espremida por outras seções quando o conteúdo total crescer
          (grupos/PR/semana). Grid flexível: 2 por linha, se reorganiza
          sozinho conforme quantas métricas estão ligadas (ver comentário
          acima de WorkoutShareMetrics). Seção inteira some se as 4 estiverem
          desligadas — `justify-between` do container redistribui o espaço. */}
      {statCells.length > 0 && (
        <View
          className={`flex-row flex-wrap ${statCells.length === 1 ? 'justify-center' : 'justify-between'}`}
          style={{ rowGap: 20 }}>
          {statCells.map((cell) => (
            // `flex-row` aqui (não a `column` padrão): o `flex-1` da StatCell
            // só faz sentido junto de um eixo principal DEFINIDO — antes da
            // grade flexível, o pai era sempre um `flex-row` esticado até a
            // largura fixa do card (CARD_WIDTH), então `flex-1` dividia essa
            // largura. Um wrapper `column` (padrão do RN) sem altura definida
            // faz o `flex-1` operar na ALTURA (o eixo principal de uma
            // `column`), que aqui é "auto"/hug-content — sem espaço definido
            // pra crescer, a StatCell colapsava pra altura zero (bug real,
            // confirmado). `flex-row` realinha o eixo principal de volta pra
            // LARGURA (que o `width: '47%'` abaixo torna definida), igual ao
            // comportamento original — a altura vira eixo cruzado, sizada
            // normalmente pelo conteúdo, sem nenhum flex-grow envolvido nela.
            <View key={cell.key} className="flex-row" style={{ width: '47%' }}>
              <StatCell value={cell.value} label={cell.label} />
            </View>
          ))}
        </View>
      )}

      {/* Faixa de PR — só existe quando há recorde pra mostrar (metrics tem
          PR E options.mostrarPr está ligado); sem espaço reservado quando
          não há (justify-between do container redistribui sozinho).
          "Novo recorde" fica numa linha curta e fixa; o nome do exercício +
          carga (variável, pode ser longo) tem sua PRÓPRIA linha com até 2
          linhas + auto-encolhe, pra nunca estourar a largura do card. */}
      {prParaMostrar && (
        <View className="items-center">
          <View className="flex-row items-center gap-2">
            <Ionicons name="trophy" size={16} color={colors.accent} />
            <Text className="font-label uppercase text-accent" style={{ fontSize: 12, letterSpacing: 1 }}>
              Novo recorde
            </Text>
          </View>
          <Text
            numberOfLines={2}
            adjustsFontSizeToFit
            className="mt-1 text-center font-body-medium text-accent"
            style={{ fontSize: 14 }}>
            {`${prParaMostrar.exerciseNome} · ${prParaMostrar.cargaNova}kg`}
          </Text>
        </View>
      )}

      {/* Marcador da semana — 7 dias, segunda a domingo */}
      <View className="items-center">
        <Text className="mb-2 font-label uppercase text-muted" style={{ fontSize: 11, letterSpacing: 1 }}>
          Esta semana
        </Text>
        <View className="w-full flex-row justify-between">
          {metrics.diasSemana.map((trained, index) => (
            <WeekdayDot
              key={index}
              label={WEEKDAY_LABELS[index]}
              trained={trained}
              isToday={index === metrics.indiceHoje}
            />
          ))}
        </View>
      </View>

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

function WeekdayDot({ label, trained, isToday }: { label: string; trained: boolean; isToday: boolean }) {
  // Treinado: círculo cheio em accent (com check). Não treinado: círculo
  // vazio, contorno muted — ou accent (sem preencher) se for hoje, pra
  // localizar o dia atual mesmo antes de ele ter sido treinado. Hoje
  // normalmente aparece cheio de qualquer jeito (é o treino que está sendo
  // compartilhado), mas a borda mais grossa reforça qual é o dia atual.
  const borderColor = trained || isToday ? colors.accent : colors.border;
  return (
    <View className="items-center" style={{ width: 32 }}>
      <View
        className="items-center justify-center rounded-full"
        style={{
          width: 24,
          height: 24,
          borderWidth: isToday ? 2 : 1,
          borderColor,
          backgroundColor: trained ? colors.accent : 'transparent',
        }}>
        {trained && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <Text
        className="mt-1 font-label uppercase"
        style={{ fontSize: 10, color: trained || isToday ? colors.text : colors.muted }}>
        {label}
      </Text>
    </View>
  );
}

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
