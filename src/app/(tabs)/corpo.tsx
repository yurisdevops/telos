import { MuscleBody } from '@/components/corpo/muscle-body';
import { Screen } from '@/components/screen';
import { BodyWeightSection } from '@/components/progresso/body-weight-section';
import { MeasurementsSection } from '@/components/progresso/measurements-section';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { ScreenTitle } from '@/components/ui/screen-title';

// Peso (BodyWeightSection) e medidas (MeasurementsSection) migraram de
// Progresso pra cá — mesmos componentes, só de lar novo (mesmo padrão já
// usado quando o histórico de treinos migrou de Treinar pro Perfil): nenhum
// dos dois depende de onde é montado, só leem/escrevem em body_weight_logs/
// body_measurements via seus próprios hooks.
//
// MuscleBody (react-native-body-highlighter) fica no TOPO, é o destaque da
// aba — substitui a silhueta paramétrica (removida, não ficou boa) por um
// corpo desenhado pela lib, com os músculos acesos conforme o treino.
export default function CorpoScreen() {
  return (
    <Screen edges={['top', 'left', 'right']} scrollable>
      <ScreenTitle title="Corpo" />

      <MuscleBody />

      <BodyWeightSection />

      <CollapsibleSection title="Medidas corporais">
        <MeasurementsSection />
      </CollapsibleSection>
    </Screen>
  );
}
