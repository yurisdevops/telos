import { useMemo } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { db } from '@/db';
import { exercises, sessions } from '@/db/schema';
import {
  computeLastMonthsTrainingCounts,
  computeMonthlyTrainingCounts,
  computeWeekTrainingCount,
  getLatestPR,
  getNextSuggestedWorkout,
} from '@/db/dashboard-stats';
import { useUserProfile } from '@/db/user-profile';
import { computeWeekStreak, getTodayDateString, getWeekStartIso } from '@/lib/date';
import { getFraseDoDia } from '@/lib/motivational';
import { computeTrainedDaysInWeek } from '@/lib/stats';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

// O perfil (user_profile, schema.ts) não tem nenhum campo de frequência/meta
// semanal hoje (só nome/altura/experiência/foto/sexo) — sem essa fundação,
// a meta fica só no valor fixo abaixo até existir um campo de meta de
// verdade no perfil.
const META_SEMANAL_PADRAO = 3;

// Streak mínimo pra valer a pena mostrar o badge de sequência — 1 semana
// sozinha não é uma "sequência", é só a semana atual.
const STREAK_MINIMO_EXIBICAO = 2;

const MESES_MINI_BARRAS = 6;

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

function reportError(context: string, err: unknown) {
  console.error(context, err);
  Alert.alert(context, String(err instanceof Error ? err.message : err));
}

