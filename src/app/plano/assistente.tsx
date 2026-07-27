import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { FormModal } from '@/components/form-modal';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Label } from '@/components/ui/label';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { exercises } from '@/db/schema';
import { generateWorkout, type GeneratedPlan } from '@/lib/assistant-generator';
import {
  EXPERIENCE_OPTIONS,
  FREQUENCY_OPTIONS,
  GOAL_OPTIONS,
  parseOptionalNumber,
  type AssistantExperience,
  type AssistantGoal,
  type AssistantProfile,
} from '@/lib/assistant-profile';
import { colors } from '@/theme/tokens';

const TOTAL_QUESTIONS = 5;

export default function AssistenteScreen() {
  const [step, setStep] = useState(0);

  const [alturaText, setAlturaText] = useState('');
  const [pesoText, setPesoText] = useState('');
  const [objetivo, setObjetivo] = useState<AssistantGoal | null>(null);
  const [frequencia, setFrequencia] = useState<number | null>(null);
  const [experiencia, setExperiencia] = useState<AssistantExperience | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);

  const isSummary = step === TOTAL_QUESTIONS;
  const progress = Math.min(step + 1, TOTAL_QUESTIONS) / TOTAL_QUESTIONS;

  const canAdvance =
    step === 2 ? objetivo !== null : step === 3 ? frequencia !== null : step === 4 ? experiencia !== null : true;

  const handleNext = () => {
    if (!canAdvance) return;
    setStep((s) => Math.min(s + 1, TOTAL_QUESTIONS));
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleGenerate = () => {
    // objetivo/frequencia/experiencia já são garantidos não-nulos aqui — não
    // dá pra chegar no resumo sem passar pela validação de cada etapa.
    const profile: AssistantProfile = {
      alturaCm: parseOptionalNumber(alturaText),
      pesoKg: parseOptionalNumber(pesoText),
      objetivo: objetivo!,
      frequencia: frequencia!,
      experiencia: experiencia!,
    };
    // Consulta única (não-reativa) só pra alimentar a geração — nada é
    // salvo no banco aqui, é só modo de inspeção temporário.
    const catalog = db.select().from(exercises).all();
    const plan = generateWorkout(profile, catalog);
    console.log('[assistente] perfil coletado:', profile);
    console.log('[assistente] plano gerado:', plan);
    setGeneratedPlan(plan);
  };

  return (
    <Screen showBack scrollable>
      <ScreenTitle
        title="Montar com assistente"
        subtitle={isSummary ? 'Resumo' : `Pergunta ${step + 1} de ${TOTAL_QUESTIONS}`}
      />

      <ProgressBar progress={progress} className="mb-6" />

      {step === 0 && (
        <View>
          <Label className="mb-4">
            O assistente monta uma sugestão de ponto de partida com base em padrões populares de
            treino — não é prescrição profissional, e você pode editar tudo livremente depois. Se
            você tem lesão ou alguma condição de saúde, procure orientação de um profissional antes
            de seguir o plano.
          </Label>

          <Text className="mb-2 font-card-title text-lg text-text">Altura (cm)</Text>
          <Label className="mb-3">Opcional — pode deixar em branco.</Label>
          <TextInput
            value={alturaText}
            onChangeText={setAlturaText}
            keyboardType="number-pad"
            placeholder="Ex: 175"
            placeholderTextColor={colors.muted}
            autoFocus
            className="rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
          />
        </View>
      )}

      {step === 1 && (
        <View>
          <Text className="mb-2 font-card-title text-lg text-text">Peso (kg)</Text>
          <Label className="mb-3">Opcional — pode deixar em branco.</Label>
          <TextInput
            value={pesoText}
            onChangeText={setPesoText}
            keyboardType="decimal-pad"
            placeholder="Ex: 78"
            placeholderTextColor={colors.muted}
            autoFocus
            className="rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
          />
        </View>
      )}

      {step === 2 && (
        <View>
          <Text className="mb-3 font-card-title text-lg text-text">Qual seu objetivo principal?</Text>
          <View className="flex-row flex-wrap gap-2">
            {GOAL_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={objetivo === option.value}
                onPress={() => setObjetivo(option.value)}
              />
            ))}
          </View>
        </View>
      )}

      {step === 3 && (
        <View>
          <Text className="mb-3 font-card-title text-lg text-text">
            Quantos dias por semana você pode treinar?
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {FREQUENCY_OPTIONS.map((f) => (
              <Chip
                key={f}
                label={`${f} dias`}
                selected={frequencia === f}
                onPress={() => setFrequencia(f)}
              />
            ))}
          </View>
        </View>
      )}

      {step === 4 && (
        <View>
          <Text className="mb-3 font-card-title text-lg text-text">Qual seu nível de experiência?</Text>
          <View className="flex-row flex-wrap gap-2">
            {EXPERIENCE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={experiencia === option.value}
                onPress={() => setExperiencia(option.value)}
              />
            ))}
          </View>
        </View>
      )}

      {isSummary && (
        <View>
          <Text className="mb-4 font-card-title text-lg text-text">Confira suas respostas</Text>

          <View className="mb-6">
            <SummaryRow label="Altura" value={alturaText.trim() ? `${alturaText} cm` : 'Não informado'} />
            <SummaryRow label="Peso" value={pesoText.trim() ? `${pesoText} kg` : 'Não informado'} />
            <SummaryRow
              label="Objetivo"
              value={GOAL_OPTIONS.find((o) => o.value === objetivo)?.label ?? '—'}
            />
            <SummaryRow
              label="Frequência"
              value={frequencia != null ? `${frequencia} dias por semana` : '—'}
            />
            <SummaryRow
              label="Experiência"
              value={EXPERIENCE_OPTIONS.find((e) => e.value === experiencia)?.label ?? '—'}
              isLast
            />
          </View>

          <Button onPress={handleGenerate}>Gerar treino</Button>
        </View>
      )}

      <View className="mt-6 flex-row gap-2">
        {step > 0 && (
          <Button variant="secondary" className="flex-1" onPress={handleBack}>
            Voltar
          </Button>
        )}
        {!isSummary && (
          <Button className="flex-1" disabled={!canAdvance} onPress={handleNext}>
            Próximo
          </Button>
        )}
      </View>

      <FormModal visible={!!generatedPlan} onRequestClose={() => setGeneratedPlan(null)}>
        <Text className="mb-1 font-label text-xs uppercase tracking-wide text-warning">
          Modo de inspeção — nada foi salvo
        </Text>
        <Text className="mb-4 font-card-title text-xl text-text">{generatedPlan?.nomeSugerido}</Text>

        {generatedPlan?.avisos.map((aviso, index) => (
          <View key={index} className="mb-2 rounded border-l-4 border-l-warning bg-surface px-3 py-2">
            <Text className="font-body text-sm text-text">{aviso}</Text>
          </View>
        ))}

        {generatedPlan?.dias.map((dia) => (
          <View key={dia.label} className="mb-4 mt-2">
            <Text className="mb-2 font-card-title text-base text-text">{dia.label}</Text>
            {dia.exercises.map((ex) => (
              <View key={ex.wgerId} className="mb-1 flex-row items-center justify-between">
                <Text className="flex-1 pr-2 font-body text-sm text-text" numberOfLines={1}>
                  {ex.nome}
                </Text>
                <Label>{`${ex.seriesAlvo}x${ex.repsAlvo}`}</Label>
              </View>
            ))}
          </View>
        ))}

        {generatedPlan && generatedPlan.trocas.length > 0 && (
          <View className="mb-4 mt-2">
            <Text className="mb-2 font-card-title text-base text-text">Trocas feitas</Text>
            {generatedPlan.trocas.map((troca, index) => (
              <Text key={index} className="mb-1 font-body text-sm text-muted">
                {`[${troca.motivo === 'nivel' ? 'nível' : 'altura'}] ${troca.dia}: ${troca.original} → ${troca.substituto}`}
              </Text>
            ))}
          </View>
        )}

        <Button className="mt-2" onPress={() => setGeneratedPlan(null)}>
          Fechar
        </Button>
      </FormModal>
    </Screen>
  );
}

function SummaryRow({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  return (
    <View
      className={`flex-row items-center justify-between py-3 ${isLast ? '' : 'border-b border-border'}`}>
      <Label>{label}</Label>
      <Text className="font-body-medium text-base text-text">{value}</Text>
    </View>
  );
}
