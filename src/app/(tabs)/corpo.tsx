import { BodySilhouette } from '@/components/corpo/body-silhouette';
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
// BodySilhouette (v1 "tosca de propósito" — Fase 2 do boneco) fica no TOPO,
// é o destaque da aba: reage a ombro/cintura/quadril, mas ainda não a
// braço/coxa/panturrilha nem a lado esquerdo/direito — isso é refinamento de
// rodadas futuras, sobre a mesma fundação de dados que peso/medidas abaixo
// já alimentam.
export default function CorpoScreen() {
  return (
    <Screen edges={['top', 'left', 'right']} scrollable>
      <ScreenTitle title="Corpo" />

      <BodySilhouette />

      <BodyWeightSection />

      <CollapsibleSection title="Medidas corporais">
        <MeasurementsSection />
      </CollapsibleSection>
    </Screen>
  );
}