export default function DashboardScreen() {
  const router = useRouter();
  const profile = useUserProfile();
  // `useMemo(..., [])`: saudação e frase do dia não devem mudar a cada
  // re-render (só importa a hora/dia em que a tela MONTOU) — recalcular a
  // cada render trocaria "Boa tarde" por "Boa noite" no meio do uso se o
  // usuário ficar com o app aberto atravessando a hora de corte.
  const frase = useMemo(() => getFraseDoDia(), []);
  const saudacao = useMemo(() => getSaudacao(new Date().getHours()), []);
  const weekStartIso = useMemo(() => getWeekStartIso(getTodayDateString()), []);

  // Datas de sessões concluídas — alimenta o streak (computeWeekStreak) e os
  // dots de dias da semana (computeTrainedDaysInWeek, mesma função pura já
  // usada no card de compartilhamento — ver workout-share-card.tsx), e
  // também detecta "usuário novo" (nenhuma sessão concluída ainda), sem
  // precisar de uma query extra só pra isso.
  const { data: concludedSessionRows } = useLiveQuery(
    db.select({ data: sessions.data }).from(sessions).where(eq(sessions.concluida, true))
  );
  const concludedDates = useMemo(() => (concludedSessionRows ?? []).map((row) => row.data), [concludedSessionRows]);
  const streak = useMemo(() => computeWeekStreak(concludedDates), [concludedDates]);
  const diasSemana = useMemo(
    () => computeTrainedDaysInWeek(concludedDates, weekStartIso),
    [concludedDates, weekStartIso]
  );
  // `undefined` (1ª emissão do useLiveQuery ainda não chegou) NÃO conta como
  // "novo" — evita o flash do card de boas-vindas pra quem já tem histórico
  // só porque a query ainda não respondeu.
  const isUsuarioNovo = concludedSessionRows !== undefined && concludedSessionRows.length === 0;

  const weekCount = useDbQuery(computeWeekTrainingCount, ['sessions'], []);
  const monthlyCounts = useDbQuery(computeMonthlyTrainingCounts, ['sessions'], []);
  const lastMonths = useDbQuery(() => computeLastMonthsTrainingCounts(MESES_MINI_BARRAS), ['sessions'], []);
  const latestPR = useDbQuery(getLatestPR, ['sessions', 'set_logs'], []);
  const nextWorkout = useDbQuery(getNextSuggestedWorkout, ['sessions', 'workout_days', 'workout_plans'], []);
  const totalExercicios = useDbQuery(() => db.$count(exercises), ['exercises'], []);

  const weekProgress = weekCount != null ? Math.max(0, Math.min(1, weekCount / META_SEMANAL_PADRAO)) : 0;
  const maxMesCount = lastMonths ? Math.max(1, ...lastMonths) : 1;

  // Mesma semântica de handleStartDay (hoje.tsx): cria a sessão de hoje pro
  // dia sugerido. Reimplementado aqui (não importado de hoje.tsx, que não
  // exporta nada) com a mesma trava de "já existe sessão hoje" de
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

  const hero = (
    <View className="pb-2 pt-2">
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
    </View>
  );

  if (isUsuarioNovo) {
    return (
      <Screen edges={['top', 'left', 'right']} scrollable>
        {hero}
        <View className={`${CARD_BASE} mt-4 px-4 py-3.5`}>
          <Text className="mb-2 font-card-title text-lg text-text">Bem-vindo ao Telos!</Text>
          <Text className="mb-4 font-body text-sm text-muted">Crie seu primeiro plano e comece hoje.</Text>
          <Button onPress={() => router.push('/plano/novo')}>Criar meu primeiro plano</Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right']} scrollable>
      {hero}

      {/* CARD SEMANA */}
      <View className={`${CARD_BASE} mt-4 px-4 py-3.5`}>
        <Text className="font-label uppercase text-muted" style={{ fontSize: 10 }}>
          Esta semana
        </Text>
        <View className="mt-2 flex-row items-center justify-between">
          <Text className="font-display text-text" style={{ fontSize: 26 }}>
            {`${weekCount ?? 0} de ${META_SEMANAL_PADRAO} treinos`}
          </Text>
          {streak >= STREAK_MINIMO_EXIBICAO && (
            <View
              className="flex-row items-center rounded-full px-2.5 py-1"
              style={{ backgroundColor: `${colors.accent}1A`, borderWidth: 1, borderColor: `${colors.accent}4D` }}>
              <Text className="font-label text-accent" style={{ fontSize: 11 }}>{`🔥 ${streak} semanas`}</Text>
            </View>
          )}
        </View>
        <View className="mt-3 h-1 overflow-hidden rounded-full bg-border">
          <View className="h-full rounded-full bg-accent" style={{ width: `${weekProgress * 100}%` }} />
        </View>
        {/* Dots dos dias — 7 (segunda-domingo), um por dia REAL da semana
            (computeTrainedDaysInWeek), não um contador solto de "5 dots" —
            layout aprovado pedia "5 dots (ou frequência do perfil)", mas sem
            frequência no perfil (ver comentário de META_SEMANAL_PADRAO) e
            sem um recorte óbvio de "quais 5 dos 7 dias", os 7 dias reais da
            semana são o dado correto que já existe (mesma função usada no
            card de compartilhamento) — 5 dots fixos, sem ligação a dia
            nenhum, mostrariam informação incorreta. */}
        <View className="mt-3 flex-row gap-1.5">
          {diasSemana.map((treinou, index) => (
            <View
              key={index}
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: treinou ? colors.accent : 'transparent',
                borderWidth: treinou ? 0 : 1,
                borderColor: colors.border,
              }}
            />
          ))}
        </View>
      </View>

      {/* CARD PRÓXIMO TREINO */}
      <View className={`${CARD_BASE} mt-2.5 flex-row items-center border-l-4 border-l-accent px-4 py-3.5`}>
        {nextWorkout ? (
          <>
            <View className="flex-1 pr-3">
              <Text className="font-label uppercase text-muted" style={{ fontSize: 10 }}>
                Próximo treino
              </Text>
              <Text className="mt-1 font-display uppercase text-text" style={{ fontSize: 20 }} numberOfLines={1}>
                {nextWorkout.dayNome}
              </Text>
              {nextWorkout.musculos !== '' && (
                <Text className="mt-0.5 font-body text-muted" style={{ fontSize: 11 }} numberOfLines={1}>
                  {nextWorkout.musculos}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => handleIniciarAgora(nextWorkout.dayId)}
              className="items-center justify-center rounded-xl bg-accent"
              style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
              <Text className="font-label uppercase text-white" style={{ fontSize: 11 }}>
                ▶ Iniciar
              </Text>
            </Pressable>
          </>
        ) : (
          <View className="flex-1">
            <Text className="mb-3 font-body text-sm text-muted">Crie um plano pra começar.</Text>
            <Button onPress={() => router.push('/plano/novo')}>Criar plano</Button>
          </View>
        )}
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
      <Pressable onPress={() => router.push('/catalogo')} className="mb-4 mt-2.5">
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
    </Screen>
  );
}
