import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ExerciseCatalogList } from '@/components/exercise-catalog-list';
import { FormModal } from '@/components/form-modal';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Label } from '@/components/ui/label';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { exercises, workoutPlans, type Exercise } from '@/db/schema';
import { applyGeneratedPlan } from '@/db/templates';
import { getLatestBodyWeightKg } from '@/db/body-weight';
import { useUserProfile } from '@/db/user-profile';
import {
  computeTargets,
  generateWorkout,
  parseRepsRangeToInt,
  type ExerciseSwap,
  type GeneratedDay,
} from '@/lib/assistant-generator';
import {
  EXPERIENCE_OPTIONS,
  FREQUENCY_OPTIONS,
  GOAL_OPTIONS,
  parseOptionalNumber,
  type AssistantExperience,
  type AssistantGoal,
  type AssistantProfile,
} from '@/lib/assistant-profile';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

const TOTAL_QUESTIONS = 5;

type ExerciseTarget = { dayIndex: number; exerciseIndex: number };

function isAssistantExperience(value: string): value is AssistantExperience {
  return EXPERIENCE_OPTIONS.some((option) => option.value === value);
}

export default function AssistenteScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [alturaText, setAlturaText] = useState('');
  const [pesoText, setPesoText] = useState('');
  const [objetivo, setObjetivo] = useState<AssistantGoal | null>(null);
  const [frequencia, setFrequencia] = useState<number | null>(null);
  const [experiencia, setExperiencia] = useState<AssistantExperience | null>(null);

  // Fonte única dos dados pessoais é o Perfil — o questionário só lê de lá
  // pra pré-preencher, nunca escreve de volta (ajuste aqui é pontual pra
  // este treino, o Perfil não muda). `savedProfile`/`latestPesoKg` chegam de
  // forma assíncrona (useLiveQuery/useDbQuery) — os efeitos abaixo aplicam o
  // valor salvo só uma vez, e só enquanto o campo não tiver sido tocado pelo
  // usuário (guardado por *Touched), pra nunca sobrescrever uma edição.
  const savedProfile = useUserProfile();
  const latestPesoKg = useDbQuery(() => getLatestBodyWeightKg(), ['body_weight_logs'], []);
  const [alturaTouched, setAlturaTouched] = useState(false);
  const [pesoTouched, setPesoTouched] = useState(false);
  const [experienciaTouched, setExperienciaTouched] = useState(false);

  useEffect(() => {
    if (alturaTouched) return;
    if (savedProfile?.alturaCm != null) setAlturaText(String(savedProfile.alturaCm));
  }, [savedProfile?.alturaCm, alturaTouched]);

  useEffect(() => {
    if (pesoTouched) return;
    if (latestPesoKg != null) setPesoText(String(latestPesoKg));
  }, [latestPesoKg, pesoTouched]);

  useEffect(() => {
    if (experienciaTouched) return;
    if (savedProfile?.experiencia && isAssistantExperience(savedProfile.experiencia)) {
      setExperiencia(savedProfile.experiencia);
    }
  }, [savedProfile?.experiencia, experienciaTouched]);

  const [profile, setProfile] = useState<AssistantProfile | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [planName, setPlanName] = useState('');
  const [draftDays, setDraftDays] = useState<GeneratedDay[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [trocas, setTrocas] = useState<ExerciseSwap[]>([]);

  const [editingTarget, setEditingTarget] = useState<ExerciseTarget | null>(null);
  const [editSeries, setEditSeries] = useState('');
  const [editReps, setEditReps] = useState('');

  const [swapTarget, setSwapTarget] = useState<ExerciseTarget | null>(null);

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
    const nextProfile: AssistantProfile = {
      alturaCm: parseOptionalNumber(alturaText),
      pesoKg: parseOptionalNumber(pesoText),
      objetivo: objetivo!,
      frequencia: frequencia!,
      experiencia: experiencia!,
    };
    // Consulta única (não-reativa) só pra alimentar a geração.
    const catalog = db.select().from(exercises).all();
    const plan = generateWorkout(nextProfile, catalog);
    setProfile(nextProfile);
    setPlanName(plan.nomeSugerido);
    setDraftDays(plan.dias.map((dia) => ({ label: dia.label, exercises: [...dia.exercises] })));
    setAvisos(plan.avisos);
    setTrocas(plan.trocas);
    setReviewOpen(true);
  };

  const handleRemoveExercise = (target: ExerciseTarget) => {
    const exercise = draftDays[target.dayIndex]?.exercises[target.exerciseIndex];
    if (!exercise) return;
    Alert.alert('Remover exercício', `Remover "${exercise.nome}" deste dia?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          setDraftDays((days) =>
            days.map((day, i) =>
              i === target.dayIndex
                ? { ...day, exercises: day.exercises.filter((_, j) => j !== target.exerciseIndex) }
                : day
            )
          );
        },
      },
    ]);
  };

  const openEditExercise = (target: ExerciseTarget) => {
    const exercise = draftDays[target.dayIndex]?.exercises[target.exerciseIndex];
    if (!exercise) return;
    setEditingTarget(target);
    setEditSeries(String(exercise.seriesAlvo));
    setEditReps(exercise.repsAlvo);
  };

  const handleEditExerciseConfirm = () => {
    if (!editingTarget) return;
    const seriesNum = Number(editSeries);
    const repsText = editReps.trim();
    if (!seriesNum || !repsText) return;
    setDraftDays((days) =>
      days.map((day, i) =>
        i === editingTarget.dayIndex
          ? {
              ...day,
              exercises: day.exercises.map((ex, j) =>
                j === editingTarget.exerciseIndex ? { ...ex, seriesAlvo: seriesNum, repsAlvo: repsText } : ex
              ),
            }
          : day
      )
    );
    setEditingTarget(null);
  };

  const handleSelectSubstitute = (exercise: Exercise) => {
    if (!swapTarget || !profile) return;
    const targets = computeTargets(profile, exercise);
    setDraftDays((days) =>
      days.map((day, i) =>
        i === swapTarget.dayIndex
          ? {
              ...day,
              exercises: day.exercises.map((ex, j) =>
                j === swapTarget.exerciseIndex
                  ? {
                      wgerId: exercise.wgerId,
                      nome: exercise.nome,
                      seriesAlvo: targets.seriesAlvo,
                      repsAlvo: targets.repsAlvo,
                      cargaAlvo: null,
                    }
                  : ex
              ),
            }
          : day
      )
    );
    setSwapTarget(null);
  };

  const handleCancelReview = () => {
    Alert.alert('Descartar sugestão?', 'O plano gerado não será salvo.', [
      { text: 'Continuar editando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => setReviewOpen(false) },
    ]);
  };

  const showTrocasDetail = (motivo: ExerciseSwap['motivo']) => {
    const items = trocas.filter((t) => t.motivo === motivo);
    if (items.length === 0) return;
    const message = items.map((t) => `${t.dia}: ${t.original} → ${t.substituto}`).join('\n');
    Alert.alert(motivo === 'altura' ? 'Ajustes por altura' : 'Ajustes por nível de experiência', message);
  };

  const handleSavePlan = () => {
    const trimmedName = planName.trim();
    if (!trimmedName) return;
    try {
      const planId = db.transaction((tx) => {
        const created = tx
          .insert(workoutPlans)
          .values({ nome: trimmedName, tipo: 'Assistente', criadoEm: new Date().toISOString() })
          .returning()
          .get();

        // Mesma sequência de persistência de applyTemplate/plano/novo.tsx —
        // aqui só reduz a faixa de reps do gerador ("8-12") ao inteiro que o
        // schema espera antes de repassar pra applyGeneratedPlan.
        applyGeneratedPlan(
          tx,
          created.id,
          draftDays.map((day) => ({
            label: day.label,
            exercises: day.exercises.map((ex) => ({
              wgerId: ex.wgerId,
              seriesAlvo: ex.seriesAlvo,
              repsAlvo: parseRepsRangeToInt(ex.repsAlvo),
            })),
          }))
        );

        return created.id;
      });
      router.replace({ pathname: '/plano/[id]', params: { id: String(planId) } });
    } catch (err) {
      console.error('Falha ao salvar plano do assistente:', err);
      Alert.alert('Erro ao salvar plano', String(err instanceof Error ? err.message : err));
    }
  };

  if (reviewOpen && swapTarget) {
    return (
      <Screen>
        <Pressable
          onPress={() => setSwapTarget(null)}
          hitSlop={8}
          className="mb-2 flex-row items-center gap-1 self-start">
          <Ionicons name="chevron-back" size={22} color={colors.muted} />
          <Text className="font-body text-base text-muted">Voltar</Text>
        </Pressable>

        <ScreenTitle title="Trocar exercício" />

        <ExerciseCatalogList
          onSelectExercise={handleSelectSubstitute}
          onViewDetails={(exercise) =>
            router.push({ pathname: '/exercicio/[id]', params: { id: String(exercise.id) } })
          }
        />
      </Screen>
    );
  }

  if (reviewOpen) {
    const hasAltura = trocas.some((t) => t.motivo === 'altura');
    const hasNivel = trocas.some((t) => t.motivo === 'nivel');

    return (
      <Screen scrollable>
        <Pressable
          onPress={handleCancelReview}
          hitSlop={8}
          className="mb-2 flex-row items-center gap-1 self-start">
          <Ionicons name="chevron-back" size={22} color={colors.muted} />
          <Text className="font-body text-base text-muted">Cancelar</Text>
        </Pressable>

        <ScreenTitle title="Revisar plano" subtitle="Sugestão do assistente" />

        <View className="mb-4 rounded border-l-4 border-l-accent bg-surface px-3 py-2">
          <Text className="font-body text-sm text-muted">
            Isso é só um ponto de partida sugerido — revise, ajuste o que quiser e salve quando estiver de
            acordo.
          </Text>
        </View>

        <Label className="mb-1">Nome do plano</Label>
        <TextInput
          value={planName}
          onChangeText={setPlanName}
          className="mb-4 rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
        />

        {avisos.map((aviso, index) => (
          <View key={index} className="mb-2 rounded border-l-4 border-l-warning bg-surface px-3 py-2">
            <Text className="font-body text-sm text-text">{aviso}</Text>
          </View>
        ))}

        {hasAltura && (
          <Pressable
            onPress={() => showTrocasDetail('altura')}
            className="mb-2 rounded border-l-4 border-l-accent bg-surface px-3 py-2">
            <Text className="font-body text-sm text-muted">
              Ajustamos alguns exercícios pensando na sua altura — toque para saber mais
            </Text>
          </Pressable>
        )}

        {hasNivel && (
          <Pressable
            onPress={() => showTrocasDetail('nivel')}
            className="mb-2 rounded border-l-4 border-l-accent bg-surface px-3 py-2">
            <Text className="font-body text-sm text-muted">
              Trocamos alguns exercícios pra combinar com seu nível de experiência — toque para saber mais
            </Text>
          </Pressable>
        )}

        {draftDays.map((day, dayIndex) => (
          <View key={`${day.label}-${dayIndex}`} className="mb-4 mt-2">
            <Text className="mb-2 font-card-title text-base text-text">{day.label}</Text>

            {day.exercises.map((ex, exerciseIndex) => (
              <View
                key={`${ex.wgerId}-${exerciseIndex}`}
                className="mb-2 flex-row items-center justify-between rounded border border-border bg-bg px-3 py-2">
                <Pressable
                  className="flex-1 flex-row items-center justify-between pr-2"
                  onPress={() => openEditExercise({ dayIndex, exerciseIndex })}>
                  <Text className="flex-1 pr-2 font-body-medium text-base text-text" numberOfLines={1}>
                    {ex.nome}
                  </Text>
                  <Text className="font-display text-lg text-text" numberOfLines={1}>
                    {`${ex.seriesAlvo}x${ex.repsAlvo}`}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setSwapTarget({ dayIndex, exerciseIndex })}
                  hitSlop={6}
                  className="ml-2 p-1">
                  <Ionicons name="swap-horizontal" size={20} color={colors.muted} />
                </Pressable>
                <Pressable
                  onPress={() => handleRemoveExercise({ dayIndex, exerciseIndex })}
                  hitSlop={6}
                  className="ml-1 p-1">
                  <Ionicons name="trash-outline" size={20} color={colors.muted} />
                </Pressable>
              </View>
            ))}

            {day.exercises.length === 0 && (
              <Text className="font-body text-sm text-muted">Nenhum exercício neste dia.</Text>
            )}
          </View>
        ))}

        <Button className="mt-2" disabled={!planName.trim()} onPress={handleSavePlan}>
          Salvar plano
        </Button>
        <Button variant="secondary" className="mt-2" onPress={handleCancelReview}>
          Cancelar
        </Button>

        <FormModal visible={!!editingTarget} onRequestClose={() => setEditingTarget(null)}>
          <Text className="mb-3 font-card-title text-lg text-text">
            {editingTarget ? draftDays[editingTarget.dayIndex]?.exercises[editingTarget.exerciseIndex]?.nome : ''}
          </Text>

          <Label className="mb-1">Séries</Label>
          <TextInput
            value={editSeries}
            onChangeText={setEditSeries}
            keyboardType="number-pad"
            className="mb-3 rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
          />

          <Label className="mb-1">Repetições</Label>
          <TextInput
            value={editReps}
            onChangeText={setEditReps}
            placeholder="Ex: 8-12"
            placeholderTextColor={colors.muted}
            className="mb-4 rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
          />

          <View className="flex-row gap-2">
            <Button variant="secondary" className="flex-1" onPress={() => setEditingTarget(null)}>
              Cancelar
            </Button>
            <Button className="flex-1" onPress={handleEditExerciseConfirm}>
              Salvar
            </Button>
          </View>
        </FormModal>
      </Screen>
    );
  }

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
            onChangeText={(text) => {
              setAlturaTouched(true);
              setAlturaText(text);
            }}
            keyboardType="number-pad"
            placeholder="Ex: 175"
            placeholderTextColor={colors.muted}
            autoFocus
            className="rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
          />
          {!alturaTouched && savedProfile?.alturaCm != null && (
            <Label className="mt-2 text-accent">Preenchido do seu perfil — ajuste se quiser.</Label>
          )}
        </View>
      )}

      {step === 1 && (
        <View>
          <Text className="mb-2 font-card-title text-lg text-text">Peso (kg)</Text>
          <Label className="mb-3">Opcional — pode deixar em branco.</Label>
          <TextInput
            value={pesoText}
            onChangeText={(text) => {
              setPesoTouched(true);
              setPesoText(text);
            }}
            keyboardType="decimal-pad"
            placeholder="Ex: 78"
            placeholderTextColor={colors.muted}
            autoFocus
            className="rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
          />
          {!pesoTouched && latestPesoKg != null && (
            <Label className="mt-2 text-accent">Preenchido do seu último registro de peso — ajuste se quiser.</Label>
          )}
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
                onPress={() => {
                  setExperienciaTouched(true);
                  setExperiencia(option.value);
                }}
              />
            ))}
          </View>
          {!experienciaTouched && experiencia != null && (
            <Label className="mt-3 text-accent">Preenchido do seu perfil — ajuste se quiser.</Label>
          )}
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
