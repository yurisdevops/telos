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
// Espaço reservado (só de propósito, nada implementado ainda) no topo desta
// tela pro boneco 2D (fase separada, futura) — é por isso que a tela começa
// direto com peso, sem nenhum outro conteúdo entre o título e as seções: o
// boneco entra bem aqui, antes de peso/medidas, quando chegar a hora.
export default function CorpoScreen() {
  return (
    <Screen edges={['top', 'left', 'right']} scrollable>
      <ScreenTitle title="Corpo" />

      <BodyWeightSection />

      <CollapsibleSection title="Medidas corporais">
        <MeasurementsSection />
      </CollapsibleSection>
    </Screen>
  );
}
