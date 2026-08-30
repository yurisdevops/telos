import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  Alert,
  Animated,
  Easing,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import Ionicons from '@expo/vector-icons/Ionicons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

import { PrCelebrationOverlay } from '@/components/celebration/pr-celebration-overlay';
import { Screen } from '@/components/screen';
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  WorkoutShareCard,
  type WorkoutShareMetrics,
} from '@/components/share/workout-share-card';
import { SHARE_CARD_MINIMAL_SIZE, WorkoutShareCardMinimal } from '@/components/share/workout-share-card-minimal';
import {
  SHARE_CARD_PHOTO_HEIGHT,
  SHARE_CARD_PHOTO_WIDTH,
  WorkoutShareCardPhoto,
} from '@/components/share/workout-share-card-photo';
import { WorkoutShareModal } from '@/components/share/workout-share-modal';
import { DEFAULT_SHARE_OPTIONS, type WorkoutShareOptions } from '@/components/share/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProgressBar } from '@/components/ui/progress-bar';
import { db } from '@/db';
import {
  cardioLogs,
  cardioSessions,
  exercisePreferences,
  exercises,
  sessionExtraExercises,
  sessionSkips,
  sessions,
  setLogs,
  workoutDayExercises,
  workoutDays,
  workoutPlans,
  type Session,
} from '@/db/schema';
import { criarESalvarComExercicios, criarTreinoLivre, TIPOS_PLANO_EFEMERO } from '@/db/ready-workouts';
import { useAtlas } from '@/lib/atlas-context';
import { formatPace, MODALIDADES_CARDIO, INTENSIDADES_CARDIO } from '@/lib/cardio';
import {
  daysBetween,
  formatDateNoWeekday,
  formatShortDateLabel,
  getTodayDateString,
  getWeekdayLabel,
  getWeekStartIso,
} from '@/lib/date';
import { formatCountdown, formatElapsed, useNow } from '@/lib/duration';
import {
  cancelRestEndNotification,
  ensureRestNotificationPermission,
  scheduleRestEndNotification,
} from '@/lib/rest-notification';
import { RPE_CATEGORY_LABEL, RPE_CATEGORY_ORDER, RPE_CATEGORY_VALUE, rpeValueToCategory, type RpeCategory } from '@/lib/rpe';
import { suggestNextLoad } from '@/lib/suggest-load';
import { suggestRestSeconds } from '@/lib/suggest-rest';
import { shareWorkoutImage } from '@/lib/share-image';
import { findSessionPrs, pickHighlightPr, type SessionPr } from '@/lib/personal-records';
import { computeTrainedDaysInWeek } from '@/lib/stats';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { formatLastPerformance, useLastPerformance } from '@/lib/use-last-performance';
import { colors } from '@/theme/tokens';

const DEFAULT_REST_SECONDS = 90;
// Espera ativa (poll) por um gate de card-pronto antes de capturar o
// compartilhamento (ver handleConfirmShare) — só entra em jogo de fato pro
// estilo 'foto' (a <Image> assíncrona pode passar do duplo rAF); pros outros
// 2 estilos o gate já costuma estar `true` na 1ª checagem, então o loop nem
// chega a rodar. Teto de 4s: tempo de sobra pra decodificar uma foto de
// câmera num aparelho lento, sem travar o compartilhamento pra sempre no
// caso raro de falha de carregamento.
const CAPTURE_READY_TIMEOUT_MS = 4000;
const CAPTURE_READY_POLL_MS = 50;
// Aquecimento (Ajuste 1) é uma série EXTRA, não um toggle numa série
// existente — precisa da própria sequência de numeroSerie, independente da
// grade 1..seriesAlvo das séries válidas (pra nunca colidir com ela). Uma
// base bem negativa deixa qualquer sessão real (nunca chega a 1000 séries
// de aquecimento) com espaço de sobra, e mantém um ORDENAMENTO GLOBAL
// simples: `ORDER BY numeroSerie ASC` já põe todo aquecimento (bem negativo)
// antes de toda série válida (positiva), sem precisar de sort por 2 chaves.
// handleAddWarmup sempre soma 1 ao MAIOR numeroSerie de aquecimento
// existente; handleRemoveWarmup renumera os que sobram pra nunca deixar
// buraco — as duas garantias juntas mantêm a sequência sempre densa
// (BASE, BASE+1, BASE+2...), o que é o que permite o rótulo "Aquec. N" e o
// atalho de teclado "próximo campo" (numeroSerie+1) continuarem corretos
// mesmo depois de remover um aquecimento do meio.
const WARMUP_NUMERO_SERIE_BASE = -1000;
// Padrão longo e repetido (não o pulso único do expo-haptics) — pra ser
// percebido com o celular na bancada. Repete até o usuário fechar o overlay
// ou até o teto de segurança abaixo, o que vier primeiro.
const REST_DONE_VIBRATION_PATTERN = [0, 700, 400, 700, 400, 700];
const REST_DONE_VIBRATION_MAX_MS = 20000;

function reportError(context: string, err: unknown) {
  console.error(context, err);
  Alert.alert(context, String(err instanceof Error ? err.message : err));
}

export default function HojeScreen() {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const todayStr = getTodayDateString();
  const today = new Date();
  // Dois refs, um pra cada mecanismo de rolagem — nunca montados ao mesmo
  // tempo (um por branch abaixo), mas com APIs de imperative handle
  // diferentes, então não dá pra reaproveitar o mesmo ref tipado:
  // `scrollRef` é o ScrollView nativo de <Screen scrollable> (branch sem
  // sessão, DayPicker); `kasvRef` é a instância do KeyboardAwareScrollView
  // (branch com sessão em andamento) — expõe `scrollToPosition(x,y,animated)`
  // em vez de `.scrollTo(...)` do ScrollView (ver SessionExecution abaixo).
  const scrollRef = useRef<ScrollView>(null);
  const kasvRef = useRef<KeyboardAwareScrollView>(null);

  const { data: todaySessions } = useLiveQuery(
    db.select().from(sessions).where(eq(sessions.data, todayStr))
  );
  const todaySession = todaySessions?.[0];

  // Cardio em andamento hoje (modo B, sessão separada) — só as NÃO
  // concluídas de propósito (diferente de `todaySessions` acima, que pega
  // qualquer sessão de força do dia independente do status): uma vez
  // concluída, o cardio de hoje "sai do caminho" — a aba volta a oferecer
  // DayPicker/"Iniciar cardio" normalmente, permitindo até uma 2ª sessão de
  // cardio ou um treino de força no mesmo dia. Musculação não funciona assim
  // (fica mostrando o card "Treino concluído" pro resto do dia) — divergência
  // deliberada entre os dois modos.
  const { data: todayCardioRows } = useLiveQuery(
    db
      .select()
      .from(cardioSessions)
      .where(and(eq(cardioSessions.data, todayStr), eq(cardioSessions.concluida, false)))
  );
  const todayCardioSession = todayCardioRows?.[0] ?? null;

  const handleStartDay = async (dayId: number) => {
    try {
      await db.insert(sessions).values({
        workoutDayId: dayId,
        data: todayStr,
        concluida: false,
        horaInicio: Date.now(),
      });
    } catch (err) {
      reportError('Erro ao iniciar treino', err);
    }
  };

  // Síncrona (mesmo padrão de treinarAgora/criarTreinoLivre em
  // ready-workouts.ts — transação sem await). Cria a sessão vazia e já
  // empurra o usuário pro picker de exercícios (sessao/adicionar-exercicio),
  // que grava em sessionExtraExercises — a mesma tela usada pra adicionar
  // exercício avulso a QUALQUER sessão em andamento, reaproveitada aqui como
  // o próprio ponto de partida. `router.back()` de lá volta pra esta aba, já
  // mostrando a sessão via SessionExecution (useLiveQuery de `sessions`
  // reage à inserção sozinho).
  const handleStartLivre = () => {
    try {
      const result = criarTreinoLivre();
      if (result.status === 'already_has_session_today') {
        // Não deveria ocorrer (este botão só aparece quando NÃO há sessão
        // hoje), mas defensivo — mesmo critério de aviso já usado no
        // "treinar agora" do Atlas.
        reportError('Erro ao iniciar treino livre', new Error('Já existe uma sessão hoje.'));
        return;
      }
      router.push({
        pathname: '/sessao/adicionar-exercicio',
        params: { sessionId: String(result.sessionId) },
      });
    } catch (err) {
      reportError('Erro ao iniciar treino livre', err);
    }
  };

  // Verifica se já existe cardioSession hoje (concluída ou não) antes de
  // criar uma nova — 3 casos: em andamento (só navega), já concluída hoje
  // (confirma antes de abrir outra) ou nenhuma ainda (cria direto).
  const handleStartCardio = async () => {
    try {
      const existingRows = await db.select().from(cardioSessions).where(eq(cardioSessions.data, todayStr));
      const existing = existingRows[0];

      if (existing && !existing.concluida) {
        router.push({ pathname: '/cardio/sessao', params: { cardioSessionId: String(existing.id) } });
        return;
      }

      if (existing && existing.concluida) {
        const ok = await confirm({
          title: 'Cardio de hoje já feito',
          message: 'Você já fez cardio hoje. Deseja iniciar outra sessão?',
          confirmLabel: 'Iniciar outra',
        });
        if (ok) {
          try {
            const [created] = await db
              .insert(cardioSessions)
              .values({ data: todayStr, horaInicio: Date.now(), concluida: false })
              .returning();
            router.push({ pathname: '/cardio/sessao', params: { cardioSessionId: String(created.id) } });
          } catch (err) {
            reportError('Erro ao iniciar cardio', err);
          }
        }
        return;
      }

      const [created] = await db
        .insert(cardioSessions)
        .values({ data: todayStr, horaInicio: Date.now(), concluida: false })
        .returning();
      router.push({ pathname: '/cardio/sessao', params: { cardioSessionId: String(created.id) } });
    } catch (err) {
      reportError('Erro ao iniciar cardio', err);
    }
  };

  const header = (
    <View className="pb-4 pt-2">
      <Label>{getWeekdayLabel(today)}</Label>
      <Text className="font-display text-4xl uppercase text-text">{formatDateNoWeekday(today)}</Text>
    </View>
  );

  // Sessão em andamento: troca o ScrollView interno de <Screen scrollable>
  // por KeyboardAwareScrollView (JS puro, sem módulo nativo) — ele mede a
  // altura do teclado e rola o campo focado (reps/carga das últimas séries)
  // pra cima dela automaticamente, nos dois SOs. `enableOnAndroid` é
  // obrigatório (por padrão a lib só age no iOS); `extraScrollHeight={120}`
  // mantém a mesma folga já usada no auto-scroll manual de input.tsx.
  if (todaySession) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <KeyboardAwareScrollView
          ref={kasvRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          enableOnAndroid
          extraScrollHeight={120}
        >
          {header}
          <SessionExecution session={todaySession} scrollRef={kasvRef} />
        </KeyboardAwareScrollView>
      </Screen>
    );
  }

  // Cardio em andamento (modo B) — substitui o DayPicker inteiro enquanto
  // durar (nunca os dois ao mesmo tempo, ver comentário em todayCardioSession
  // acima). Só um atalho pra continuar; o cronômetro/blocos/conclusão vivem
  // todos em cardio/sessao.tsx.
  if (todayCardioSession) {
    return (
      <Screen edges={['top', 'left', 'right']} scrollable scrollRef={scrollRef}>
        {header}
        <Card className="border-l-4 border-l-accent">
          <Text className="font-card-title text-lg text-text">Cardio em andamento</Text>
          <Label className="mt-1">Iniciado hoje</Label>
          <Button
            className="mt-3"
            onPress={() =>
              router.push({
                pathname: '/cardio/sessao',
                params: { cardioSessionId: String(todayCardioSession.id) },
              })
            }
          >
            Continuar
          </Button>
        </Card>
      </Screen>
    );
  }

  // Sem sessão hoje (DayPicker): mantém <Screen scrollable> como sempre —
  // não tem campo de texto pra focar aqui, então não precisa da lib nova.
  return (
    <Screen edges={['top', 'left', 'right']} scrollable scrollRef={scrollRef}>
      {header}

      {/* Dois cards grandes de entrada — Musculação e Cardio. Só aparecem
          aqui (nada em andamento): os dois modos são mutuamente exclusivos e
          tomam a tela inteira quando ativos (ver branches acima), então não
          há risco dos dois cards e uma sessão em andamento coexistirem. */}
      <View className="mb-6 mt-2 flex-row gap-3">
        <Pressable
          className="flex-1 items-center gap-3 rounded-xl border border-border bg-surface p-5"
          onPress={() => scrollRef.current?.scrollTo({ y: 200, animated: true })}>
          <View
            className="h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: `${colors.accent}1A` }}>
            <Ionicons name="barbell-outline" size={28} color={colors.accent} />
          </View>
          <View className="items-center gap-1">
            <Text className="font-display text-base uppercase text-text">Musculação</Text>
            <Text className="text-center font-label text-xs text-muted">Escolha seu treino abaixo</Text>
          </View>
        </Pressable>

        <Pressable
          className="flex-1 items-center gap-3 rounded-xl border border-border bg-surface p-5"
          onPress={handleStartCardio}>
          <View
            className="h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: `${colors.accent}1A` }}>
            <Ionicons name="heart-outline" size={28} color={colors.accent} />
          </View>
          <View className="items-center gap-1">
            <Text className="font-display text-base uppercase text-text">Cardio</Text>
            <Text className="text-center font-label text-xs text-muted">Iniciar sessão de cardio</Text>
          </View>
        </Pressable>
      </View>

      <Text className="mb-3 font-label text-xs uppercase tracking-wide text-muted">Treinos de musculação</Text>

      <DayPicker onStart={handleStartDay} onStartLivre={handleStartLivre} todayStr={todayStr} />
      {dialog}
    </Screen>
  );
}

