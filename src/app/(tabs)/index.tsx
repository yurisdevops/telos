import { useMemo } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { db } from '@/db';
import { exercises, sessions } from '@/db/schema';
import {
  computeMonthlyTrainingCounts,
  computeWeekTrainingCount,
  getLatestPR,
  getNextSuggestedWorkout,
} from '@/db/dashboard-stats';
import { useUserProfile } from '@/db/user-profile';
import { computeWeekStreak, formatShortDateLabel, getTodayDateString } from '@/lib/date';
import { getFraseDoDia } from '@/lib/motivational';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

// O perfil (user_profile, schema.ts) não tem nenhum campo de frequência/meta
// semanal hoje (só nome/altura/experiência/foto/sexo) — sem essa fundação,
// "meta = frequência do perfil ou 3 como fallback" sempre cai no fallback.
// Fica só o valor fixo até existir um campo de meta de verdade no perfil.
const META_SEMANAL_PADRAO = 3;

// Streak mínimo pra valer a pena mostrar o selo de sequência — 1 semana
// sozinha não é uma "sequência", é só a semana atual.
const STREAK_MINIMO_EXIBICAO = 2;

// Mesma lista de MONTHS em lib/date.ts (privada, não exportada de lá) —
// duplicada aqui só pro nome do mês anterior no card MÊS; exportar de
// date.ts ficaria fora do escopo combinado desta etapa (5 arquivos).
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

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

  // Datas de sessões concluídas — alimenta o streak (computeWeekStreak, já
  // existente) e também detecta "usuário novo" (nenhuma sessão concluída
  // ainda), sem precisar de uma 2ª query só pra isso.
  const { data: concludedSessionRows } = useLiveQuery(
    db.select({ data: sessions.data }).from(sessions).where(eq(sessions.concluida, true))
  );
  const streak = useMemo(
    () => computeWeekStreak((concludedSessionRows ?? []).map((row) => row.data)),
    [concludedSessionRows]
  );
  // `undefined` (1ª emissão do useLiveQuery ainda não chegou) NÃO conta como
  // "novo" — evita o flash do card de boas-vindas pra quem já tem histórico
  // só porque a query ainda não respondeu.
  const isUsuarioNovo = concludedSessionRows !== undefined && concludedSessionRows.length === 0;

  const weekCount = useDbQuery(computeWeekTrainingCount, ['sessions'], []);
  const monthlyCounts = useDbQuery(computeMonthlyTrainingCounts, ['sessions'], []);
  const latestPR = useDbQuery(getLatestPR, ['sessions', 'set_logs'], []);
  const nextWorkout = useDbQuery(getNextSuggestedWorkout, ['sessions', 'workout_days', 'workout_plans'], []);
  const totalExercicios = useDbQuery(() => db.$count(exercises), ['exercises'], []);

  const weekProgress = weekCount != null ? Math.max(0, Math.min(1, weekCount / META_SEMANAL_PADRAO)) : 0;

  // Mesma semântica de handleStartDay (hoje.tsx): cria a sessão de hoje pro
  // dia sugerido. Reimplementado aqui (não importado de hoje.tsx, que não
  // exporta nada) com a mesma trava de "já existe sessão hoje" de
  // treinarAgora/treinarAgoraComExercicios (ready-workouts.ts) — sem ela,
  // tocar "Iniciar agora" com um treino já em andamento criaria uma 2ª
  // sessão órfã pro dia (hoje.tsx só mostra a primeira, `todaySessions?.[0]`).
  // Com sessão já em aberto, só navega — a tela de Treinar mostra o que já
  // está rolando.
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

  const header = (
    <View className="pb-4 pt-2">
      <Text className="font-display text-3xl uppercase text-text">
        {profile?.nome ? `${saudacao}, ${profile.nome}!` : `${saudacao}!`}
      </Text>
      <Text className="mt-1 font-body text-sm italic text-muted">{frase}</Text>
    </View>
  );

  if (isUsuarioNovo) {
    return (
      <Screen edges={['top', 'left', 'right']} scrollable>
        {header}
        <Card>
          <Text className="mb-2 font-card-title text-lg text-text">Bem-vindo ao Telos!</Text>
          <Text className="mb-4 font-body text-sm text-muted">
            Crie seu primeiro plano de treino e comece hoje.
          </Text>
          <Button onPress={() => router.push('/plano/novo')}>Criar meu primeiro plano</Button>
        </Card>
      </Screen>
    );
  }

  const diffMes = monthlyCounts ? Math.abs(monthlyCounts.atual - monthlyCounts.anterior) : 0;
  const mesAnteriorNome = MESES[(new Date().getMonth() + 11) % 12];

  return (
    <Screen edges={['top', 'left', 'right']} scrollable>
      {header}

      {/* CARD SEMANA */}
      <View className="mb-4 rounded-xl border border-border bg-surface p-4">
        <Label>Esta semana</Label>
        <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
          <View className="h-full rounded-full bg-accent" style={{ width: `${weekProgress * 100}%` }} />
        </View>
        <Text className="mt-2 font-body text-sm text-text">{`${weekCount ?? 0} de ${META_SEMANAL_PADRAO} treinos`}</Text>
        {streak >= STREAK_MINIMO_EXIBICAO && (
          <Text className="mt-1 font-body text-sm text-muted">{`🔥 ${streak} semanas seguidas`}</Text>
        )}
      </View>

      {/* CARD PRÓXIMO TREINO */}
      <Card className="mb-4 border-l-4 border-l-accent">
        {nextWorkout ? (
          <>
            <Label>Próximo treino</Label>
            <Text className="mt-1 font-display text-2xl text-text" numberOfLines={1}>
              {nextWorkout.planNome}
            </Text>
            <Text className="font-display text-2xl text-accent" numberOfLines={1}>
              {nextWorkout.dayNome}
            </Text>
            <Button className="mt-3" onPress={() => handleIniciarAgora(nextWorkout.dayId)}>
              Iniciar agora
            </Button>
          </>
        ) : (
          <>
            <Text className="mb-3 font-body text-sm text-muted">Crie um plano pra começar.</Text>
            <Button onPress={() => router.push('/plano/novo')}>Criar plano</Button>
          </>
        )}
      </Card>

      {/* CARD ÚLTIMO RECORDE — só existe se houver PR recente */}
      {latestPR && (
        <Card className="mb-4">
          <Label className="text-accent">🏆 Novo recorde</Label>
          <Text className="mt-1 font-display text-xl text-text">{latestPR.exerciseNome}</Text>
          <Text className="font-display text-3xl text-accent">{`${latestPR.cargaNova}kg`}</Text>
          <Label className="mt-1">{formatShortDateLabel(latestPR.data)}</Label>
        </Card>
      )}

      {/* CARD MÊS */}
      {monthlyCounts && (
        <Card className="mb-4">
          <Label>Este mês</Label>
          <Text className="mt-1 font-display text-3xl text-text">{`${monthlyCounts.atual} treinos`}</Text>
          {monthlyCounts.atual > monthlyCounts.anterior && (
            <Text className="mt-1 font-body text-sm text-success">{`↑ ${diffMes} a mais que ${mesAnteriorNome}`}</Text>
          )}
          {monthlyCounts.atual < monthlyCounts.anterior && (
            <Text className="mt-1 font-body text-sm text-accent">{`↓ ${diffMes} a menos que ${mesAnteriorNome}`}</Text>
          )}
          {monthlyCounts.atual === monthlyCounts.anterior && (
            <Text className="mt-1 font-body text-sm text-muted">= igual ao mês passado</Text>
          )}
        </Card>
      )}

      {/* ATALHO CATÁLOGO */}
      <Pressable onPress={() => router.push('/catalogo')} className="mb-3">
        <Card className="flex-row items-center gap-3">
          <Ionicons name="barbell-outline" size={24} color={colors.accent} />
          <View className="flex-1">
            <Text className="font-card-title text-base text-text">Catálogo de exercícios</Text>
            <Label className="mt-0.5">{`${totalExercicios ?? '...'} exercícios →`}</Label>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Card>
      </Pressable>
    </Screen>
  );
}
