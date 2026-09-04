import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CelebrationModal } from '@/components/ui/celebration-modal';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { db } from '@/db';
import { exercises, sessions } from '@/db/schema';
import {
  computeLastMonthsTrainingCounts,
  computeMonthlyTrainingCounts,
  computeWeeklyVolumeKg,
  computeWeekTrainingCount,
  getActivePlanDays,
  getActivePlanFrequency,
  getAllTrainedDates,
  getLatestPR,
  getMonthTrainingDays,
  getNextSuggestedWorkout,
  MESES_PT,
  type PlanDay,
} from '@/db/dashboard-stats';
import { ensureFraseSeed, useUserProfile } from '@/db/user-profile';
import { computeWeekStreak, getTodayDateString, getWeekStartIso } from '@/lib/date';
import {
  buildCelebrationMessage,
  clearCelebrationRecord,
  getCelebrationIcon,
  markCelebrationShown,
  shouldShowCelebration,
} from '@/lib/monthly-celebration';
import { getFraseDoDia } from '@/lib/motivational';
import { computeTrainedDaysInWeek } from '@/lib/stats';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

// Streak mínimo pra valer a pena mostrar o badge de sequência — 1 semana
// sozinha não é uma "sequência", é só a semana atual.
const STREAK_MINIMO_EXIBICAO = 2;

const MESES_MINI_BARRAS = 6;

// Segunda a domingo — mesma ordem/convenção de computeTrainedDaysInWeek
// (lib/stats.ts) e do card de compartilhamento, índice 0 = segunda.
const DIA_LETRAS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
// Domingo a sábado — ordem do cabeçalho do calendário (bate com
// `Date.getDay()`: 0 = domingo, usado direto pro offset do 1º dia do mês).
const DIA_LETRAS_CALENDARIO = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// Base compartilhada dos cards do dashboard — rounded-xl (12px), diferente
// do `rounded` (6px) do componente `Card` compartilhado (ui/card.tsx), que
// por isso não é reusado nesta tela: o layout aprovado quer um raio maior
// em todo card daqui, e forçar isso por cima do Card via className arrisca
// conflito de classe (mesma propriedade, ordem de resolução do NativeWind
// não é garantida) — mais seguro montar o View direto com a classe certa.
const CARD_BASE = 'rounded-xl border border-border bg-surface';

