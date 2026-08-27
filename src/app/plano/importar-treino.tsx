import { useRef, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { workoutPlans } from '@/db/schema';
import { applyGeneratedPlan } from '@/db/templates';
import { parseRepsRangeToInt } from '@/lib/assistant-generator';
import { parseWorkoutText, type ParsedWorkout } from '@/lib/workout-parser';
import { colors } from '@/theme/tokens';

const PLACEHOLDER =
  'Ex:\nPush A\nSupino 4x10\nDesenvolvimento 3x12\n\nPush B\n...';

function reportError(context: string, err: unknown) {
  console.error(context, err);
  Alert.alert(context, String(err instanceof Error ? err.message : err));
}

export default function ImportarTreinoScreen() {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState<ParsedWorkout | null>(null);
  const [nomePlano, setNomePlano] = useState('');
  const [interpretando, setInterpretando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // `<Screen scrollable scrollRef={scrollRef}>` expõe o ScrollView interno
  // da própria Screen (não um ScrollView aninhado por cima — isso duplicaria
  // o gesto de rolagem) — mesmo padrão já usado em hoje.tsx.
  const scrollRef = useRef<ScrollView>(null);

  const handleInterpretar = async () => {
    if (!texto.trim()) return;
    setInterpretando(true);
    try {
      const parsed = await parseWorkoutText(texto);
      setResultado(parsed);
      setNomePlano(parsed.nomeSugerido);
      // 300ms: dá tempo da prévia (potencialmente vários dias/exercícios)
      // terminar de montar/medir antes de rolar — rolar pro fim ANTES do
      // conteúdo novo existir de verdade rolaria só até o fim do que já
      // estava lá (o botão "Interpretar treino"), não até a prévia.
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
    } catch (err) {
      reportError('Erro ao interpretar treino', err);
    } finally {
      setInterpretando(false);
    }
  };

  // Reusa `applyGeneratedPlan` (db/templates.ts) — o mesmo que o assistente
  // usa (plano/assistente.tsx) — em vez de reimplementar os inserts de
  // workout_days/workout_day_exercises aqui. Ela já resolve por `wgerId` e
  // já pula silenciosamente qualquer exercício não encontrado no catálogo
  // (mesmo critério do parser: `wgerId: null` vira "não encontrado" na
  // prévia e, por construção — o filter abaixo —, nunca chega até aqui).
  const handleSalvar = async () => {
    if (!resultado || resultado.dias.length === 0) return;
    const nome = nomePlano.trim() || resultado.nomeSugerido;
    setSalvando(true);
    try {
      db.transaction((tx) => {
        const plan = tx
          .insert(workoutPlans)
          .values({ nome, tipo: 'Importado', criadoEm: new Date().toISOString() })
          .returning()
          .get();

        applyGeneratedPlan(
          tx,
          plan.id,
          resultado.dias.map((dia) => ({
            label: dia.nome,
            exercises: dia.exercicios
              .filter((ex) => ex.wgerId !== null)
              .map((ex) => ({
                wgerId: ex.wgerId as number,
                seriesAlvo: ex.series,
                repsAlvo: parseRepsRangeToInt(ex.reps),
              })),
          }))
        );
      });

      router.push('/planilhas');
      Alert.alert('Plano salvo!', `"${nome}" foi salvo em Planilhas.`);
    } catch (err) {
      reportError('Erro ao salvar plano', err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Screen showBack scrollable scrollRef={scrollRef}>
      <ScreenTitle title="Importar treino" />

      <Text className="mb-4 font-body text-sm text-muted">
        Cole aqui o treino enviado pelo seu professor. O Atlas vai interpretar e montar o plano
        automaticamente.
      </Text>

      <TextInput
        value={texto}
        onChangeText={(value) => {
          setTexto(value);
          // Texto mudou depois de já ter interpretado uma vez — a prévia
          // anterior não corresponde mais ao que está no campo; some até o
          // usuário interpretar de novo, em vez de deixar uma prévia velha
          // enganando (ou pior, salvando um plano diferente do texto atual).
          if (resultado) setResultado(null);
        }}
        placeholder={PLACEHOLDER}
        placeholderTextColor={colors.muted}
        multiline
        textAlignVertical="top"
        className="rounded-xl border border-border bg-surface px-4 py-4 font-body text-base text-text"
        style={{ minHeight: 200 }}
      />

      <Button className="mt-4" onPress={handleInterpretar} disabled={!texto.trim() || interpretando}>
        {interpretando ? 'Interpretando...' : 'Interpretar treino'}
      </Button>

      {resultado && (
        <View className="mt-6">
          {resultado.totalExercicios === 0 ? (
            <Text className="text-center font-body text-sm text-muted">
              Não consegui interpretar o treino. Verifique o formato.
            </Text>
          ) : (
            <>
              <Label className="mb-4">
                {`${resultado.totalEncontrados} exercícios encontrados de ${resultado.totalExercicios}`}
              </Label>

              <Label className="mb-1">Nome do plano</Label>
              <Input
                value={nomePlano}
                onChangeText={setNomePlano}
                placeholder={resultado.nomeSugerido}
                className="mb-5"
              />

              {resultado.dias.map((dia, diaIndex) => (
                <View key={diaIndex} className="mb-5">
                  <Text className="mb-2 font-display text-xl uppercase text-text">{dia.nome}</Text>
                  {dia.exercicios.map((ex, exIndex) => (
                    <View
                      key={exIndex}
                      className="mb-2 flex-row items-center justify-between border-b border-border pb-2">
                      <View className="flex-1 pr-3">
                        <Text className={`font-body text-sm ${ex.wgerId !== null ? 'text-text' : 'text-muted'}`}>
                          {ex.nomeTexto}
                        </Text>
                        {ex.wgerId === null && (
                          <Text className="mt-0.5 font-label text-xs text-accent">
                            ⚠️ não encontrado no catálogo
                          </Text>
                        )}
                      </View>
                      <Text className="font-label text-xs text-muted">{`${ex.series}×${ex.reps}`}</Text>
                    </View>
                  ))}
                </View>
              ))}

              <Button className="mb-4 mt-2" onPress={handleSalvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar como plano'}
              </Button>
            </>
          )}
        </View>
      )}
    </Screen>
  );
}
