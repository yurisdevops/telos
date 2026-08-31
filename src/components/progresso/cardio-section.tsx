import { useMemo } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { Label } from '@/components/ui/label';
import { ProgressBar } from '@/components/ui/progress-bar';
import {
  deleteCardioLogsForSession,
  deleteCardioSession,
  getCardioHistory,
  getCardioWeekSummary,
  type CardioHistoryItem,
} from '@/db/cardio-stats';
import { useUserProfile } from '@/db/user-profile';
import { formatPace, MODALIDADES_CARDIO } from '@/lib/cardio';
import { formatShortDateLabel, getTodayDateString, getWeekStartIso, parseLocalIsoDate, toLocalIsoDate } from '@/lib/date';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

const HISTORY_LIMIT = 10;

/**
 * Seção "Cardio" do Progresso — dentro de um CollapsibleSection (sempre
 * nasce colapsada, comportamento padrão do próprio wrapper — não existe
 * prop pra mudar isso, nem precisa: são dados opcionais, não o foco do
 * Progresso). Enquanto colapsada, nada aqui é montado — as duas queries só
 * disparam quando o usuário expande (ver CollapsibleSection).
 */
export function CardioSection() {
  // Semana atual — mesmo cálculo de boundary [início, +7 dias) já usado por
  // computeCurrentWeekVolume em db/stats.ts, pra ficar consistente com o
  // resto do app quanto ao que conta como "semana atual".
  const { startIso, endIso } = useMemo(() => {
    const weekStartIso = getWeekStartIso(getTodayDateString());
    const weekStart = parseLocalIsoDate(weekStartIso);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return { startIso: weekStartIso, endIso: toLocalIsoDate(weekEnd) };
  }, []);

  const summary = useDbQuery(
    () => getCardioWeekSummary(startIso, endIso),
    ['cardio_logs', 'sessions', 'cardio_sessions'],
    [startIso, endIso]
  );
  const history = useDbQuery(() => getCardioHistory(HISTORY_LIMIT), ['cardio_logs', 'sessions', 'cardio_sessions'], []);
  // Reativo por si só (useLiveQuery por baixo, ver db/user-profile.ts) — não
  // precisa entrar em nenhum watchTables acima, já reage sozinho a mudança
  // de meta salva no Perfil.
  const profile = useUserProfile();
  const { confirm, dialog } = useConfirmDialog();

  // `blocos[0]` já basta pra achar o id certo — todo bloco de um mesmo item
  // de histórico compartilha o mesmo sessionId OU cardioSessionId (é
  // exatamente o que agrupa eles num item só, ver getCardioHistory). A
  // query reativa (useDbQuery acima, via addDatabaseChangeListener nas
  // tabelas cardio_logs/cardio_sessions) atualiza a lista sozinha depois —
  // nenhum refetch manual necessário aqui.
  const handleDeleteHistoryItem = async (item: CardioHistoryItem) => {
    const ok = await confirm({
      title: 'Apagar este cardio?',
      message: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Apagar',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      if (item.tipo === 'cardio_puro') {
        const cardioSessionId = item.blocos[0]?.cardioSessionId;
        if (cardioSessionId != null) await deleteCardioSession(cardioSessionId);
      } else {
        const sessionId = item.blocos[0]?.sessionId;
        if (sessionId != null) await deleteCardioLogsForSession(sessionId);
      }
    } catch (err) {
      console.error('Erro ao apagar cardio:', err);
      Alert.alert('Erro ao apagar cardio', String(err instanceof Error ? err.message : err));
    }
  };

  // `key` força CollapsibleSection a REMONTAR (reinicializando seu próprio
  // `useState(defaultExpanded)`) na transição de `summary`/`profile` ainda
  // não resolvidos (cabeçalho aparece fechado, como sempre) pra um valor
  // real. Sem isso, o `useState` interno já teria travado no `false` do 1º
  // paint (as duas respostas são assíncronas, não dá pra saber no mount) e
  // nunca reagiria ao dado chegar um instante depois.
  //
  // Nasce aberta se já houve cardio essa semana OU se existe uma meta
  // definida — quem tem meta quer ver o progresso (mesmo "0/90 min") sem
  // precisar tocar pra abrir, não só depois de já ter feito algo.
  const deveNascerAberta = (summary?.totalSessoes ?? 0) > 0 || profile?.metaCardioMinutosSemana != null;

  return (
    <CollapsibleSection
      key={summary === undefined || profile === undefined ? 'carregando' : 'carregado'}
      title="Cardio"
      icon="flash-outline"
      defaultExpanded={deveNascerAberta}>
      {summary && (
        <View>
          {/* Meta semanal — só aparece se o usuário definiu uma (Perfil,
              metaCardioMinutosSemana). Antes do bloco de resumo/vazio abaixo
              (não dentro do `totalMinutos === 0 ? ... : ...`), pra continuar
              visível mesmo numa semana sem cardio ainda — "0 / 90 min" é
              mais útil que sumir a meta só porque ainda não há realizado. */}
          {profile?.metaCardioMinutosSemana != null && (
            <View className="mb-4">
              <View className="mb-1 flex-row items-baseline justify-between">
                <Label>Meta semanal</Label>
                <Text className="font-label text-xs text-muted">
                  {`${summary.totalMinutos} / ${profile.metaCardioMinutosSemana} min`}
                </Text>
              </View>
              <ProgressBar progress={summary.totalMinutos / profile.metaCardioMinutosSemana} />
            </View>
          )}

          {summary.totalMinutos === 0 ? (
            <View className="items-center py-2">
              <Text className="text-center font-body text-sm text-muted">Nenhum cardio esta semana</Text>
              <Label className="mt-1 text-center">
                Registre um bloco de cardio dentro de um treino, ou inicie uma sessão separada na aba Treinar.
              </Label>
            </View>
          ) : (
            <View>
              <Text className="font-display text-4xl text-accent">
                {summary.totalMinutos}
                <Text className="font-label text-sm uppercase text-muted"> min esta semana</Text>
              </Text>

              <View className="mt-3 gap-2">
                {summary.porModalidade.map((item) => (
                  <View key={item.modalidade} className="flex-row items-center gap-2">
                    <Ionicons name={item.icon} size={16} color={colors.muted} />
                    <Text className="flex-1 font-body text-sm text-text">{item.label}</Text>
                    <Text className="font-label text-sm text-muted">{`${item.minutos} min`}</Text>
                  </View>
                ))}
              </View>

              <Label className="mt-3">
                {`${summary.totalSessoes} ${summary.totalSessoes === 1 ? 'sessão' : 'sessões'} de cardio`}
              </Label>
            </View>
          )}
        </View>
      )}

      {/* Histórico — omitido por completo se vazio, sem repetir o estado
          vazio da Parte 1 (a semana atual já cobre esse aviso). */}
      {history && history.length > 0 && (
        <View className="mt-5 gap-2">
          <Label>Histórico</Label>
          {history.map((item, index) => {
            // Distância total do item (soma dos blocos que têm distância) —
            // não existia exibição nenhuma de distância aqui antes; some
            // junto com o pace (que depende dela) só quando pelo menos um
            // bloco registrou distância, sem inventar uma seção nova.
            const distanciaTotalKm = item.blocos.reduce((sum, b) => sum + (b.distanciaKm ?? 0), 0);
            const pace = formatPace(item.duracaoTotalMin, distanciaTotalKm > 0 ? distanciaTotalKm : null);
            return (
              <Card key={`${item.tipo}-${item.data}-${index}`} className="px-4 py-3">
                <View className="flex-row items-center justify-between">
                  <Text className="font-card-title text-sm text-text">{formatShortDateLabel(item.data)}</Text>
                  <View className="flex-row items-center gap-3">
                    <Label>{item.tipo === 'forca_com_cardio' ? 'Treino + Cardio' : 'Cardio'}</Label>
                    <Pressable onPress={() => handleDeleteHistoryItem(item)} hitSlop={10}>
                      <Ionicons name="trash-outline" size={16} color={colors.muted} />
                    </Pressable>
                  </View>
                </View>
                <Label className="mt-1">
                  {`${item.duracaoTotalMin} min${distanciaTotalKm > 0 ? ` · ${distanciaTotalKm}km` : ''}${
                    pace ? ` · ${pace}` : ''
                  }`}
                </Label>
                <View className="mt-2 flex-row flex-wrap gap-1">
                  {[...new Set(item.blocos.map((b) => b.modalidade))].map((modalidade) => (
                    <Chip
                      key={modalidade}
                      label={MODALIDADES_CARDIO.find((m) => m.key === modalidade)?.label ?? modalidade}
                    />
                  ))}
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {dialog}
    </CollapsibleSection>
  );
}