function DayPicker({
  onStart,
  onStartLivre,
  todayStr,
}: {
  onStart: (dayId: number) => void;
  onStartLivre: () => void;
  todayStr: string;
}) {
  // 'Treino pronto'/'Livre' são os planos efêmeros do "treinar agora"/"Treino
  // Livre" (ver TIPOS_PLANO_EFEMERO em src/db/ready-workouts.ts) — depois de
  // concluídos, o plano/dia continuam no banco (a sessão feita precisa deles
  // pro histórico), mas não podem oferecer reinício aqui (um dia "Treino
  // Livre" antigo não tem exercícios pra reiniciar — é sempre montado do
  // zero, nunca reaproveitado). Mesmo filtro já usado em planilhas.tsx pra
  // escondê-los da lista de planilhas; aqui esconde do seletor de "começar
  // treino". Não afeta WorkoutHistorySection nem métricas — nenhuma delas faz
  // join com workoutPlans, então continuam mostrando a sessão normalmente.
  const { data: days } = useLiveQuery(
    db
      .select({
        id: workoutDays.id,
        label: workoutDays.label,
        planNome: workoutPlans.nome,
      })
      .from(workoutDays)
      .innerJoin(workoutPlans, eq(workoutDays.planId, workoutPlans.id))
      .where(notInArray(workoutPlans.tipo, TIPOS_PLANO_EFEMERO))
  );

  const { data: exerciseCountRows } = useLiveQuery(
    db
      .select({ dayId: workoutDayExercises.dayId, count: sql<number>`count(*)` })
      .from(workoutDayExercises)
      .groupBy(workoutDayExercises.dayId)
  );

  const { data: lastTrainedRows } = useLiveQuery(
    db
      .select({ dayId: sessions.workoutDayId, lastData: sql<string>`max(${sessions.data})` })
      .from(sessions)
      .where(eq(sessions.concluida, true))
      .groupBy(sessions.workoutDayId)
  );

  const exerciseCountByDay = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of exerciseCountRows ?? []) map.set(row.dayId, Number(row.count));
    return map;
  }, [exerciseCountRows]);

  const lastTrainedByDay = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of lastTrainedRows ?? []) map.set(row.dayId, row.lastData);
    return map;
  }, [lastTrainedRows]);

  return (
    <View>
      <Text className="mb-3 font-card-title text-lg text-text">Qual treino você vai fazer hoje?</Text>

      {/* Sempre visível, antes da lista de dias — não depende de já ter
          nenhum plano cadastrado (é o oposto: começa do zero, exercício por
          exercício, ao vivo). Destacado com borda accent, mesmo padrão já
          usado noutros CTAs do app (ex: card "Montar com Atlas" em
          planilhas.tsx). */}
      <Pressable onPress={onStartLivre} className="mb-3">
        <Card className="flex-row items-center gap-3 border-l-4 border-l-accent">
          <Ionicons name="flash-outline" size={26} color={colors.accent} />
          <View className="flex-1">
            <Text className="font-display text-2xl uppercase text-text">Treine com um Amigo</Text>
            <Label className="mt-1">Monte exercício por exercício, na hora</Label>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Card>
      </Pressable>

      {(days ?? []).length === 0 && (
        <Text className="font-body text-muted">
          Nenhum dia de treino cadastrado ainda. Crie um plano na aba Planilhas.
        </Text>
      )}

      {(days ?? []).map((day) => {
        const exerciseCount = exerciseCountByDay.get(day.id) ?? 0;
        const lastTrained = lastTrainedByDay.get(day.id);
        const daysAgo = lastTrained ? daysBetween(lastTrained, todayStr) : null;

        return (
          <Pressable key={day.id} onPress={() => onStart(day.id)} className="mb-3">
            <Card>
              <Text className="font-display text-3xl uppercase text-text">{day.label}</Text>
              <Label className="mt-1">{day.planNome}</Label>

              <View className="mt-3 flex-row items-center justify-between">
                <Label>{`${exerciseCount} ${exerciseCount === 1 ? 'exercício' : 'exercícios'}`}</Label>
                {daysAgo !== null && (
                  <Label>{`Treinado há ${daysAgo} ${daysAgo === 1 ? 'dia' : 'dias'}`}</Label>
                )}
              </View>
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

type LogEntry = {
  id: number;
  numeroSerie: number;
  reps: number;
  carga: number;
  rpe: number | null;
  pesoCorporal: boolean;
  aquecimento: boolean;
};

type SessionExerciseItem = {
  kind: 'plano' | 'avulso';
  itemId: number; // workoutDayExercises.id (plano) ou sessionExtraExercises.id (avulso)
  exerciseId: number;
  exerciseWgerId: number;
  exerciseNome: string;
  categoria: string;
  seriesAlvo: number;
  repsAlvo: number;
  cargaAlvo: number | null;
  skipped: boolean;
  skipId: number | null; // sessionSkips.id, só quando skipped
  supersetGroup: string | null;
  isFirstInSupersetGroup: boolean;
  isLastInSupersetGroup: boolean;
  equipamento: string; // JSON serializado, tipo '["Barra"]' — parseado sob demanda
  dica: string | null;
  musculos: string; // JSON serializado, tipo '["Peitoral","Deltoide anterior"]' — parseado sob demanda
};

function itemsEqual(a: SessionExerciseItem, b: SessionExerciseItem) {
  return (
    a.kind === b.kind &&
    a.itemId === b.itemId &&
    a.exerciseId === b.exerciseId &&
    a.exerciseWgerId === b.exerciseWgerId &&
    a.exerciseNome === b.exerciseNome &&
    a.categoria === b.categoria &&
    a.seriesAlvo === b.seriesAlvo &&
    a.repsAlvo === b.repsAlvo &&
    a.cargaAlvo === b.cargaAlvo &&
    a.skipped === b.skipped &&
    a.skipId === b.skipId &&
    a.supersetGroup === b.supersetGroup &&
    a.isFirstInSupersetGroup === b.isFirstInSupersetGroup &&
    a.isLastInSupersetGroup === b.isLastInSupersetGroup &&
    a.equipamento === b.equipamento &&
    a.dica === b.dica &&
    a.musculos === b.musculos
  );
}

function SessionExecution({
  session,
  scrollRef,
}: {
  session: Session;
  scrollRef: RefObject<KeyboardAwareScrollView | null>;
}) {
  const router = useRouter();
  const now = useNow(1000);
  const { confirm, dialog } = useConfirmDialog();

  // Rola pro topo só na TRANSIÇÃO false→true (o momento exato de concluir) —
  // nunca ao montar já concluída (reabrir o app/voltar pra aba com o treino
  // de hoje já feito não deve empurrar o scroll) nem ao reabrir (`concluida`
  // volta pra false, a condição abaixo não bate). `prevConcluidaRef` guarda o
  // valor anterior fora do ciclo de render pra distinguir "acabou de mudar"
  // de "já chegou assim". Independente da celebração de PR (efeito
  // separado): o scroll anima o conteúdo por baixo, o overlay (se houver)
  // aparece por cima — quando o usuário fecha a celebração, a tela já está
  // no topo mostrando o card "Treino concluído".
  // `scrollToPosition(x, y, animated)`, não `.scrollTo({y, animated})` — a
  // instância exposta pelo ref do KeyboardAwareScrollView NÃO é um ScrollView
  // nativo, é a classe wrapper da lib (ver node_modules/.../index.d.ts:
  // ScrollableComponent), que só expõe scrollToPosition/scrollToEnd/etc.
  const prevConcluidaRef = useRef(session.concluida);
  useEffect(() => {
    const wasConcluida = prevConcluidaRef.current;
    prevConcluidaRef.current = session.concluida;
    if (!wasConcluida && session.concluida) {
      scrollRef.current?.scrollToPosition(0, 0, true);
    }
  }, [session.concluida, scrollRef]);

  const { data: dayRows } = useLiveQuery(
    db
      .select({ label: workoutDays.label, planTipo: workoutPlans.tipo })
      .from(workoutDays)
      .innerJoin(workoutPlans, eq(workoutDays.planId, workoutPlans.id))
      .where(eq(workoutDays.id, session.workoutDayId)),
    [session.workoutDayId]
  );
  const dayLabel = dayRows?.[0]?.label ?? '';
  // Sessão de Treino Livre — muda o texto/opções de fim de sessão abaixo
  // (Salvar como treino / Só registrar no histórico / Descartar), mas nada
  // mais no resto da tela: SessionExecution já renderiza normalmente uma
  // sessão sem nenhum workoutDayExercises (só sessionExtraExercises).
  const isTreinoLivre = dayRows?.[0]?.planTipo === 'Livre';

  const { data: dayExerciseRows } = useLiveQuery(
    db
      .select({
        id: workoutDayExercises.id,
        exerciseId: workoutDayExercises.exerciseId,
        seriesAlvo: workoutDayExercises.seriesAlvo,
        repsAlvo: workoutDayExercises.repsAlvo,
        cargaAlvo: workoutDayExercises.cargaAlvo,
        ordem: workoutDayExercises.ordem,
        supersetGroup: workoutDayExercises.supersetGroup,
        exerciseNome: exercises.nome,
        exerciseWgerId: exercises.wgerId,
        categoria: exercises.categoria,
        equipamento: exercises.equipamento,
        dica: exercises.dica,
        musculos: exercises.musculos,
      })
      .from(workoutDayExercises)
      .innerJoin(exercises, eq(workoutDayExercises.exerciseId, exercises.id))
      .where(eq(workoutDayExercises.dayId, session.workoutDayId))
      .orderBy(workoutDayExercises.ordem),
    [session.workoutDayId]
  );

  const { data: extraExerciseRows } = useLiveQuery(
    db
      .select({
        id: sessionExtraExercises.id,
        exerciseId: sessionExtraExercises.exerciseId,
        seriesAlvo: sessionExtraExercises.seriesAlvo,
        repsAlvo: sessionExtraExercises.repsAlvo,
        cargaAlvo: sessionExtraExercises.cargaAlvo,
        exerciseNome: exercises.nome,
        exerciseWgerId: exercises.wgerId,
        categoria: exercises.categoria,
        equipamento: exercises.equipamento,
        dica: exercises.dica,
        musculos: exercises.musculos,
      })
      .from(sessionExtraExercises)
      .innerJoin(exercises, eq(sessionExtraExercises.exerciseId, exercises.id))
      .where(eq(sessionExtraExercises.sessionId, session.id)),
    [session.id]
  );

  const { data: skipRows } = useLiveQuery(
    db.select().from(sessionSkips).where(eq(sessionSkips.sessionId, session.id)),
    [session.id]
  );

  const { data: logs } = useLiveQuery(
    db.select().from(setLogs).where(eq(setLogs.sessionId, session.id)),
    [session.id]
  );

  // Blocos de cardio registrados dentro deste treino de força (modo A) —
  // ver src/app/sessao/adicionar-cardio.tsx. Query própria, independente de
  // `logs`/`setLogs` (tabela diferente).
  const { data: cardioBlocks } = useLiveQuery(
    db.select().from(cardioLogs).where(eq(cardioLogs.sessionId, session.id)),
    [session.id]
  );

  // Sliced per exercise (not one shared Map) so a memoized ExerciseSessionCard
  // can bail out of re-rendering when a sibling exercise's log changes —
  // passing the same big Map to every card would defeat memoization, since
  // useLiveQuery hands back a new Map-worthy array on every write.
  const logsByExercise = useMemo(() => {
    const map = new Map<number, LogEntry[]>();
    for (const log of logs ?? []) {
      const list = map.get(log.exerciseId) ?? [];
      list.push({
        id: log.id,
        numeroSerie: log.numeroSerie,
        reps: log.reps,
        carga: log.carga,
        rpe: log.rpe,
        pesoCorporal: log.pesoCorporal,
        aquecimento: log.aquecimento,
      });
      map.set(log.exerciseId, list);
    }
    return map;
  }, [logs]);

  const skipByDayExerciseId = useMemo(() => {
    const map = new Map<number, number>(); // workoutDayExerciseId -> sessionSkips.id
    for (const row of skipRows ?? []) map.set(row.workoutDayExerciseId, row.id);
    return map;
  }, [skipRows]);

  const items: SessionExerciseItem[] = useMemo(() => {
    // Grupo de supersérie identificado só por rótulo dentro do dia (nunca por
    // adjacência) — o usuário pode, em tese, agrupar exercícios que não estão
    // lado a lado na ordem, então "primeiro/último do grupo" vem do menor/maior
    // `ordem` entre os membros, não da posição no array.
    const groupMinOrdem = new Map<string, number>();
    const groupMaxOrdem = new Map<string, number>();
    for (const ex of dayExerciseRows ?? []) {
      if (ex.supersetGroup == null) continue;
      const currentMin = groupMinOrdem.get(ex.supersetGroup);
      if (currentMin === undefined || ex.ordem < currentMin) groupMinOrdem.set(ex.supersetGroup, ex.ordem);
      const currentMax = groupMaxOrdem.get(ex.supersetGroup);
      if (currentMax === undefined || ex.ordem > currentMax) groupMaxOrdem.set(ex.supersetGroup, ex.ordem);
    }

    const planItems: SessionExerciseItem[] = (dayExerciseRows ?? []).map((ex) => {
      const skipId = skipByDayExerciseId.get(ex.id) ?? null;
      return {
        kind: 'plano',
        itemId: ex.id,
        exerciseId: ex.exerciseId,
        exerciseWgerId: ex.exerciseWgerId,
        exerciseNome: ex.exerciseNome,
        categoria: ex.categoria,
        seriesAlvo: ex.seriesAlvo,
        repsAlvo: ex.repsAlvo,
        cargaAlvo: ex.cargaAlvo,
        skipped: skipId !== null,
        skipId,
        supersetGroup: ex.supersetGroup,
        isFirstInSupersetGroup: ex.supersetGroup == null ? true : ex.ordem === groupMinOrdem.get(ex.supersetGroup),
        isLastInSupersetGroup: ex.supersetGroup == null ? true : ex.ordem === groupMaxOrdem.get(ex.supersetGroup),
        equipamento: ex.equipamento,
        dica: ex.dica,
        musculos: ex.musculos,
      };
    });
    const extraItems: SessionExerciseItem[] = (extraExerciseRows ?? []).map((ex) => ({
      kind: 'avulso',
      itemId: ex.id,
      exerciseId: ex.exerciseId,
      exerciseWgerId: ex.exerciseWgerId,
      exerciseNome: ex.exerciseNome,
      categoria: ex.categoria,
      seriesAlvo: ex.seriesAlvo,
      repsAlvo: ex.repsAlvo,
      cargaAlvo: ex.cargaAlvo,
      skipped: false,
      skipId: null,
      supersetGroup: null,
      isFirstInSupersetGroup: true,
      isLastInSupersetGroup: true,
      equipamento: ex.equipamento,
      dica: ex.dica,
      musculos: ex.musculos,
    }));
    return [...planItems, ...extraItems];
  }, [dayExerciseRows, extraExerciseRows, skipByDayExerciseId]);

  const activeItems = items.filter((item) => !item.skipped);
  const totalSeries = activeItems.reduce((sum, item) => sum + item.seriesAlvo, 0);
  // Aquecimento não conta como série de trabalho concluída — a barra mostra
  // progresso de séries de TRABALHO, mesmo critério de volume/PR/análise
  // (ver ExerciseSessionCard.completedCount, que segue a mesma regra).
  const completedSeries = activeItems.reduce(
    (sum, item) =>
      sum +
      Math.min(
        logsByExercise.get(item.exerciseId)?.filter((log) => !log.aquecimento).length ?? 0,
        item.seriesAlvo
      ),
    0
  );

  // Volume total em kg (Σ reps×carga), excluindo peso corporal E aquecimento
  // — mesma regra já aplicada nos cálculos de Progresso (carga 0 por
  // convenção não é carga real; aquecimento não é série de trabalho). `logs`
  // já é a query única de set_logs da sessão, sem query nova.
  const volumeKg = useMemo(
    () =>
      Math.round(
        (logs ?? [])
          .filter((log) => !log.pesoCorporal && !log.aquecimento)
          .reduce((sum, log) => sum + log.reps * log.carga, 0)
      ),
    [logs]
  );

  // Grupos musculares treinados — soma séries FEITAS (não alvo, excluindo
  // aquecimento) por músculo, pra cada exercício ativo, e ordena por
  // relevância (mais séries primeiro). Tudo já em memória (items +
  // logsByExercise), sem query nova. Top 4 pra não poluir o card — um full
  // body facilmente passa disso.
  const grupos = useMemo(() => {
    const seriesByMuscle = new Map<string, number>();
    for (const item of activeItems) {
      const seriesFeitas = logsByExercise.get(item.exerciseId)?.filter((log) => !log.aquecimento).length ?? 0;
      if (seriesFeitas === 0) continue;
      let musculosList: string[];
      try {
        musculosList = JSON.parse(item.musculos);
      } catch {
        musculosList = [];
      }
      for (const musculo of musculosList) {
        seriesByMuscle.set(musculo, (seriesByMuscle.get(musculo) ?? 0) + seriesFeitas);
      }
    }
    return [...seriesByMuscle.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label]) => label);
  }, [activeItems, logsByExercise]);

  // PR da sessão: cálculo assíncrono (findSessionPrs consulta o banco), então
  // não dá pra fazer num useMemo síncrono como o resto das métricas. Roda
  // sempre que a sessão é concluída (ou reconcluída, depois de reabrir) e
  // guarda o resultado em estado — pelo tempo em que isso resolve, o usuário
  // ainda não teria como ter tocado no botão de compartilhar (só aparece com
  // session.concluida), mas o botão também fica desabilitado até `prReady`
  // por garantia (mesma lógica de `cardReady` abaixo, unidas no disabled).
  // `sessionPrs` guarda a lista INTEIRA (não só o destaque) — é a mesma
  // chamada de sempre, só não descarta o resto do array; alimenta a
  // celebração de PR logo abaixo, sem consultar o banco de novo.
  const [sessionPrs, setSessionPrs] = useState<SessionPr[]>([]);
  const [prDestaque, setPrDestaque] = useState<{ exerciseNome: string; cargaNova: number } | null>(null);
  const [prReady, setPrReady] = useState(false);
  useEffect(() => {
    if (!session.concluida) {
      setPrReady(false);
      return;
    }
    let cancelled = false;
    setPrReady(false);
    findSessionPrs(session.id)
      .then((prs) => {
        if (cancelled) return;
        setSessionPrs(prs);
        const best = pickHighlightPr(prs);
        setPrDestaque(best ? { exerciseNome: best.exerciseNome, cargaNova: best.cargaNova } : null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Falha ao calcular recorde da sessão:', err);
        setSessionPrs([]);
        setPrDestaque(null);
      })
      .finally(() => {
        if (!cancelled) setPrReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session.concluida, session.id]);

  // Celebração de PR: dispara quando o cálculo assíncrono acima FICA PRONTO
  // pra uma sessão recém-concluída (reage a `prReady`, não ao toque em
  // "Concluir treino" — o resultado só existe depois que a consulta volta).
  // `celebrationShown` é o guard de "uma celebração por evento de conclusão":
  // um segundo efeito reseta esse guard sempre que a sessão SAI do estado
  // concluído (handleReopen) — então reabrir e concluir de novo libera uma
  // nova celebração (com PR novo ou não: se não houver PR na reconclusão,
  // `sessionPrs` fica vazio e o efeito abaixo simplesmente não dispara).
  // Sessão fora-da-academia já vem coberta de graça: `findSessionPrs` retorna
  // `[]` pra ela (ver personal-records.ts), então `sessionPrs.length === 0` e
  // a celebração nunca abre, sem checagem extra aqui.
  const [celebrationShown, setCelebrationShown] = useState(false);
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  useEffect(() => {
    if (!session.concluida) setCelebrationShown(false);
  }, [session.concluida]);
  useEffect(() => {
    if (!session.concluida || !prReady || celebrationShown) return;
    if (sessionPrs.length === 0) return;
    setCelebrationVisible(true);
    setCelebrationShown(true);
  }, [session.concluida, prReady, celebrationShown, sessionPrs]);
  const handleDismissCelebration = useCallback(() => setCelebrationVisible(false), []);

  // Marcador "esta semana" — dias com sessão concluída (segunda-domingo).
  // Query enxuta e reativa (mesmo padrão de summary-stats-section.tsx: só
  // `sessions.data` de sessões concluídas, sem join) — SessionExecution só
  // tem dados escopados à sessão atual até aqui, essa é a única nova.
  const { data: concludedSessionRows } = useLiveQuery(
    db.select({ data: sessions.data }).from(sessions).where(eq(sessions.concluida, true))
  );
  const diasSemana = useMemo(() => {
    const weekStartIso = getWeekStartIso(getTodayDateString());
    return computeTrainedDaysInWeek((concludedSessionRows ?? []).map((row) => row.data), weekStartIso);
  }, [concludedSessionRows]);
  const indiceHoje = useMemo(
    () => daysBetween(getWeekStartIso(getTodayDateString()), getTodayDateString()),
    []
  );

  // Métricas do card de compartilhamento — tudo já em memória (nenhuma query
  // nova pras métricas síncronas): duração igual ao Label visível acima,
  // séries reaproveita `completedSeries` (o mesmo número já mostrado na
  // barra de progresso, pra nunca divergir do que a tela exibe), exercícios
  // conta só os ativos (não pulados). `prDestaque` vem do estado assíncrono
  // acima, já resolvido pelo momento em que o botão libera (ver `prReady`).
  const shareMetrics: WorkoutShareMetrics = useMemo(
    () => ({
      dayLabel,
      dateLabel: formatShortDateLabel(session.data),
      durationLabel:
        session.horaInicio != null && session.horaFim != null
          ? formatElapsed(session.horaFim - session.horaInicio)
          : null,
      volumeKg,
      totalSeries: completedSeries,
      totalExercises: activeItems.length,
      grupos,
      prDestaque,
      sessionPrs,
      diasSemana,
      indiceHoje,
    }),
    [
      dayLabel,
      session.data,
      session.horaInicio,
      session.horaFim,
      volumeKg,
      completedSeries,
      activeItems.length,
      grupos,
      prDestaque,
      sessionPrs,
      diasSemana,
      indiceHoje,
    ]
  );

  // O card fica sempre montado (fora da tela, ver render abaixo) desde que a
  // sessão existe, recalculando as métricas a cada mudança. Mesmo assim,
  // `captureRef` (view-shot) espera pelo menos um onLayout antes da view
  // estar pronta pra captura — `cardReady` (setado no onLayout do card)
  // desabilita o botão de compartilhar até lá, então nunca dá pra tocar
  // antes da hora (na prática isso já é verdade antes do primeiro render do
  // próprio botão, já que ele só aparece quando session.concluida). `prReady`
  // soma a mesma trava pro cálculo assíncrono do PR (ver acima).
  const shareCardRef = useRef<View>(null);
  const [cardReady, setCardReady] = useState(false);

  // Segundo card off-screen (Etapa B, estilo 'minimalista') — mesmo
  // raciocínio do card completo acima: montado sempre que a sessão existe,
  // `cardMinimalReady` (onLayout) trava a captura até o 1º layout assentar.
  // Os DOIS cards ficam sempre montados (nunca só o do estilo selecionado no
  // momento) — trocar de estilo no modal não precisa esperar nenhum layout
  // novo, só reflete a escolha já pronta.
  const shareCardMinimalRef = useRef<View>(null);
  const [cardMinimalReady, setCardMinimalReady] = useState(false);

  // Terceiro card off-screen (Etapa C, estilo 'foto') — mesmo raciocínio dos
  // outros 2, com uma diferença: só é MONTADO quando há uma foto escolhida
  // (`shareOptions.fotoUri !== null`, ver render abaixo) — sem foto não há
  // nada útil pra capturar, então nem faz sentido pagar o custo de montar o
  // componente. `cardPhotoReady` fica `false` sempre que o card não está
  // montado (sem foto), sem precisar de reset manual — é só um `useState`
  // que nunca recebe `true` enquanto o `onLayout` correspondente não roda.
  const shareCardPhotoRef = useRef<View>(null);
  const [cardPhotoReady, setCardPhotoReady] = useState(false);

  // Opções de personalização (WorkoutShareModal, `src/components/share/`) —
  // os cards off-screen abaixo recebem esse mesmo estado, então a imagem
  // capturada sempre reflete a última escolha confirmada no modal. Fica em
  // DEFAULT_SHARE_OPTIONS (estilo 'completo', tudo ligado, PR automático,
  // sem foto) até o usuário personalizar e tocar "Compartilhar" no modal.
  const [shareOptions, setShareOptions] = useState<WorkoutShareOptions>(DEFAULT_SHARE_OPTIONS);
  const [shareModalVisible, setShareModalVisible] = useState(false);

  // Botão "Compartilhar treino" só habilita quando o card do estilo
  // ATUALMENTE selecionado (shareOptions.estilo — o que o modal vai abrir já
  // mostrando) está pronto; os outros estilos podem ainda não ter tido seu
  // 1º onLayout e não bloqueiam nada, já que só entram em jogo se o usuário
  // trocar de estilo dentro do modal (nesse ponto, os cards 'completo' e
  // 'minimalista' já estão montados há tempo suficiente pra essa troca
  // raramente esbarrar num "ready" ainda falso — na prática, os onLayout dos
  // 2 cards off-screen sempre montados dispararam juntos, logo no primeiro
  // render da sessão; já 'foto' só fica pronto depois que o usuário escolhe
  // uma imagem E ela termina de carregar, então o gate É esperado ali).
  const selectedCardReady =
    shareOptions.estilo === 'minimalista'
      ? cardMinimalReady
      : shareOptions.estilo === 'foto'
        ? cardPhotoReady
        : cardReady;

  const handleOpenShareModal = useCallback(() => setShareModalVisible(true), []);

  // Espelham cardReady/cardMinimalReady/cardPhotoReady em refs — necessário
  // porque `handleConfirmShare` abaixo é um `useCallback` com deps `[]` (não
  // muda de identidade a cada render), então uma leitura direta dos 3
  // `useState` ali dentro sempre veria o valor CONGELADO do primeiro render
  // (`false`), nunca a atualização real. Ref sempre reflete o valor mais
  // recente, sem precisar recriar o callback.
  const cardReadyRef = useRef(cardReady);
  useEffect(() => {
    cardReadyRef.current = cardReady;
  }, [cardReady]);
  const cardMinimalReadyRef = useRef(cardMinimalReady);
  useEffect(() => {
    cardMinimalReadyRef.current = cardMinimalReady;
  }, [cardMinimalReady]);
  const cardPhotoReadyRef = useRef(cardPhotoReady);
  useEffect(() => {
    cardPhotoReadyRef.current = cardPhotoReady;
  }, [cardPhotoReady]);

  // Confirmação vinda do modal: grava as opções escolhidas (os cards off-
  // screen só reagem a essa mudança no próximo render deles) e SÓ DEPOIS
  // captura. O duplo rAF garante só que a NOVA árvore assentou no lado
  // nativo (mesmo padrão de src/components/ui/input.tsx) — suficiente pros
  // estilos 'completo'/'minimalista', que não têm nada assíncrono pra
  // esperar (os 2 cards ficam sempre montados desde o início da sessão, ver
  // comentário de cardMinimalReady acima). NÃO é suficiente pro estilo
  // 'foto': o card off-screen dela só é MONTADO agora (`setShareOptions`
  // logo abaixo, primeira vez que `fotoUri` deixa de ser `null`), e a
  // decodificação da <Image> é assíncrona — pode facilmente passar dos 2
  // frames do rAF, o que fazia o captureRef rasterizar o card ainda sem a
  // foto pintada (bug real: fica sem foto na imagem final, de forma
  // intermitente — mais rápido em foto já cacheada, mais lento numa nova).
  // Por isso, depois do rAF, espera ATIVAMENTE (poll curto) o gate do
  // estilo escolhido ficar `true`, com um teto de segurança
  // (CAPTURE_READY_TIMEOUT_MS) pra nunca travar o compartilhamento pra
  // sempre se a foto falhar ao carregar — nesse caso extremo, captura assim
  // mesmo (mesmo comportamento de antes pra esse caso raro).
  const handleConfirmShare = useCallback(async (options: WorkoutShareOptions) => {
    setShareOptions(options);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const readyRef =
      options.estilo === 'minimalista'
        ? cardMinimalReadyRef
        : options.estilo === 'foto'
          ? cardPhotoReadyRef
          : cardReadyRef;
    const waitStartedAt = Date.now();
    while (!readyRef.current && Date.now() - waitStartedAt < CAPTURE_READY_TIMEOUT_MS) {
      await new Promise<void>((resolve) => setTimeout(resolve, CAPTURE_READY_POLL_MS));
    }

    const ref =
      options.estilo === 'minimalista'
        ? shareCardMinimalRef
        : options.estilo === 'foto'
          ? shareCardPhotoRef
          : shareCardRef;
    const width =
      options.estilo === 'minimalista'
        ? SHARE_CARD_MINIMAL_SIZE
        : options.estilo === 'foto'
          ? SHARE_CARD_PHOTO_WIDTH
          : SHARE_CARD_WIDTH;
    const height =
      options.estilo === 'minimalista'
        ? SHARE_CARD_MINIMAL_SIZE
        : options.estilo === 'foto'
          ? SHARE_CARD_PHOTO_HEIGHT
          : SHARE_CARD_HEIGHT;
    await shareWorkoutImage(ref, width, height);
    setShareModalVisible(false);
  }, []);

  // Marcável/desmarcável a qualquer momento (durante o treino ou já
  // concluído — o toggle no cabeçalho, abaixo, fica sempre visível e ativo
  // nos dois estados, então não precisa de um segundo controle no card de
  // conclusão). `session` vem de useLiveQuery, então a tela reflete na hora.
  const handleToggleForaDaAcademia = async () => {
    try {
      await db
        .update(sessions)
        .set({ foraDaAcademia: !session.foraDaAcademia })
        .where(eq(sessions.id, session.id));
    } catch (err) {
      reportError('Erro ao marcar sessão', err);
    }
  };

  const handleComplete = async () => {
    try {
      await db
        .update(sessions)
        .set({
          concluida: true,
          restTimerStartedAt: null,
          // Só grava horaFim na primeira conclusão — reconcluir um treino
          // reaberto preserva o horário original, senão a duração fica
          // inflada pelo tempo que a sessão ficou reaberta parada.
          ...(session.horaFim == null ? { horaFim: Date.now() } : {}),
        })
        .where(eq(sessions.id, session.id));
      await cancelRestEndNotification();
    } catch (err) {
      reportError('Erro ao concluir treino', err);
    }
  };

  // Só pra sessão de Treino Livre (botão gated por `isTreinoLivre` abaixo) —
  // promove os exercícios avulsos desta sessão (sessionExtraExercises) a um
  // plano NORMAL e reutilizável (`tipo: 'Pronto'`, mesmo caminho que
  // "Salvar como plano" já usa pros treinos rápidos do Atlas —
  // criarESalvarComExercicios, reaproveitada sem mudança). Dedup por
  // exerciseId mantendo a 1ª aparição é defensivo: sessao/adicionar-
  // exercicio.tsx já impede duplicar o mesmo exercício numa sessão, então
  // isso raramente muda algo na prática. Marca a sessão concluída também —
  // "salvar como treino" é uma forma de ENCERRAR o Treino Livre de hoje,
  // não uma ação à parte; a sessão em si continua vinculada ao dia efêmero
  // 'Livre' original (o plano novo é só um molde pra próxima vez).
  const handleSalvarComoTreino = async () => {
    try {
      const extraRows = await db
        .select({
          exerciseId: sessionExtraExercises.exerciseId,
          seriesAlvo: sessionExtraExercises.seriesAlvo,
          repsAlvo: sessionExtraExercises.repsAlvo,
        })
        .from(sessionExtraExercises)
        .where(eq(sessionExtraExercises.sessionId, session.id))
        .orderBy(sessionExtraExercises.ordem);

      const vistos = new Set<number>();
      const exerciciosUnicos = extraRows.filter((row) => {
        if (vistos.has(row.exerciseId)) return false;
        vistos.add(row.exerciseId);
        return true;
      });

      if (exerciciosUnicos.length === 0) {
        Alert.alert('Nada pra salvar', 'Adicione pelo menos um exercício antes de salvar como treino.');
        return;
      }

      const nomePlano = `Treine com um Amigo — ${formatShortDateLabel(session.data)}`;
      const planId = criarESalvarComExercicios(nomePlano, exerciciosUnicos);

      await db
        .update(sessions)
        .set({
          concluida: true,
          restTimerStartedAt: null,
          ...(session.horaFim == null ? { horaFim: Date.now() } : {}),
        })
        .where(eq(sessions.id, session.id));
      await cancelRestEndNotification();

      router.push({ pathname: '/plano/[id]', params: { id: String(planId) } });
    } catch (err) {
      reportError('Erro ao salvar como treino', err);
    }
  };

  const handleReopen = async () => {
    const ok = await confirm({
      title: 'Reabrir treino?',
      message: 'O treino volta pro estado editável — você poderá corrigir séries, cargas e exercícios, e concluir de novo.',
      confirmLabel: 'Reabrir',
    });
    if (!ok) return;
    try {
      await db.update(sessions).set({ concluida: false }).where(eq(sessions.id, session.id));
    } catch (err) {
      reportError('Erro ao reabrir treino', err);
    }
  };

  const handleCancel = async () => {
    const ok = await confirm({
      title: 'Cancelar sessão',
      message: 'Isso apaga o treino de hoje e os registros feitos. Deseja continuar?',
      confirmLabel: 'Apagar',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      // cardioLogs entra aqui também (Cardio, Etapa B) — referencia
      // sessions.id (modo A), então precisa sumir antes da sessão,
      // mesma ordem filho-antes-do-pai do resto desta função.
      await db.delete(cardioLogs).where(eq(cardioLogs.sessionId, session.id));
      await db.delete(setLogs).where(eq(setLogs.sessionId, session.id));
      await db.delete(sessionExtraExercises).where(eq(sessionExtraExercises.sessionId, session.id));
      await db.delete(sessionSkips).where(eq(sessionSkips.sessionId, session.id));
      await db.delete(sessions).where(eq(sessions.id, session.id));
    } catch (err) {
      reportError('Erro ao cancelar sessão', err);
    }
  };

  const handleDeleteCardio = async (id: number) => {
    const ok = await confirm({
      title: 'Remover bloco de cardio',
      message: 'Remover este bloco de cardio?',
      confirmLabel: 'Remover',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await db.delete(cardioLogs).where(eq(cardioLogs.id, id));
    } catch (err) {
      reportError('Erro ao remover cardio', err);
    }
  };

  const handleSkip = useCallback(
    async (workoutDayExerciseId: number) => {
      try {
        await db.insert(sessionSkips).values({ sessionId: session.id, workoutDayExerciseId });
      } catch (err) {
        reportError('Erro ao pular exercício', err);
      }
    },
    [session.id]
  );

  const handleUnskip = useCallback(async (skipId: number) => {
    try {
      await db.delete(sessionSkips).where(eq(sessionSkips.id, skipId));
    } catch (err) {
      reportError('Erro ao desfazer', err);
    }
  }, []);

  // `confirm` (do useConfirmDialog acima) não entra nas deps de propósito —
  // mesmo raciocínio de handleUnskip logo abaixo: não referencia estado
  // nenhum que fique desatualizado entre renders (só chama setState, que o
  // React garante estável), então manter `[]` evita recriar esta função a
  // cada render só porque `confirm` também é recriado a cada render.
  const handleRemoveExtra = useCallback(async (extraId: number, hasLogs: boolean) => {
    if (hasLogs) {
      const ok = await confirm({
        title: 'Remover exercício',
        message:
          'Esse exercício já tem séries registradas nesta sessão. Remover não apaga o que já foi salvo, só tira o card daqui. Continuar?',
        confirmLabel: 'Remover',
        variant: 'destructive',
      });
      if (!ok) return;
    }
    try {
      await db.delete(sessionExtraExercises).where(eq(sessionExtraExercises.id, extraId));
    } catch (err) {
      reportError('Erro ao remover exercício', err);
    }
  }, []);

  // Sugestão é sempre recalculada a cada novo início de descanso (nunca herda a
  // duração do exercício anterior na mesma sessão) — +30/-30 continuam ajustando
  // só aquele descanso específico depois de iniciado.
  const startRestTimer = useCallback(
    async (suggestedSeconds: number) => {
      try {
        await db
          .update(sessions)
          .set({
            restTimerStartedAt: Date.now(),
            restTimerDurationSeconds: suggestedSeconds,
          })
          .where(eq(sessions.id, session.id));
        const granted = await ensureRestNotificationPermission();
        if (granted) await scheduleRestEndNotification(suggestedSeconds);
      } catch (err) {
        reportError('Erro ao iniciar descanso', err);
      }
    },
    [session.id]
  );

  const adjustRestTimer = useCallback(
    async (deltaSeconds: number) => {
      const current = session.restTimerDurationSeconds ?? DEFAULT_REST_SECONDS;
      const next = Math.max(15, current + deltaSeconds);
      try {
        await db.update(sessions).set({ restTimerDurationSeconds: next }).where(eq(sessions.id, session.id));
        if (session.restTimerStartedAt != null) {
          const elapsedSeconds = (Date.now() - session.restTimerStartedAt) / 1000;
          await scheduleRestEndNotification(next - elapsedSeconds);
        }
      } catch (err) {
        reportError('Erro ao ajustar descanso', err);
      }
    },
    [session.id, session.restTimerDurationSeconds, session.restTimerStartedAt]
  );

  const cancelRestTimer = useCallback(async () => {
    try {
      await db.update(sessions).set({ restTimerStartedAt: null }).where(eq(sessions.id, session.id));
      await cancelRestEndNotification();
    } catch (err) {
      reportError('Erro ao cancelar descanso', err);
    }
  }, [session.id]);

  const restRemaining =
    session.restTimerStartedAt != null
      ? (session.restTimerDurationSeconds ?? DEFAULT_REST_SECONDS) - (now - session.restTimerStartedAt) / 1000
      : null;

  // Depende do booleano (não de `restRemaining` bruto, que muda a cada
  // segundo) — senão o efeito re-executaria a cada tick e cancelaria o timeout
  // de segurança antes da hora. Assim ele só dispara na transição pra "pronto"
  // e só limpa (cancela a vibração) na transição de volta pra null/reiniciado.
  const isRestDone = restRemaining !== null && restRemaining <= 0;
  useEffect(() => {
    if (!isRestDone) return;
    Vibration.vibrate(REST_DONE_VIBRATION_PATTERN, true);
    const safetyTimeout = setTimeout(() => Vibration.cancel(), REST_DONE_VIBRATION_MAX_MS);
    return () => {
      clearTimeout(safetyTimeout);
      Vibration.cancel();
    };
  }, [isRestDone]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      // `enabled={false}` nos dois SOs agora: quem envolve esta árvore (ver
      // HojeScreen) passou a ser o KeyboardAwareScrollView
      // (react-native-keyboard-aware-scroll-view), que já cobre iOS por
      // conta própria (escuta keyboardWillShow/Hide e ajusta contentInset +
      // rola o campo focado, sem precisar de `enableOnAndroid` pra isso — só
      // o Android depende dessa flag) e o Android via `enableOnAndroid` +
      // resize nativo (`softwareKeyboardLayoutMode: "resize"` no app.json).
      // Manter este KeyboardAvoidingView com `behavior="padding"` ativo no
      // iOS, POR CIMA do que a lib já faz, dobraria a compensação (padding
      // do KeyboardAvoidingView + contentInset do KeyboardAwareScrollView
      // reagindo ao mesmo evento de teclado) — por isso fica desligado nos
      // dois lados agora; o componente em si permanece só pra não precisar
      // duplicar o JSX que ele envolve.
      enabled={false}>
      {/* Escondido do usuário, mas DENTRO dos limites da tela — não a
          -9999pt de distância (o Android pula a pintura de views longe
          demais de qualquer viewport real, o que gerava PNG válido só que
          vazio/preto no captureRef). Antes havia também uma View de
          cobertura do tamanho da tela inteira (windowWidth/windowHeight)
          pra esconder o card visualmente — mas ela, mesmo "absoluta", ainda
          inflava a subárvore que o ScrollView usa pra medir onde rolar um
          campo focado até acima do teclado, confundindo esse cálculo (bug do
          teclado tampando carga/reps das últimas séries). `opacity: 0` no
          wrapper esconde o card sem criar nenhuma view do tamanho da tela —
          ele continua medido/deitado/pintado normalmente pelo Android
          (opacity, ao contrário de -9999pt ou display:none, não tira a view
          do pipeline de desenho, só zera o alpha na composição final na
          TELA). O `captureRef` não é afetado: ele mira o `ref` do PRÓPRIO
          WorkoutShareCard e desenha esse view diretamente num bitmap
          (`view.draw()`/`drawViewHierarchyInRect:`), sem passar pelo alpha
          do wrapper ancestral — só a composição na tela real usa esse
          alpha, não a captura. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, opacity: 0 }}>
        <WorkoutShareCard
          ref={shareCardRef}
          metrics={shareMetrics}
          options={shareOptions}
          onLayout={() => setCardReady(true)}
          style={{ position: 'absolute', top: 0, left: 0 }}
        />
      </View>

      {/* Segundo card off-screen (Etapa B, estilo 'minimalista') — mesma
          técnica exata do card completo acima (opacity:0 dentro dos limites
          reais da tela, nunca -9999pt, ver comentário longo acima). */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, opacity: 0 }}>
        <WorkoutShareCardMinimal
          ref={shareCardMinimalRef}
          metrics={shareMetrics}
          options={shareOptions}
          onLayout={() => setCardMinimalReady(true)}
          style={{ position: 'absolute', top: 0, left: 0 }}
        />
      </View>

      {/* Terceiro card off-screen (Etapa C, estilo 'foto') — só monta
          quando há uma foto escolhida (sem foto não há nada útil pra
          capturar; ver `cardPhotoReady` acima). Mesma técnica exata dos
          outros 2 cards (opacity:0 dentro dos limites reais da tela). */}
      {shareOptions.fotoUri != null && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, opacity: 0 }}>
          <WorkoutShareCardPhoto
            ref={shareCardPhotoRef}
            metrics={shareMetrics}
            options={shareOptions}
            onLayout={() => setCardPhotoReady(true)}
            style={{ position: 'absolute', top: 0, left: 0 }}
          />
        </View>
      )}

      <WorkoutShareModal
        visible={shareModalVisible}
        onClose={() => setShareModalVisible(false)}
        metrics={shareMetrics}
        sessionPrs={sessionPrs}
        onShare={handleConfirmShare}
      />

      <Text className="mb-1 font-display text-5xl uppercase text-text" numberOfLines={1}>
        {dayLabel}
      </Text>

      {session.horaInicio != null && (
        <Label className="mb-1">
          {session.concluida && session.horaFim != null
            ? `Duração: ${formatElapsed(session.horaFim - session.horaInicio)}`
            : `Em andamento: ${formatElapsed(now - session.horaInicio)}`}
        </Label>
      )}

      <Pressable
        onPress={handleToggleForaDaAcademia}
        className={`mb-1 mt-2 flex-row items-center gap-2 self-start rounded border px-3 py-1.5 ${
          session.foraDaAcademia ? 'border-accent bg-accent' : 'border-border bg-transparent'
        }`}>
        <Ionicons name="location-outline" size={14} color={session.foraDaAcademia ? '#fff' : colors.muted} />
        <Text
          className={`font-label text-xs uppercase tracking-wide ${
            session.foraDaAcademia ? 'text-white' : 'text-muted'
          }`}>
          Fora da minha academia
        </Text>
      </Pressable>
      {session.foraDaAcademia && (
        <Label className="mb-3 mt-1 text-muted">
          As cargas sugeridas são da sua academia principal — esta sessão não entra nas comparações.
        </Label>
      )}

      {session.concluida && (
        <Card className="mb-4 mt-3 border-l-4 border-l-success">
          <Text className="text-center font-label uppercase text-success">Treino concluído</Text>
        </Card>
      )}

      {session.concluida && (
        <Button variant="secondary" className="mb-3" onPress={handleReopen}>
          Reabrir treino
        </Button>
      )}

      {session.concluida && (
        <Button className="mb-4" disabled={!selectedCardReady || !prReady} onPress={handleOpenShareModal}>
          <View className="flex-row items-center gap-2">
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text className="font-label text-sm uppercase tracking-wide text-white">Compartilhar treino</Text>
          </View>
        </Button>
      )}

      <View className="mb-6 mt-4">
        <Text className="font-display text-2xl text-text">
          {completedSeries}
          <Text className="text-muted">/{totalSeries}</Text>
          <Text className="font-label text-sm uppercase text-muted"> séries</Text>
        </Text>
        <ProgressBar
          className="mt-2"
          progress={totalSeries > 0 ? completedSeries / totalSeries : 0}
        />
      </View>

      {restRemaining !== null && (
        <RestTimerOverlay
          restRemaining={restRemaining}
          onAdjust={adjustRestTimer}
          onDismiss={cancelRestTimer}
        />
      )}

      {celebrationVisible && <PrCelebrationOverlay prs={sessionPrs} onDismiss={handleDismissCelebration} />}

      {items.map((item) => (
        <ExerciseSessionCard
          key={`${item.kind}-${item.itemId}`}
          item={item}
          sessionId={session.id}
          sessionConcluded={session.concluida}
          logs={logsByExercise.get(item.exerciseId) ?? EMPTY_LOGS}
          onSkip={handleSkip}
          onUnskip={handleUnskip}
          onRemove={handleRemoveExtra}
          onRequestRest={startRestTimer}
        />
      ))}

      {(cardioBlocks ?? []).map((log) => {
        const modalidade = MODALIDADES_CARDIO.find((m) => m.key === log.modalidade);
        const intensidade = INTENSIDADES_CARDIO.find((i) => i.key === log.intensidade);
        const pace = formatPace(log.duracaoMin, log.distanciaKm);
        return (
          <Card key={log.id} className="mb-3 flex-row items-center gap-3 px-4 py-3">
            <Ionicons name={modalidade?.icon ?? 'fitness-outline'} size={20} color={colors.accent} />
            <View className="flex-1">
              <Text className="font-card-title text-sm text-text">{modalidade?.label ?? log.modalidade}</Text>
              <Text className="font-label text-xs text-muted">
                {`${log.duracaoMin} min${log.distanciaKm ? ` · ${log.distanciaKm}km` : ''}${
                  pace ? ` · ${pace}` : ''
                } · ${intensidade?.label ?? log.intensidade}`}
              </Text>
            </View>
            <Pressable onPress={() => handleDeleteCardio(log.id)} hitSlop={8}>
              <Ionicons name="close-outline" size={18} color={colors.muted} />
            </Pressable>
          </Card>
        );
      })}

      {!session.concluida && (
        <Button
          variant="secondary"
          className="mb-3"
          onPress={() =>
            router.push({ pathname: '/sessao/adicionar-exercicio', params: { sessionId: String(session.id) } })
          }
        >
          + Adicionar exercício
        </Button>
      )}

      {!session.concluida && (
        <Button
          variant="secondary"
          className="mb-4"
          onPress={() =>
            router.push({ pathname: '/sessao/adicionar-cardio', params: { sessionId: String(session.id) } })
          }
        >
          <View className="flex-row items-center gap-2">
            <Ionicons name="bicycle-outline" size={18} color={colors.muted} />
            <Text className="font-label text-sm uppercase tracking-wide text-muted">+ Cardio</Text>
          </View>
        </Button>
      )}

      {/* Só pra Treino Livre: promove sessionExtraExercises a um plano
          reutilizável (ver handleSalvarComoTreino) — uma 3ª forma de
          encerrar a sessão, ao lado de "concluir" (mantém só o plano
          efêmero) e "cancelar" (descarta tudo). Não aparece pra sessão
          normal — o plano dela já existe e é reutilizável por natureza. */}
      {!session.concluida && isTreinoLivre && (
        <Button variant="secondary" className="mb-3 py-4" onPress={handleSalvarComoTreino}>
          Salvar como treino
        </Button>
      )}

      {!session.concluida && (
        <Button onPress={handleComplete} className="mb-3 py-4">
          {isTreinoLivre ? 'Só registrar no histórico' : 'Concluir treino'}
        </Button>
      )}

      <Button variant="destructive" onPress={handleCancel}>
        {isTreinoLivre ? 'Descartar treino' : 'Cancelar sessão de hoje'}
      </Button>
      {dialog}
    </KeyboardAvoidingView>
  );
}

// Modal (React Native core, transparente) em vez de expo-blur: um novo pacote
// nativo só pro efeito de desfoque não valia a pena, e o próprio pedido já
// aceitava "escurecimento" como alternativa ao blur. O Modal renderiza numa
// camada nativa separada por cima da árvore atual — a tela por trás continua
// montada e com todo o estado (inputs não commitados inclusive) intacto, então
// fechar o overlay nunca reseta nada.
function RestTimerOverlay({
  restRemaining,
  onAdjust,
  onDismiss,
}: {
  restRemaining: number;
  onAdjust: (deltaSeconds: number) => void;
  onDismiss: () => void;
}) {
  // Ativa enquanto este overlay estiver montado (ou seja, exatamente enquanto
  // o timer está rodando ou mostrando "concluído") e desativa sozinho ao
  // desmontar — não precisa de start/stop manual.
  useKeepAwake();

  const isDone = restRemaining <= 0;

  // "Respiração" de tom no estado "concluído" — o fundo fica accent sólido
  // (tela inteira, não mais uma caixinha) e uma camada preta semi-transparente
  // por cima pulsa de opacidade 0 a ~0,2, escurecendo levemente o accent e
  // voltando — visualmente equivalente a variar entre accent e uma versão
  // ~20% mais escura dele, sem precisar animar backgroundColor diretamente
  // (que não é compatível com useNativeDriver: só transform/opacity são).
  // ~1500ms por meia-fase, ~3s por ciclo completo — bem devagar, entre tons
  // próximos, nunca um flash (risco de fotossensibilidade é o motivo). Roda
  // só enquanto isDone; para e reseta no cleanup do efeito, que dispara
  // tanto na transição de volta pra "contando" quanto no desmonte do overlay
  // inteiro.
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isDone) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();

    return () => {
      loop.stop();
      breathe.setValue(0);
    };
  }, [isDone, breathe]);

  const breatheOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0, 0.2] });

  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: isDone ? colors.accent : 'rgba(20,20,20,0.94)' }}
      >
        {isDone && (
          // pointerEvents="none": é só uma camada visual por cima do fundo,
          // não pode interceptar o toque no botão "Fechar" logo abaixo.
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: '#000000',
              opacity: breatheOpacity,
            }}
          />
        )}

        {!isDone && <Label>Descanso</Label>}

        {isDone ? (
          <View className="my-6 items-center justify-center">
            <Ionicons name="checkmark-circle" size={112} color="#FFFFFF" />
            <Text
              className="mt-4 text-center font-display text-6xl uppercase text-white"
              numberOfLines={2}
              adjustsFontSizeToFit
            >
              Descanso concluído
            </Text>
          </View>
        ) : (
          <View className="my-6 items-center justify-center rounded-lg border-2 border-accent bg-surface px-10 py-8">
            <Text
              className="font-display text-8xl text-accent"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatCountdown(restRemaining)}
            </Text>
          </View>
        )}

        {!isDone && (
          <View className="mb-8 flex-row items-center gap-4">
            <Button variant="primary" onPress={() => onAdjust(-30)} className="px-8 py-4">
              <Text className="font-label text-base uppercase tracking-wide text-white">-30s</Text>
            </Button>
            <Button variant="primary" onPress={() => onAdjust(30)} className="px-8 py-4">
              <Text className="font-label text-base uppercase tracking-wide text-white">+30s</Text>
            </Button>
          </View>
        )}

        <Pressable
          onPress={onDismiss}
          className={`w-full max-w-xs rounded border py-4 ${isDone ? 'border-white' : 'border-accent'}`}>
          <Text className={`text-center font-label uppercase ${isDone ? 'text-white' : 'text-accent'}`}>
            Fechar
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const EMPTY_LOGS: LogEntry[] = [];

