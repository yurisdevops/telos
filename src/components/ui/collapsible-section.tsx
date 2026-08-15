import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Card } from './card';
import { colors } from '@/theme/tokens';

type CollapsibleSectionProps = {
  title: string;
  children: ReactNode;
};

/**
 * Seção com cabeçalho tocável que expande/colapsa o conteúdo — reutilizável
 * (hoje: Análise de volume e Histórico no Perfil, que sozinhas deixavam a
 * tela comprida demais; qualquer seção pesada futura pode usar o mesmo
 * wrapper). Sempre começa COLAPSADA (`useState(false)`).
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
export function CollapsibleSection({ title, children }: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="mb-6">
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        className="flex-row items-center justify-between"
        accessibilityRole="button"
        accessibilityState={{ expanded }}>
        <Text className="font-card-title text-lg text-text">{title}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
      </Pressable>

      {expanded && <View className="mt-4">{children}</View>}
    </Card>
  );
}
