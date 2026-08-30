import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Card } from './card';
import { colors } from '@/theme/tokens';

type CollapsibleSectionProps = {
  title: string;
  // Opcional — ícone à esquerda do título (ex: CardioSection usa
  // 'flash-outline'). Ausente por padrão, sem mudar nada pros 3 usos já
  // existentes (Análise de volume/Medidas corporais/Histórico de treinos,
  // todos no Perfil) que nunca passaram essa prop.
  icon?: ComponentProps<typeof Ionicons>['name'];
  // Opcional — estado inicial (ex: CardioSection abre já expandida quando
  // houve cardio na semana). `false` por padrão, idêntico ao comportamento
  // de sempre pros usos existentes que não passam essa prop. Só o valor
  // inicial do `useState` — depois de montado, o toque no cabeçalho continua
  // controlando normalmente (não é um prop controlado).
  defaultExpanded?: boolean;
  children: ReactNode;
};

/**
 * Seção com cabeçalho tocável que expande/colapsa o conteúdo — reutilizável
 * (hoje: Análise de volume e Histórico no Perfil, que sozinhas deixavam a
 * tela comprida demais; qualquer seção pesada futura pode usar o mesmo
 * wrapper). Começa COLAPSADA por padrão (`useState(defaultExpanded)`, que é
 * `false` se a prop não for passada — os 3 usos originais continuam assim);
 * `defaultExpanded` deixa um uso específico (ex: CardioSection) nascer já
 * aberto quando fizer sentido.
 *
 * Lazy por construção, sem flag extra: `children` só entra no JSX quando
 * `expanded` é `true` — enquanto colapsado, o que foi passado como filho
 * (ex: `<VolumeAnalysisSection />`) nunca é montado, então os hooks dele
 * (`useDbQuery`/`useLiveQuery`, que disparam a query pesada) nunca rodam.
 * Colapsar de novo DESMONTA o conteúdo (não só esconde via estilo) — reabrir
 * refaz a query do zero; pro tipo de conteúdo aqui (leitura local de SQLite,
 * barata) isso é preferível a manter uma seção escondida "viva" recebendo
 * atualizações à toa.
 */
export function CollapsibleSection({ title, icon, defaultExpanded = false, children }: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Card className="mb-6">
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        className="flex-row items-center justify-between"
        accessibilityRole="button"
        accessibilityState={{ expanded }}>
        <View className="flex-row items-center gap-2">
          {icon && <Ionicons name={icon} size={18} color={colors.accent} />}
          <Text className="font-card-title text-lg text-text">{title}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
      </Pressable>

      {expanded && <View className="mt-4">{children}</View>}
    </Card>
  );
}