function logsAreEqual(a: LogEntry[], b: LogEntry[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const bBySerie = new Map(b.map((log) => [log.numeroSerie, log]));
  for (const log of a) {
    const match = bBySerie.get(log.numeroSerie);
    if (
      !match ||
      match.id !== log.id ||
      match.reps !== log.reps ||
      match.carga !== log.carga ||
      match.rpe !== log.rpe ||
      match.pesoCorporal !== log.pesoCorporal ||
      match.aquecimento !== log.aquecimento
    ) {
      return false;
    }
  }
  return true;
}

const ExerciseSessionCard = memo(
  function ExerciseSessionCard({
    item,
    sessionId,
    sessionConcluded,
    logs,
    onSkip,
    onUnskip,
    onRemove,
    onRequestRest,
  }: {
    item: SessionExerciseItem;
    sessionId: number;
    sessionConcluded: boolean;
    logs: LogEntry[];
    onSkip: (workoutDayExerciseId: number) => void;
    onUnskip: (skipId: number) => void;
    onRemove: (extraId: number, hasLogs: boolean) => void;
    onRequestRest: (suggestedSeconds: number) => void;
  }) {
    const logsBySerie = useMemo(() => {
      const map = new Map<number, LogEntry>();
      for (const log of logs) map.set(log.numeroSerie, log);
      return map;
    }, [logs]);

    const { confirm, dialog } = useConfirmDialog();
    const { abrirAtlas } = useAtlas();

    const { data: preferenceRows } = useLiveQuery(
      db.select().from(exercisePreferences).where(eq(exercisePreferences.exerciseWgerId, item.exerciseWgerId)),
      [item.exerciseWgerId]
    );
    const nota = preferenceRows?.[0]?.nota || null;

    const suggestedRestSeconds = useMemo(
      () => suggestRestSeconds({ nome: item.exerciseNome, categoria: item.categoria }),
      [item.exerciseNome, item.categoria]
    );
    const handleRequestRest = useCallback(
      () => onRequestRest(suggestedRestSeconds),
      [onRequestRest, suggestedRestSeconds]
    );

    // Registro de refs dos campos "reps" por número de série — permite que o
    // campo "carga" da série N foque o campo "reps" da série N+1 de fora do
    // próprio SetRow (cada SetRow só conhece a si mesmo). ID único por card
    // (baseado no itemId) pro InputAccessoryView do iOS não colidir entre
    // exercícios diferentes montados ao mesmo tempo.
    const repsInputRefs = useRef(new Map<number, TextInput | null>()).current;
    const registerRepsInput = useCallback(
      (numeroSerie: number, ref: TextInput | null) => {
        if (ref) repsInputRefs.set(numeroSerie, ref);
        else repsInputRefs.delete(numeroSerie);
      },
      [repsInputRefs]
    );
    const focusReps = useCallback(
      (numeroSerie: number) => {
        repsInputRefs.get(numeroSerie)?.focus();
      },
      [repsInputRefs]
    );
    const accessoryViewId = `set-advance-${item.itemId}`;
    const [advance, setAdvance] = useState<{ run: () => void; label: string }>({
      run: () => {},
      label: 'Próximo',
    });

    const lastPerformance = useLastPerformance(item.exerciseId, sessionId);
    const lastPerformanceLabel = useMemo(
      () => (lastPerformance ? formatLastPerformance(lastPerformance) : null),
      [lastPerformance]
    );

    // Sugestão informativa (progressão dupla) — nunca preenche nada sozinha,
    // só mostra de onde veio o número.
    const loadSuggestion = useMemo(() => {
      if (!lastPerformance || lastPerformance.length === 0) return null;
      const equipamentoList: string[] = JSON.parse(item.equipamento);
      return suggestNextLoad(lastPerformance, item.repsAlvo, equipamentoList);
    }, [lastPerformance, item.repsAlvo, item.equipamento]);

    const loadSuggestionLabel = useMemo(() => {
      if (!loadSuggestion) return null;
      const prefix = loadSuggestion.subiu ? 'Sugerido' : 'Manter';
      const motivoSuffix = loadSuggestion.motivo ? ` · ${loadSuggestion.motivo}` : '';
      return `${prefix}: ${loadSuggestion.cargaSugerida}kg${motivoSuffix}`;
    }, [loadSuggestion]);

    const seriesNumbers = Array.from({ length: item.seriesAlvo }, (_, i) => i + 1);

    // Aquecimento: séries EXTRAS (não um toggle numa série existente), numa
    // sequência própria bem negativa (WARMUP_NUMERO_SERIE_BASE) — sempre
    // ordenadas antes das séries válidas por causa disso (ver comentário na
    // constante). `logs` já vem reativo (useLiveQuery no pai), então
    // adicionar/remover atualiza esta lista sozinho.
    const warmupLogs = useMemo(
      () => logs.filter((log) => log.aquecimento).sort((a, b) => a.numeroSerie - b.numeroSerie),
      [logs]
    );

    const handleAddWarmup = async () => {
      try {
        await db.insert(setLogs).values({
          sessionId,
          exerciseId: item.exerciseId,
          numeroSerie: WARMUP_NUMERO_SERIE_BASE + warmupLogs.length,
          reps: 0,
          carga: 0,
          aquecimento: true,
        });
      } catch (err) {
        reportError('Erro ao adicionar aquecimento', err);
      }
    };

    // Renumera os aquecimentos restantes pra nunca deixar buraco na
    // sequência (ver comentário longo em WARMUP_NUMERO_SERIE_BASE) — sem
    // isso, handleAddWarmup (baseado em `warmupLogs.length`) poderia
    // reatribuir um numeroSerie já em uso por um aquecimento que sobrou no
    // meio, colidindo. Uma transação só: apaga e renumera atomicamente.
    const handleRemoveWarmup = async (logId: number) => {
      const ok = await confirm({
        title: 'Remover aquecimento',
        message: 'Remover esta série de aquecimento?',
        confirmLabel: 'Remover',
        variant: 'destructive',
      });
      if (!ok) return;
      try {
        db.transaction((tx) => {
          tx.delete(setLogs).where(eq(setLogs.id, logId)).run();
          const remaining = tx
            .select()
            .from(setLogs)
            .where(
              and(
                eq(setLogs.sessionId, sessionId),
                eq(setLogs.exerciseId, item.exerciseId),
                eq(setLogs.aquecimento, true)
              )
            )
            .orderBy(setLogs.numeroSerie)
            .all();
          remaining.forEach((log, index) => {
            const target = WARMUP_NUMERO_SERIE_BASE + index;
            if (log.numeroSerie !== target) {
              tx.update(setLogs).set({ numeroSerie: target }).where(eq(setLogs.id, log.id)).run();
            }
          });
        });
      } catch (err) {
        reportError('Erro ao remover aquecimento', err);
      }
    };

    // Aquecimento não conta como série de trabalho — "X/Y séries completas",
    // o auto-colapso (isComplete) e o botão de pular (canSkip, abaixo) usam
    // só as séries de trabalho (workLogs), nunca as de aquecimento. Mesmo
    // padrão de `weightedLogs`/`allPesoCorporal` logo abaixo: const simples,
    // não useMemo — cálculo barato, recomputado a cada render como o resto
    // deste bloco.
    const workLogs = logs.filter((log) => !log.aquecimento);
    const completedCount = workLogs.length;
    const isComplete = completedCount === item.seriesAlvo;
    const isStarted = completedCount > 0;

    // Colapso automático quando o exercício completa (todas as séries
    // preenchidas) — só entra em jogo depois de pronto; enquanto incompleto,
    // fica sempre expandido (nada muda pro fluxo de preenchimento em si). O
    // botão de "Iniciar descanso" continua acessível no resumo colapsado
    // (abaixo) — evitando repetir o bug antigo de esconder essa ação bem no
    // momento em que ela aparece, ao preencher a última série.
    const [manualExpanded, setManualExpanded] = useState(false);
    const expanded = !isComplete || manualExpanded;

    const targetLabel = `${item.seriesAlvo}x${item.repsAlvo}${
      item.cargaAlvo != null ? ` · ${item.cargaAlvo}kg` : ''
    }`;

    // Resumo do card colapsado (só relevante quando isComplete, mas o cálculo
    // em si é barato e já vem de `workLogs`, sem query nova). Parte de
    // `workLogs` (não `logs`) — aquecimento não deveria influenciar "maior
    // carga" nem "só peso corporal" do resumo, mesmo critério do resto deste
    // arquivo. Peso corporal sai do cálculo de maior carga (é 0 por
    // convenção, não uma carga real) — se TODAS as séries de trabalho forem
    // peso corporal, mostra "PC" em vez de "0kg".
    const weightedLogs = workLogs.filter((log) => !log.pesoCorporal);
    const maiorCarga = weightedLogs.length > 0 ? Math.max(...weightedLogs.map((log) => log.carga)) : 0;
    const allPesoCorporal = workLogs.length > 0 && workLogs.every((log) => log.pesoCorporal);
    const completedSummaryLabel =
      maiorCarga > 0
        ? `${item.seriesAlvo}× · ${maiorCarga}kg`
        : allPesoCorporal
          ? `${item.seriesAlvo}× · PC`
          : `${item.seriesAlvo}×`;

    if (item.skipped) {
      return (
        <Card className="mb-4 opacity-60">
          <View className="flex-row items-center justify-between">
            <Text
              className="flex-1 pr-2 font-card-title text-lg text-muted line-through"
              numberOfLines={1}
            >
              {item.exerciseNome}
            </Text>
            <Pressable onPress={() => item.skipId != null && onUnskip(item.skipId)}>
              <Text className="font-label text-xs uppercase text-accent">Desfazer</Text>
            </Pressable>
          </View>
          <Label className="mt-1">Pulado nesta sessão</Label>
        </Card>
      );
    }

    const canSkip = item.kind === 'plano' && completedCount === 0;
    const canRemove = item.kind === 'avulso';
    const inSupersetGroup = item.supersetGroup != null;

    return (
      <>
        <Card
          className={`${item.isLastInSupersetGroup ? 'mb-4' : 'mb-0'} ${
            isComplete ? 'border-l-4 border-l-accent' : ''
          }`}>
          {inSupersetGroup && (
            <Label className="mb-1 text-accent">{`Supersérie ${item.supersetGroup}`}</Label>
          )}
          <Pressable
            onPress={() => isComplete && setManualExpanded((v) => !v)}
            className="flex-row items-center justify-between">
            <Text className="flex-1 pr-2 font-card-title text-lg text-text" numberOfLines={1}>
              {item.exerciseNome}
            </Text>
          <View className="flex-row items-center gap-2">
            {isComplete ? (
              <>
                <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                {!expanded && <Label className="text-accent">{completedSummaryLabel}</Label>}
              </>
            ) : isStarted ? (
              <Label>{`${completedCount}/${item.seriesAlvo}`}</Label>
            ) : null}
            {isComplete && (
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.muted}
              />
            )}
            {/* Pressable ANINHADO dentro do Pressable da linha inteira (o
                onPress={() => isComplete && setManualExpanded(...)} lá em
                cima) — no toque, o Pressable interno reivindica o responder
                pra si (comportamento padrão do RN), então nunca também
                expande/colapsa o card por engano. */}
            <Pressable
              onPress={() => abrirAtlas({ wgerId: item.exerciseWgerId, nome: item.exerciseNome })}
              hitSlop={8}>
              <View style={{ backgroundColor: `${colors.accent}1A`, borderRadius: 8, padding: 4 }}>
                <Ionicons name="help-circle" size={22} color={colors.accent} />
              </View>
            </Pressable>
          </View>
        </Pressable>

        {(canSkip || canRemove) && (
          <Pressable
            onPress={() =>
              item.kind === 'avulso' ? onRemove(item.itemId, isStarted) : onSkip(item.itemId)
            }
            className="mt-1 self-end">
            <Text className="font-label text-xs uppercase text-muted">
              {item.kind === 'avulso' ? 'Remover' : 'Pular'}
            </Text>
          </Pressable>
        )}

        {!expanded ? (
          item.isLastInSupersetGroup && (
            <Pressable
              onPress={handleRequestRest}
              className="mt-3 flex-row items-center justify-center gap-2 rounded border border-accent py-3">
              <Ionicons name="time-outline" size={22} color={colors.accent} />
              <Text className="font-label uppercase text-accent">{`Iniciar descanso · ${suggestedRestSeconds}s`}</Text>
            </Pressable>
          )
        ) : (
          <>
            <Label className="mt-1">{`Alvo: ${targetLabel}`}</Label>
            {item.dica && (
              <Card className="mb-1 mt-2 border-l-4 border-l-accent">
                <Text className="font-body text-sm text-text">{item.dica}</Text>
              </Card>
            )}
            {nota && <Label className="mt-1 italic text-muted">{nota}</Label>}
            <Label className="mt-1 text-muted">
              {lastPerformanceLabel ? `Última vez: ${lastPerformanceLabel}` : ' '}
            </Label>
            {loadSuggestionLabel ? (
              <Label className="mb-3 mt-1 text-accent">{loadSuggestionLabel}</Label>
            ) : (
              <View className="mb-3" />
            )}

            <View className="mb-1 flex-row items-center gap-3">
              <View className="w-16" />
              <Label className="flex-1 text-center">Reps</Label>
              <Label className="flex-1 text-center">Carga</Label>
            </View>

            {!sessionConcluded && (
              <Button variant="secondary" className="mb-3 self-start" onPress={handleAddWarmup}>
                <View className="flex-row items-center gap-1">
                  <Ionicons name="flame-outline" size={14} color={colors.muted} />
                  <Text className="font-label text-xs uppercase text-muted">+ Aquecimento</Text>
                </View>
              </Button>
            )}

            {warmupLogs.map((log, index) => (
              <SetRow
                key={log.numeroSerie}
                sessionId={sessionId}
                exerciseId={item.exerciseId}
                numeroSerie={log.numeroSerie}
                isLastSerie={index === warmupLogs.length - 1}
                existing={log}
                onRequestRest={handleRequestRest}
                suggestedRestSeconds={suggestedRestSeconds}
                showRestButton={false}
                accessoryViewId={accessoryViewId}
                registerRepsInput={registerRepsInput}
                focusReps={focusReps}
                setAdvance={setAdvance}
                onRemove={() => handleRemoveWarmup(log.id)}
              />
            ))}

            {seriesNumbers.map((numeroSerie) => (
              <SetRow
                key={numeroSerie}
                sessionId={sessionId}
                exerciseId={item.exerciseId}
                numeroSerie={numeroSerie}
                isLastSerie={numeroSerie === item.seriesAlvo}
                existing={logsBySerie.get(numeroSerie)}
                onRequestRest={handleRequestRest}
                suggestedRestSeconds={suggestedRestSeconds}
                showRestButton={item.isLastInSupersetGroup}
                accessoryViewId={accessoryViewId}
                registerRepsInput={registerRepsInput}
                focusReps={focusReps}
                setAdvance={setAdvance}
              />
            ))}

            {Platform.OS === 'ios' && (
              <InputAccessoryView nativeID={accessoryViewId}>
                <View
                  className="flex-row justify-end bg-surface px-4 py-2"
                  style={{ borderTopWidth: 1, borderTopColor: colors.border }}
                >
                  <Pressable onPress={() => advance.run()} className="px-3 py-1" hitSlop={8}>
                    <Text className="font-label uppercase text-accent">{advance.label}</Text>
                  </Pressable>
                </View>
              </InputAccessoryView>
            )}
          </>
        )}
        </Card>
        {inSupersetGroup && !item.isLastInSupersetGroup && <View className="h-1 bg-accent" />}
        {dialog}
      </>
    );
  },
  (prev, next) =>
    prev.sessionId === next.sessionId &&
    prev.sessionConcluded === next.sessionConcluded &&
    itemsEqual(prev.item, next.item) &&
    logsAreEqual(prev.logs, next.logs)
);

