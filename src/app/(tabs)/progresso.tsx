import { Screen } from '@/components/screen';
import { AdherenceSection } from '@/components/progresso/adherence-section';
import { BodyWeightSection } from '@/components/progresso/body-weight-section';
import { DensitySection } from '@/components/progresso/density-section';
import { FrequencySection } from '@/components/progresso/frequency-section';
import { MovementPatternSection } from '@/components/progresso/movement-pattern-section';
import { MuscleSeriesVolumeSection } from '@/components/progresso/muscle-series-volume-section';
import { MuscleVolumeSection } from '@/components/progresso/muscle-volume-section';
import { PersonalRecordsSection } from '@/components/progresso/personal-records-section';
import { StagnationSection } from '@/components/progresso/stagnation-section';
import { WeeklyVolumeSection } from '@/components/progresso/weekly-volume-section';
import { ScreenTitle } from '@/components/ui/screen-title';

export default function ProgressoScreen() {
  return (
    <Screen edges={['top', 'left', 'right']} scrollable>
      <ScreenTitle title="Progresso" />

      <FrequencySection />
      <MuscleSeriesVolumeSection />
      <WeeklyVolumeSection />
      <MuscleVolumeSection />
      <MovementPatternSection />
      <DensitySection />
      <StagnationSection />
      <BodyWeightSection />
      <PersonalRecordsSection />
      <AdherenceSection />
    </Screen>
  );
}
