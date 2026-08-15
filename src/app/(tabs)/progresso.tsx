import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Screen } from '@/components/screen';
import { AdherenceSection } from '@/components/progresso/adherence-section';
import { BodyWeightSection } from '@/components/progresso/body-weight-section';
import { DensitySection } from '@/components/progresso/density-section';
import { FrequencySection } from '@/components/progresso/frequency-section';
import { MeasurementsSection } from '@/components/progresso/measurements-section';
import { MovementPatternSection } from '@/components/progresso/movement-pattern-section';
import { MuscleSeriesVolumeSection } from '@/components/progresso/muscle-series-volume-section';
import { MuscleVolumeSection } from '@/components/progresso/muscle-volume-section';
import { PersonalRecordsSection } from '@/components/progresso/personal-records-section';
import { StagnationSection } from '@/components/progresso/stagnation-section';
import { WeeklyVolumeSection } from '@/components/progresso/weekly-volume-section';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { ScreenTitle } from '@/components/ui/screen-title';

export default function ProgressoScreen() {
  // As abas do app não desmontam ao perder foco (expo-router/<Tabs> mantém
  // vivo o que já foi visitado) — então, uma vez que o Progresso é aberto
  // uma vez, ele fica com o resultado das queries em cache pra sempre,
  // mesmo que outra aba (ex: "Resetar histórico" no Perfil) apague sessions/
  // set_logs. DELETE sem WHERE não dispara o update_hook do SQLite (ver
  // reset-history.ts), então nem useLiveQuery nem useDbQuery (usados nas
  // seções abaixo) percebem sozinhos. Solução geral, não amarrada ao reset:
  // remonta o conteúdo (via `key`) toda vez que a aba GANHA foco — cada
  // seção refaz sua query do zero nesse remonte, igual abrir o app de novo.
  // `isFirstFocus` pula o bump no mount inicial (o próprio mount já busca
  // fresco sozinho; sem essa guarda, o primeiro foco dispararia um segundo
  // fetch imediato e redundante).
  const [focusKey, setFocusKey] = useState(0);
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      setFocusKey((k) => k + 1);
    }, [])
  );

  return (
    <Screen edges={['top', 'left', 'right']} scrollable>
      <ScreenTitle title="Progresso" />

      <View key={focusKey}>
        <FrequencySection />
        <MuscleSeriesVolumeSection />
        <WeeklyVolumeSection />
        <MuscleVolumeSection />
        <MovementPatternSection />
        <DensitySection />
        <StagnationSection />
        <BodyWeightSection />
        <CollapsibleSection title="Medidas corporais">
          <MeasurementsSection />
        </CollapsibleSection>
        <PersonalRecordsSection />
        <AdherenceSection />
      </View>
    </Screen>
  );
}