function SetRow({
  sessionId,
  exerciseId,
  numeroSerie,
  isLastSerie,
  existing,
  onRequestRest,
  suggestedRestSeconds,
  showRestButton,
  accessoryViewId,
  registerRepsInput,
  focusReps,
  setAdvance,
  onRemove,
}: {
  sessionId: number;
  exerciseId: number;
  numeroSerie: number;
  isLastSerie: boolean;
  existing: LogEntry | undefined;
  onRequestRest: () => void;
  suggestedRestSeconds: number;
  showRestButton: boolean;
  accessoryViewId: string;
  registerRepsInput: (numeroSerie: number, ref: TextInput | null) => void;
  focusReps: (numeroSerie: number) => void;
  setAdvance: (advance: { run: () => void; label: string }) => void;
  // Presente só nas linhas de aquecimento (ver ExerciseSessionCard) — série
  // válida nunca recebe essa prop, então nunca mostra o X (comportamento
  // preservado). Removido daqui, não é mais um toggle: aquecimento agora é
  // uma série EXTRA que o pai cria/apaga (handleAddWarmup/handleRemoveWarmup),
  // nunca uma série existente que vira aquecimento e volta.
  onRemove?: () => void;
}) {
  // `existing.reps === 0`: mesmo raciocínio do comentário de `carga` logo
  // abaixo, estendido pra reps — 0 nunca é uma repetição real digitada, só
  // o sentinela com que uma série de aquecimento nasce (handleAddWarmup
  // insere `reps:0, carga:0` na hora de criar, antes do usuário preencher
  // nada). Sem esse tratamento, o campo mostrava o texto literal "0" (não
  // vazio) assim que uma série de aquecimento era adicionada — e digitar
  // por cima concatenava ("0" + "10" = "010", já que o cursor entra depois
  // do "0" existente, não substituindo-o).
  const [reps, setReps] = useState(existing !== undefined && existing.reps !== 0 ? String(existing.reps) : '');
  // Carga gravada como 0 (sentinela, seja de peso corporal OU de uma série
  // de aquecimento recém-criada) não é um texto útil de reexibir — nasce em
  // branco nesses casos, forçando reentrada explícita em vez de reaproveitar
  // o "0" como se fosse uma carga real digitada.
  const [carga, setCarga] = useState(
    existing !== undefined && !existing.pesoCorporal && existing.carga !== 0 ? String(existing.carga) : ''
  );
  const [pesoCorporal, setPesoCorporal] = useState(existing?.pesoCorporal ?? false);
  // Não é mais um toggle — a linha OU é uma série de aquecimento (criada via
  // handleAddWarmup, sempre com `existing` já preenchido) OU não é, e isso
  // nunca muda durante a vida deste SetRow. Const simples, não estado.
  const aquecimento = existing?.aquecimento ?? false;
  const [logId, setLogId] = useState<number | null>(existing?.id ?? null);
  const [rpe, setRpe] = useState<number | null>(existing?.rpe ?? null);
  const isFilled = logId !== null;
  const rpeCategory = rpeValueToCategory(rpe);
  const cargaInputRef = useRef<TextInput>(null);

  // Aceita um override explícito de pesoCorporal pro caso do toggle: como
  // setState é assíncrono, o handler não pode confiar no valor já
  // atualizado no mesmo tick — passa o valor novo direto. `aquecimento` (a
  // const acima) sempre vai junto, fixo — nunca muda por aqui.
  const commit = async (pesoCorporalOverride?: boolean) => {
    const effectivePesoCorporal = pesoCorporalOverride ?? pesoCorporal;

    // reps and carga are NOT NULL columns, so a row can't be persisted
    // without reps. Carga só é exigida quando NÃO é peso corporal — peso
    // corporal sempre grava carga 0 (sentinela) sem exigir texto no campo,
    // já que ele nem aparece nesse caso. Continua esperando as duas partes
    // reais antes de gravar (senão a mesma condição de corrida de sempre:
    // blurrar o primeiro campo gravaria o segundo, ainda vazio, como 0).
    if (reps.trim() === '' || (!effectivePesoCorporal && carga.trim() === '')) {
      return;
    }

    const repsNum = Number(reps);
    const cargaNum = effectivePesoCorporal ? 0 : Number(carga);
    if (!Number.isFinite(repsNum) || !Number.isFinite(cargaNum)) {
      return;
    }

    try {
      if (logId) {
        await db
          .update(setLogs)
          .set({
            reps: repsNum,
            carga: cargaNum,
            pesoCorporal: effectivePesoCorporal,
            aquecimento,
          })
          .where(eq(setLogs.id, logId));
      } else {
        const [created] = await db
          .insert(setLogs)
          .values({
            sessionId,
            exerciseId,
            numeroSerie,
            reps: repsNum,
            carga: cargaNum,
            pesoCorporal: effectivePesoCorporal,
            aquecimento,
          })
          .returning();
        setLogId(created.id);
      }
    } catch (err) {
      reportError('Erro ao salvar série', err);
    }
  };

  const handleTogglePesoCorporal = () => {
    const next = !pesoCorporal;
    setPesoCorporal(next);
    if (next) setCarga('');
    commit(next);
  };

  // Realce de RPE + descanso ao concluir a série normalmente (ver abaixo) —
  // acende suave e desvanece sozinho, ou some no primeiro toque em RPE/
  // descanso. Nunca um flash rápido (mesmo cuidado do overlay de fim de
  // descanso): ~700ms pra acender, ~1,2s de espera, ~900ms pra desvanecer.
  const [highlightActive, setHighlightActive] = useState(false);
  const highlightOpacity = useRef(new Animated.Value(0)).current;

  const triggerHighlight = useCallback(() => setHighlightActive(true), []);
  const clearHighlight = useCallback(() => setHighlightActive(false), []);

  useEffect(() => {
    if (!highlightActive) {
      highlightOpacity.setValue(0);
      return;
    }
    const sequence = Animated.sequence([
      Animated.timing(highlightOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.delay(1200),
      Animated.timing(highlightOpacity, {
        toValue: 0,
        duration: 900,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]);
    sequence.start(({ finished }) => {
      if (finished) setHighlightActive(false);
    });
    return () => {
      sequence.stop();
      highlightOpacity.setValue(0);
    };
  }, [highlightActive, highlightOpacity]);

  // Dois gatilhos, dois papéis — não são a mesma ação disfarçada:
  //
  // - *AdvanceShortcut (ligado ao botão da barra do teclado via setAdvance,
  //   iOS): atalho de velocidade, preserva o comportamento antigo (pula pra
  //   próxima série). É a ÚNICA forma de "submeter" um campo number-pad/
  //   decimal-pad no iOS — esses teclados não têm tecla de retorno nativa lá,
  //   então esse botão manual é o único jeito de sair do campo continuando o
  //   fluxo rápido.
  // - *Done (ligado a onSubmitEditing, dispara com a tecla "next"/"done" do
  //   teclado nativo — só existe de fato no Android, já que o iOS nunca gera
  //   esse evento pra esses teclados): fluxo novo, fecha o teclado e conduz
  //   ao RPE/descanso em vez de pular direto pra próxima série.
  //
  // Como as duas plataformas nunca dividem o mesmo caminho físico (no iOS só
  // o toque na barra existe; no Android só a tecla nativa existe), não há
  // conflito real entre elas — são handlers diferentes.
  const handleRepsAdvanceShortcut = useCallback(() => {
    if (pesoCorporal) {
      if (isLastSerie) {
        Keyboard.dismiss();
      } else {
        focusReps(numeroSerie + 1);
      }
    } else {
      cargaInputRef.current?.focus();
    }
  }, [pesoCorporal, isLastSerie, focusReps, numeroSerie]);

  // Com peso corporal ativo, reps é o último campo focável da linha (carga
  // vira um rótulo fixo "PC", não-focável) — então é aqui, não na carga, que
  // o fluxo novo se aplica.
  const handleRepsDone = useCallback(() => {
    if (pesoCorporal) {
      Keyboard.dismiss();
      triggerHighlight();
    } else {
      cargaInputRef.current?.focus();
    }
  }, [pesoCorporal, triggerHighlight]);

  const handleCargaAdvanceShortcut = useCallback(() => {
    if (isLastSerie) {
      Keyboard.dismiss();
    } else {
      focusReps(numeroSerie + 1);
    }
  }, [isLastSerie, focusReps, numeroSerie]);

  const handleCargaDone = useCallback(() => {
    Keyboard.dismiss();
    triggerHighlight();
  }, [triggerHighlight]);

  // Ref estável (não uma arrow function inline) — senão React desregistraria
  // e reregistraria o input no Map do card pai a cada re-render (ou seja, a
  // cada tecla digitada), já que uma callback ref nova sempre dispara
  // detach+attach mesmo sendo o mesmo elemento nativo.
  const setRepsInputRef = useCallback(
    (ref: TextInput | null) => registerRepsInput(numeroSerie, ref),
    [registerRepsInput, numeroSerie]
  );

  const handleSetRpe = async (category: RpeCategory) => {
    if (!logId) return;
    const value = RPE_CATEGORY_VALUE[category];
    const nextValue = rpe === value ? null : value; // toca de novo na mesma = desmarca
    setRpe(nextValue);
    try {
      await db.update(setLogs).set({ rpe: nextValue }).where(eq(setLogs.id, logId));
    } catch (err) {
      reportError('Erro ao salvar RPE', err);
    }
  };

  return (
    <View className={`mb-3 ${aquecimento ? 'opacity-60' : ''}`}>
      <View className="flex-row items-center gap-3">
        <Label className={`w-16 ${isFilled ? 'text-accent' : ''}`}>
          {aquecimento ? `Aquec. ${numeroSerie - WARMUP_NUMERO_SERIE_BASE + 1}` : `Série ${numeroSerie}`}
        </Label>
        {onRemove && (
          <Pressable onPress={onRemove} hitSlop={8} className="p-1" accessibilityLabel="Remover série de aquecimento">
            <Ionicons name="close-circle-outline" size={20} color={colors.muted} />
          </Pressable>
        )}
        <View className="flex-1">
          <Input
            ref={setRepsInputRef}
            value={reps}
            onChangeText={setReps}
            onBlur={() => commit()}
            onFocus={() =>
              setAdvance({
                run: handleRepsAdvanceShortcut,
                label: pesoCorporal && isLastSerie ? 'Concluir' : 'Próximo',
              })
            }
            onSubmitEditing={handleRepsDone}
            returnKeyType={pesoCorporal ? 'done' : 'next'}
            inputAccessoryViewID={accessoryViewId}
            keyboardType="number-pad"
            placeholder="0"
            className="text-center font-display text-2xl"
            disableAutoScroll
          />
        </View>
        <View className="flex-1 flex-row items-center gap-1">
          {pesoCorporal ? (
            <View className="flex-1 items-center justify-center rounded border border-accent bg-surface py-3">
              <Text className="font-display text-2xl text-accent">PC</Text>
            </View>
          ) : (
            <Input
              ref={cargaInputRef}
              value={carga}
              onChangeText={setCarga}
              onBlur={() => commit()}
              onFocus={() =>
                setAdvance({ run: handleCargaAdvanceShortcut, label: isLastSerie ? 'Concluir' : 'Próximo' })
              }
              onSubmitEditing={handleCargaDone}
              returnKeyType="done"
              inputAccessoryViewID={accessoryViewId}
              keyboardType="decimal-pad"
              placeholder="0"
              className="flex-1 text-center font-display text-2xl"
              disableAutoScroll
            />
          )}
          <Pressable
            onPress={handleTogglePesoCorporal}
            hitSlop={8}
            className="p-1"
            accessibilityLabel="Marcar série como peso corporal">
            <Ionicons name="body-outline" size={20} color={pesoCorporal ? colors.accent : colors.muted} />
          </Pressable>
        </View>
      </View>

      {isFilled && showRestButton && (
        <View className="relative mt-2 ml-16">
          {highlightActive && <HighlightRing opacity={highlightOpacity} />}
          <Pressable
            onPress={() => {
              clearHighlight();
              onRequestRest();
            }}
            className="flex-row items-center justify-center gap-2 rounded border border-accent py-3">
            <Ionicons name="time-outline" size={22} color={colors.accent} />
            <Text className="font-label uppercase text-accent">{`Iniciar descanso · ${suggestedRestSeconds}s`}</Text>
          </Pressable>
        </View>
      )}

      {isFilled && (
        <View className="relative ml-16 mt-2">
          {highlightActive && <HighlightRing opacity={highlightOpacity} />}
          <View className="flex-row gap-2">
            {RPE_CATEGORY_ORDER.map((category) => (
              <Chip
                key={category}
                label={RPE_CATEGORY_LABEL[category]}
                selected={rpeCategory === category}
                onPress={() => {
                  clearHighlight();
                  handleSetRpe(category);
                }}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// Anel de realce (glow) sobreposto — chama atenção pro RPE/descanso sem
// obscurecer o conteúdo embaixo: só uma borda accent que acende e desvanece
// via opacity (transform/opacity são o que useNativeDriver anima; nunca cor).
// pointerEvents="none" pra nunca capturar o toque que deveria ir pro chip ou
// pro botão logo abaixo dela na pilha.
function HighlightRing({ opacity }: { opacity: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -4,
        left: -4,
        right: -4,
        bottom: -4,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: colors.accent,
        opacity,
      }}
    />
  );
}