function getSaudacao(hour: number): string {
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function reportError(context: string, err: unknown) {
  console.error(context, err);
  Alert.alert(context, String(err instanceof Error ? err.message : err));
}

export default function DashboardScreen() {
  const router = useRouter();
  const profile = useUserProfile();

  // Gera a semente da frase do dia (lib/motivational.ts) na primeira vez
  // que o perfil chega sem uma — idempotente (ensureFraseSeed só grava se
  // `fraseSeed` ainda for `null`), então rodar de novo a cada re-render do
  // efeito (toda vez que `profile` muda) é inofensivo. Cobre tanto o
  // device novo (linha recém-criada) quanto o usuário antigo atualizando
  // pra depois da migração aditiva (linha existente com `fraseSeed` NULL).
  useEffect(() => {
    if (profile === undefined) return;
    ensureFraseSeed(profile.fraseSeed).catch((err) => console.error('Erro ao gerar semente da frase do dia:', err));
  }, [profile]);

  // `useMemo`: saudação e frase do dia não devem mudar a cada re-render (só
  // importa a hora/dia em que a tela MONTOU, e a semente do device) —
  // recalcular a cada render trocaria "Boa tarde" por "Boa noite" (ou a
  // frase) no meio do uso se o usuário ficar com o app aberto atravessando
  // a hora de corte. `profile?.fraseSeed ?? 0` é só o valor de UM frame —
  // antes de `ensureFraseSeed` (acima) persistir a semente real, mostra
  // uma frase qualquer com semente 0; assim que a linha reativa
  // (useUserProfile) traz a semente gerada, este memo recalcula uma única
  // vez e estabiliza pro resto da sessão.
  const frase = useMemo(() => getFraseDoDia(profile?.fraseSeed ?? 0), [profile?.fraseSeed]);
  const saudacao = useMemo(() => getSaudacao(new Date().getHours()), []);
  const weekStartIso = useMemo(() => getWeekStartIso(getTodayDateString()), []);

  // Celebração mensal — roda uma vez por MONTAGEM da tela (não uma query
  // reativa: é uma checagem de "já mostrei isso este mês?" contra
  // user_profile, não algo que deva reagir a mudança de sessions em tempo
  // real). `anterior === 0` (mês anterior sem nenhum treino) não mostra o
  // modal — não há nada pra celebrar — mas ainda marca como "visto" pra não
  // checar de novo a cada abertura do app dentro do mesmo mês.
  const [celebrationData, setCelebrationData] = useState<{ treinos: number; mesNome: string } | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const show = await shouldShowCelebration();
        if (!show) return;
        const { anterior, mesAnteriorNome } = await computeMonthlyTrainingCounts();
        await markCelebrationShown();
        if (anterior === 0) return;
        setCelebrationData({ treinos: anterior, mesNome: capitalize(mesAnteriorNome) });
      } catch (err) {
        console.error('Erro ao checar celebração mensal:', err);
      }
    })();
  }, []);

  // Debug (Passo de verificação do pedido) — só existe em dev builds
  // (`__DEV__`, global do RN/Metro, `false` em qualquer build de produção):
  // toque longo na saudação limpa o registro e força o modal a aparecer na
  // hora, sem esperar o mês virar. `clearCelebrationRecord` não é chamada em
  // nenhum outro lugar do app.
  const handleDebugForceCelebration = async () => {
    if (!__DEV__) return;
    await clearCelebrationRecord();
    const { anterior, mesAnteriorNome } = await computeMonthlyTrainingCounts();
    setCelebrationData({ treinos: anterior || 1, mesNome: capitalize(mesAnteriorNome) });
  };

  // Datas de treino concluído — força (`sessions`) OU cardio (`cardioSessions`,
  // ver getAllTrainedDates em dashboard-stats.ts) — alimenta o streak
  // (computeWeekStreak) e os dots de dias da semana (computeTrainedDaysInWeek,
  // mesma função pura já usada no card de compartilhamento — ver
  // workout-share-card.tsx), e também detecta "usuário novo" (nenhum treino
  // concluído ainda, nem força nem cardio). `useDbQuery` (não `useLiveQuery`)
  // porque a união dos 2 modos precisa observar as DUAS tabelas — mesmo
  // padrão de cardio-stats.ts pra unir os 2 modos internos do cardio.
  const allTrainedDates = useDbQuery(getAllTrainedDates, ['sessions', 'cardio_sessions'], []);
  const concludedDates = useMemo(() => allTrainedDates ?? [], [allTrainedDates]);
  const streak = useMemo(() => computeWeekStreak(concludedDates), [concludedDates]);
  const diasSemana = useMemo(
    () => computeTrainedDaysInWeek(concludedDates, weekStartIso),
    [concludedDates, weekStartIso]
  );
  // `undefined` (1ª emissão da query ainda não chegou) NÃO conta como
  // "novo" — evita o flash do card de boas-vindas pra quem já tem histórico
  // só porque a query ainda não respondeu.
  const isUsuarioNovo = allTrainedDates !== undefined && allTrainedDates.length === 0;

  // Meta semanal REAL (Passo 1) — dias do plano ativo, não mais um "3" fixo.
  // Mesmas tabelas de getNextSuggestedWorkout (as duas consultam o "plano
  // ativo"), por isso os mesmos watchTables.
  const WATCH_PLANO_ATIVO = ['sessions', 'workout_days', 'workout_plans'];
  const meta = useDbQuery(getActivePlanFrequency, WATCH_PLANO_ATIVO, []);
  // As 4 abaixo agora leem sessions E cardioSessions por baixo (ver
  // getAllTrainedDates, dashboard-stats.ts) — 'cardio_sessions' entra no
  // watch pra reagir a concluir/apagar cardio, não só musculação.
  const weekCount = useDbQuery(computeWeekTrainingCount, ['sessions', 'cardio_sessions'], []);
  const volume = useDbQuery(computeWeeklyVolumeKg, ['sessions', 'set_logs'], []);
  const monthlyCounts = useDbQuery(computeMonthlyTrainingCounts, ['sessions', 'cardio_sessions'], []);
  const monthTrainingDays = useDbQuery(getMonthTrainingDays, ['sessions', 'cardio_sessions'], []);
  const lastMonths = useDbQuery(
    () => computeLastMonthsTrainingCounts(MESES_MINI_BARRAS),
    ['sessions', 'cardio_sessions'],
    []
  );
  const latestPR = useDbQuery(getLatestPR, ['sessions', 'set_logs'], []);
  const nextWorkout = useDbQuery(getNextSuggestedWorkout, WATCH_PLANO_ATIVO, []);
  const planDays = useDbQuery(getActivePlanDays, WATCH_PLANO_ATIVO, []);
  // `visivel` é curadoria de navegação (148 de 872, ver exercise-catalog-list.tsx)
  // — o header do catálogo precisa refletir o mesmo filtro que a lista usa,
  // senão mostra a contagem da tabela inteira (872), não o que o usuário
  // realmente vê rolando a lista.
  const totalExercicios = useDbQuery(() => db.$count(exercises, eq(exercises.visivel, true)), ['exercises'], []);

  const metaEfetiva = meta ?? 3;
  const weekProgress = weekCount != null ? Math.max(0, Math.min(1, weekCount / metaEfetiva)) : 0;
  const maxMesCount = lastMonths ? Math.max(1, ...lastMonths) : 1;

  // Passo 4 — "Trocar": troca só visual/local (não grava nada no banco),
  // sobrepondo o dia sugerido por outro dia do mesmo plano ativo escolhido
  // via chip. Reseta sozinho quando `nextWorkout` muda de plano/sugestão de
  // verdade (troca de plano ativo, por exemplo) — sem isso, um `selectedDay`
  // de um plano antigo poderia ficar "grudado" na tela depois de uma
  // mudança real de contexto.
  const [showTrocar, setShowTrocar] = useState(false);
  const [selectedDay, setSelectedDay] = useState<PlanDay | null>(null);
  const diaAtual = selectedDay ?? (nextWorkout ? { id: nextWorkout.dayId, label: nextWorkout.dayNome } : null);
  // Músculos só existem pré-calculados pro dia SUGERIDO (getNextSuggestedWorkout
  // já traz isso pronto) — pra um dia escolhido manualmente via chip, mostrar
  // de novo exigiria uma consulta por dia só pra essa troca visual; omitido
  // de propósito (fica só o nome do dia) em vez de uma N+1 query por chip.
  const musculosVisiveis = selectedDay ? null : nextWorkout?.musculos;
  const outrosDias = (planDays ?? []).filter((day) => day.id !== diaAtual?.id);

  const handleTrocarDia = (day: PlanDay) => {
    setSelectedDay(day);
    setShowTrocar(false);
  };

  // Mesma semântica de handleStartDay (hoje.tsx): cria a sessão de hoje pro
  // dia sugerido/escolhido. Reimplementado aqui (não importado de hoje.tsx,
  // que não exporta nada) com a mesma trava de "já existe sessão hoje" de
  // treinarAgora/treinarAgoraComExercicios (ready-workouts.ts) — sem ela,
  // tocar "Iniciar" com um treino já em andamento criaria uma 2ª sessão
  // órfã pro dia (hoje.tsx só mostra a primeira, `todaySessions?.[0]`). Com
  // sessão já em aberto, só navega — a tela de Treinar mostra o que já está
  // rolando.
  const handleIniciarAgora = async (dayId: number) => {
    try {
      const todayStr = getTodayDateString();
      const existingToday = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.data, todayStr));
      if (existingToday.length === 0) {
        await db
          .insert(sessions)
          .values({ workoutDayId: dayId, data: todayStr, concluida: false, horaInicio: Date.now() });
      }
      router.push('/hoje');
    } catch (err) {
      reportError('Erro ao iniciar treino', err);
    }
  };

  // Grade do calendário (Passo 5) — puramente derivada da data de hoje, sem
  // consulta nenhuma (o dado real é `monthTrainingDays`, já vindo da query).
  // `null` preenche as células antes do dia 1 (offset do 1º dia da semana).
  const hoje = useMemo(() => new Date(), []);
  const calendario = useMemo(() => {
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const primeiroDiaSemana = new Date(ano, mes, 1).getDay(); // 0 = domingo
    const celulas: (number | null)[] = [
      ...Array(primeiroDiaSemana).fill(null),
      ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
    ];
    return { ano, mes, celulas, hojeDia: hoje.getDate() };
  }, [hoje]);

  // Toque longo só tem efeito em dev (`handleDebugForceCelebration` sai cedo
  // fora de `__DEV__`) — nenhum affordance visível muda em produção, então
  // não precisa de um botão de debug separado disputando espaço no layout
  // aprovado.
  const hero = (
    <Pressable onLongPress={handleDebugForceCelebration} className="pb-2 pt-2">
      <Text className="font-label uppercase tracking-wide text-muted" style={{ fontSize: 10 }}>
        {saudacao}
      </Text>
      <Text className="font-display uppercase text-text" style={{ fontSize: 38 }} numberOfLines={1}>
        {profile?.nome ?? 'Olá'}
        <Text className="text-accent">!</Text>
      </Text>
      <Text className="mt-2 font-display text-text" style={{ fontSize: 18, lineHeight: 26 }}>
        {frase}
      </Text>
      <View className="mt-3.5 rounded-full bg-accent" style={{ width: 40, height: 3 }} />
    </Pressable>
  );

  const celebrationModal = celebrationData ? (
    <CelebrationModal
      visible
      mesNome={celebrationData.mesNome}
      treinos={celebrationData.treinos}
      icone={getCelebrationIcon(celebrationData.treinos)}
      mensagem={buildCelebrationMessage(celebrationData.treinos, celebrationData.mesNome)}
      onClose={() => setCelebrationData(null)}
    />
  ) : null;

  if (isUsuarioNovo) {
    return (
      <Screen edges={['top', 'left', 'right']} scrollable>
        {hero}
        <View className={`${CARD_BASE} mt-4 px-4 py-3.5`}>
          <Text className="mb-2 font-card-title text-lg text-text">Bem-vindo ao Telos!</Text>
          <Text className="mb-4 font-body text-sm text-muted">Crie seu primeiro plano e comece hoje.</Text>
          <Button onPress={() => router.push('/plano/novo')}>Criar meu primeiro plano</Button>
        </View>
        {celebrationModal}
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right']} scrollable>
      {hero}

      {/* GRID: SEMANA + VOLUME */}
      <View className="mt-4 flex-row gap-2.5">
        <View className={`${CARD_BASE} flex-1 px-3.5 py-3.5`}>
          <Text className="font-label uppercase text-muted" style={{ fontSize: 10 }}>
            Esta semana
          </Text>
          <Text className="mt-1.5 font-display text-text" style={{ fontSize: 22 }}>{`${weekCount ?? 0}/${metaEfetiva}`}</Text>
          {streak >= STREAK_MINIMO_EXIBICAO && (
            <View
              className="mt-1.5 flex-row items-center self-start rounded-full px-2 py-0.5"
              style={{ backgroundColor: `${colors.accent}1A`, borderWidth: 1, borderColor: `${colors.accent}4D` }}>
              <Text className="font-label text-accent" style={{ fontSize: 10 }}>{`🔥 ${streak} sem.`}</Text>
            </View>
          )}
          <View className="mt-2.5 h-1 overflow-hidden rounded-full bg-border">
            <View className="h-full rounded-full bg-accent" style={{ width: `${weekProgress * 100}%` }} />
          </View>
          {/* Dots dos dias — 7 (segunda-domingo), um por dia REAL da semana
              (computeTrainedDaysInWeek), com a inicial do dia embaixo de
              cada um, como pedido. */}
          <View className="mt-2 flex-row justify-between">
            {diasSemana.map((treinou, index) => (
              <View key={index} className="items-center">
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: treinou ? colors.accent : 'transparent',
                    borderWidth: treinou ? 0 : 1,
                    borderColor: colors.border,
                  }}
                />
                <Text className="mt-1 font-label text-muted" style={{ fontSize: 8 }}>
                  {DIA_LETRAS[index]}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className={`${CARD_BASE} flex-1 px-3.5 py-3.5`}>
          <Text className="font-label uppercase text-muted" style={{ fontSize: 10 }}>
            Volume
          </Text>
          <Text className="mt-1.5 font-display text-text" style={{ fontSize: 22 }} numberOfLines={1}>
            {`${(volume?.atual ?? 0).toLocaleString('pt-BR')} kg`}
          </Text>
          <Text className="mt-0.5 font-label text-muted" style={{ fontSize: 10 }}>
            esta semana
          </Text>
          {volume && volume.atual > volume.anterior && (
            <Text className="mt-1.5 font-body text-success" style={{ fontSize: 11 }}>
              {`↑ +${(volume.atual - volume.anterior).toLocaleString('pt-BR')}kg`}
            </Text>
          )}
          {volume && volume.atual < volume.anterior && (
            <Text className="mt-1.5 font-body text-accent" style={{ fontSize: 11 }}>
              {`↓ -${(volume.anterior - volume.atual).toLocaleString('pt-BR')}kg`}
            </Text>
          )}
          {volume && volume.atual === volume.anterior && (
            <Text className="mt-1.5 font-body text-muted" style={{ fontSize: 11 }}>
              = igual à anterior
            </Text>
          )}
        </View>
      </View>

      {/* CARD PRÓXIMO TREINO */}
      <View className={`${CARD_BASE} mt-2.5 border-l-4 border-l-accent px-4 py-3.5`}>
        {nextWorkout && diaAtual ? (
          showTrocar ? (
            <View>
              <Text className="mb-2 font-label uppercase text-muted" style={{ fontSize: 10 }}>
                Escolher outro dia
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {outrosDias.length === 0 ? (
                  <Text className="font-body text-sm text-muted">Esse plano só tem esse dia.</Text>
                ) : (
                  outrosDias.map((day) => (
                    <Pressable
                      key={day.id}
                      onPress={() => handleTrocarDia(day)}
                      className="rounded-full border border-border px-3 py-1.5">
                      <Text className="font-label text-text" style={{ fontSize: 11 }}>
                        {day.label}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>
              <Pressable onPress={() => setShowTrocar(false)} className="mt-3 self-start">
                <Text className="font-label uppercase text-muted" style={{ fontSize: 11 }}>
                  Cancelar
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="flex-row items-center">
              <View className="flex-1 pr-3">
                <Text className="font-label uppercase text-muted" style={{ fontSize: 10 }}>
                  Próximo treino sugerido
                </Text>
                <Text className="mt-1 font-display uppercase text-text" style={{ fontSize: 20 }} numberOfLines={1}>
                  {diaAtual.label}
                </Text>
                {musculosVisiveis ? (
                  <Text className="mt-0.5 font-body text-muted" style={{ fontSize: 11 }} numberOfLines={1}>
                    {musculosVisiveis}
                  </Text>
                ) : null}
              </View>
              <View className="items-stretch gap-1.5">
                <Pressable
                  onPress={() => handleIniciarAgora(diaAtual.id)}
                  className="items-center justify-center rounded-xl bg-accent"
                  style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
                  <Text className="font-label uppercase text-white" style={{ fontSize: 11 }}>
                    ▶ Iniciar
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowTrocar(true)}
                  className="items-center justify-center rounded-xl border border-border"
                  style={{ paddingVertical: 8, paddingHorizontal: 14 }}>
                  <Text className="font-label uppercase text-muted" style={{ fontSize: 11 }}>
                    ⇄ Trocar
                  </Text>
                </Pressable>
              </View>
            </View>
          )
        ) : (
          <View>
            <Text className="mb-3 font-body text-sm text-muted">Crie um plano pra começar.</Text>
            <Button onPress={() => router.push('/plano/novo')}>Criar plano</Button>
          </View>
        )}
      </View>

      {/* CALENDÁRIO */}
      <View className={`${CARD_BASE} mt-2.5 px-4 py-3.5`}>
        <View className="flex-row items-center justify-between">
          <Text className="font-card-title text-text" style={{ fontSize: 14 }}>
            {`${capitalize(MESES_PT[calendario.mes])} ${calendario.ano}`}
          </Text>
          <Text className="font-label text-accent" style={{ fontSize: 11 }}>
            {`${monthlyCounts?.atual ?? 0} treinos`}
          </Text>
        </View>
        <View className="mt-3 flex-row">
          {DIA_LETRAS_CALENDARIO.map((letra, index) => (
            <View key={index} style={{ width: `${100 / 7}%` }}>
              <Text className="text-center font-label text-muted" style={{ fontSize: 9 }}>
                {letra}
              </Text>
            </View>
          ))}
        </View>
        <View className="mt-1 flex-row flex-wrap">
          {calendario.celulas.map((dia, index) => {
            const treinou = dia !== null && (monthTrainingDays?.has(dia) ?? false);
            const ehHoje = dia === calendario.hojeDia;
            return (
              <View key={index} className="items-center py-0.5" style={{ width: `${100 / 7}%` }}>
                {dia !== null && (
                  <View
                    className="items-center justify-center rounded-full"
                    style={{
                      width: 26,
                      height: 26,
                      backgroundColor: treinou ? colors.accent : 'transparent',
                      borderWidth: ehHoje ? 1 : 0,
                      borderColor: colors.accent,
                    }}>
                    <Text
                      className={`font-body ${treinou ? 'text-white' : 'text-muted'}`}
                      style={{ fontSize: 11 }}>
                      {dia}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* GRID: PR (só se houver) + MÊS — vira 1 coluna sem PR */}
      <View className="mt-2.5 flex-row gap-2.5">
        {latestPR && (
          <View className={`${CARD_BASE} flex-1 px-3.5 py-3.5`}>
            <Text className="font-label uppercase text-muted" style={{ fontSize: 10 }}>
              Último recorde
            </Text>
            <Text className="mt-1 font-display text-accent" style={{ fontSize: 26 }}>{`${latestPR.cargaNova}kg`}</Text>
            <Text className="font-body-medium text-text" style={{ fontSize: 11 }} numberOfLines={1}>
              {latestPR.exerciseNome}
            </Text>
            <Text className="mt-0.5 font-label text-muted" style={{ fontSize: 10 }}>
              {latestPR.data}
            </Text>
          </View>
        )}

        {monthlyCounts && (
          <View className={`${CARD_BASE} ${latestPR ? 'flex-1' : 'w-full'} px-3.5 py-3.5`}>
            <Text className="font-label uppercase text-muted" style={{ fontSize: 10 }}>
              Este mês
            </Text>
            <Text className="mt-1 font-display text-text" style={{ fontSize: 32 }}>
              {monthlyCounts.atual}
            </Text>
            <Text className="font-label text-muted" style={{ fontSize: 11 }}>
              treinos
            </Text>
            {monthlyCounts.atual > monthlyCounts.anterior && (
              <Text className="mt-1 font-body text-success" style={{ fontSize: 11 }}>
                {`↑ +${monthlyCounts.atual - monthlyCounts.anterior} vs ${monthlyCounts.mesAnteriorNome}`}
              </Text>
            )}
            {monthlyCounts.atual < monthlyCounts.anterior && (
              <Text className="mt-1 font-body text-accent" style={{ fontSize: 11 }}>
                {`↓ -${monthlyCounts.anterior - monthlyCounts.atual} vs ${monthlyCounts.mesAnteriorNome}`}
              </Text>
            )}
            {monthlyCounts.atual === monthlyCounts.anterior && (
              <Text className="mt-1 font-body text-muted" style={{ fontSize: 11 }}>
                = igual
              </Text>
            )}

            {lastMonths && (
              <View className="mt-2.5 flex-row items-end gap-1" style={{ height: 24 }}>
                {lastMonths.map((count, index) => (
                  <View
                    key={index}
                    style={{
                      width: 6,
                      height: Math.max(4, Math.round((count / maxMesCount) * 24)),
                      borderRadius: 2,
                      backgroundColor: index === lastMonths.length - 1 ? colors.accent : colors.border,
                    }}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      {/* CARD CATÁLOGO */}
      <Pressable onPress={() => router.push('/catalogo')} className="mb-2.5 mt-2.5">
        <View className={`${CARD_BASE} flex-row items-center px-4 py-3.5`}>
          <View className="items-center justify-center rounded-xl bg-border" style={{ width: 34, height: 34 }}>
            <Ionicons name="barbell-outline" size={18} color={colors.muted} />
          </View>
          <View className="ml-3 flex-1">
            <Text className="font-card-title text-text" style={{ fontSize: 14 }}>
              Catálogo
            </Text>
            <Text className="font-label text-muted" style={{ fontSize: 11 }}>
              {`${totalExercicios ?? '...'} exercícios`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>
      </Pressable>

      {/* CARD MAPA MUSCULAR — mesmo atalho, mesma pegada visual da Catálogo
          logo acima; posicionado junto dela de propósito (é a mesma área de
          "atalhos" no fim do Dashboard, não empurra nenhum conteúdo
          principal — hero/semana/próximo treino/calendário/PR já vêm
          antes). */}
      <Pressable onPress={() => router.push('/mapa-muscular')} className="mb-4">
        <View className={`${CARD_BASE} flex-row items-center px-4 py-3.5`}>
          <View className="items-center justify-center rounded-xl bg-border" style={{ width: 34, height: 34 }}>
            <Ionicons name="body-outline" size={18} color={colors.muted} />
          </View>
          <View className="ml-3 flex-1">
            <Text className="font-card-title text-text" style={{ fontSize: 14 }}>
              Mapa muscular
            </Text>
            <Text className="font-label text-muted" style={{ fontSize: 11 }}>
              Explore exercícios por músculo
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>
      </Pressable>

      {celebrationModal}
    </Screen>
  );
}
