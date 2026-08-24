import { ActivityIndicator, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Card } from '@/components/ui/card';
import { useUserProfile } from '@/db/user-profile';
import { generateCoachReport, type CoachInsight, type CoachInsightTipo } from '@/lib/coach';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

const BORDER_COLOR_BY_TIPO: Record<CoachInsightTipo, string> = {
  positivo: colors.success,
  atencao: colors.warning,
  sugestao: colors.accent,
  neutro: colors.border,
};

// Classes de borda esquerda por tipo — mesmo padrão "border-l-4 border-l-*"
// já usado nos avisos do Assistente e da StagnationSection.
const BORDER_CLASS_BY_TIPO: Record<CoachInsightTipo, string> = {
  positivo: 'border-l-success',
  atencao: 'border-l-warning',
  sugestao: 'border-l-accent',
  neutro: 'border-l-border',
};

/**
 * Seção de destaque do Progresso — a síntese em linguagem natural das
 * análises que já existem no app (volume por músculo, empurrar/puxar,
 * estagnação, aderência, sequência de semanas). Sem CollapsibleSection de
 * propósito: é o resumo que o usuário deveria ler primeiro ao abrir a aba,
 * não mais um gráfico pra escolher abrir.
 */
export function CoachSection() {
  const profile = useUserProfile();
  const userName = profile?.nome ?? null;

  // Mesmas tabelas observadas pelas seções que o coach sintetiza
  // (sessions/set_logs) — qualquer sessão ou série nova reflete no relatório
  // na hora, igual ao resto do Progresso.
  const report = useDbQuery(() => generateCoachReport(userName), ['sessions', 'set_logs'], [userName]);

  if (report === undefined) {
    return (
      <View className="mb-2 items-center py-4">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View className="mb-2">
      <Text className="font-display text-xl text-text" style={{ marginBottom: 16 }}>
        {report.saudacao}
      </Text>

      {report.insights.length === 0 ? (
        <Text className="font-body text-muted">
          Continue treinando — em breve haverá insights sobre seu progresso.
        </Text>
      ) : (
        report.insights.map((insight) => <CoachInsightCard key={insight.id} insight={insight} />)
      )}
    </View>
  );
}

function CoachInsightCard({ insight }: { insight: CoachInsight }) {
  const borderColor = BORDER_COLOR_BY_TIPO[insight.tipo];

  return (
    <Card className={`border-l-4 ${BORDER_CLASS_BY_TIPO[insight.tipo]}`} style={{ marginBottom: 10 }}>
      <View className="flex-row items-center gap-2">
        <Ionicons name={insight.icone} size={20} color={borderColor} />
        <Text className="flex-1 font-card-title text-base text-text" numberOfLines={2}>
          {insight.titulo}
        </Text>
      </View>

      <Text className="mt-1 font-body text-muted" style={{ lineHeight: 20 }}>
        {insight.mensagem}
      </Text>

      {insight.acao && (
        <Text className="mt-2 font-body-medium text-accent" style={{ fontSize: 12 }}>
          {`→ ${insight.acao}`}
        </Text>
      )}
    </Card>
  );
}
