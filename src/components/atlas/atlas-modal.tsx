import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { db } from '@/db';
import { exercises } from '@/db/schema';
import { criarESalvarComExercicios, treinarAgoraComExercicios } from '@/db/ready-workouts';
import { parseRepsRangeToInt } from '@/lib/assistant-generator';
import {
  buscarResposta,
  getTreinosRapidos,
  resolverExercicioPorNome,
  type AtlasMessage,
  type AtlasTreinoRapido,
} from '@/lib/atlas';
import { colors } from '@/theme/tokens';

type AtlasModo = 'menu' | 'conversa' | 'treinos_rapidos';

const MENSAGEM_INICIAL: AtlasMessage = {
  id: 'inicial',
  role: 'atlas',
  content: 'Olá! Pode me perguntar sobre exercícios, treino, nutrição ou qualquer dúvida de academia.',
};

// Id local só pra `key` de lista / distinguir mensagens no histórico — nunca
// persiste em lugar nenhum (a conversa reseta a cada abertura do modal, ver
// efeito abaixo), então não precisa de nada mais forte que isso.
function gerarId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type ExercicioResolvido = { exerciseId: number; seriesAlvo: number; repsAlvo: number };

/** Casa cada exercício do treino rápido (por NOME) contra o catálogo real do
 * device (`resolverExercicioPorNome`, `@/lib/atlas`) — exercício não
 * encontrado é só pulado (nunca aborta), conforme pedido. `reps` do treino
 * rápido é uma faixa string ("10-15", igual ao gerador do assistente) —
 * reduzida a um inteiro com `parseRepsRangeToInt` (mesma função de
 * assistant-generator.ts, não uma reimplementação). */
function resolverExerciciosDoTreino(treino: AtlasTreinoRapido): ExercicioResolvido[] {
  const catalogo = db.select({ id: exercises.id, wgerId: exercises.wgerId, nome: exercises.nome }).from(exercises).all();

  const resolvidos: ExercicioResolvido[] = [];
  for (const ex of treino.exercicios) {
    const match = resolverExercicioPorNome(ex.nome, catalogo);
    if (!match) continue;
    resolvidos.push({ exerciseId: match.id, seriesAlvo: ex.series, repsAlvo: parseRepsRangeToInt(ex.reps) });
  }
  return resolvidos;
}

function reportError(context: string, err: unknown) {
  console.error(context, err);
  Alert.alert(context, String(err instanceof Error ? err.message : err));
}

/**
 * Modal do Atlas (assistente offline do Telos) — 3 modos internos: menu
 * (entrada), conversa (busca offline no roteiro curado, `@/lib/atlas`) e
 * treinos_rapidos (lista + detalhe de um treino pronto, com "Treinar agora"/
 * "Salvar como plano" via `@/db/ready-workouts`). Sem lib de bottom sheet:
 * `Modal` nativo `transparent` + View ancorada embaixo, mesmo padrão já
 * usado em ConfirmDialog/FormModal no resto do app.
 */
export function AtlasModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const [modo, setModo] = useState<AtlasModo>('menu');
  const [mensagens, setMensagens] = useState<AtlasMessage[]>([MENSAGEM_INICIAL]);
  const [input, setInput] = useState('');
  const [treinoSelecionado, setTreinoSelecionado] = useState<AtlasTreinoRapido | null>(null);
  const scrollRef = useRef<KeyboardAwareScrollView>(null);

  // Reseta pro menu (e limpa a conversa) toda vez que o modal ABRE — nunca
  // herda estado de uma abertura anterior. Mesmo padrão de
  // WorkoutShareModal (DEFAULT_SHARE_OPTIONS a cada `visible` virar true).
  useEffect(() => {
    if (visible) {
      setModo('menu');
      setMensagens([MENSAGEM_INICIAL]);
      setInput('');
      setTreinoSelecionado(null);
    }
  }, [visible]);

  const handleIrParaAssistente = () => {
    onClose();
    router.push('/plano/assistente');
  };

  const handleEnviar = () => {
    const texto = input.trim();
    if (!texto) return;
    const perguntaMsg: AtlasMessage = { id: gerarId(), role: 'user', content: texto };
    const respostaMsg: AtlasMessage = { id: gerarId(), role: 'atlas', content: buscarResposta(texto) };
    setMensagens((prev) => [...prev, perguntaMsg, respostaMsg]);
    setInput('');
    // `scrollToEnd(animated)` — a API do KeyboardAwareScrollView (não a do
    // ScrollView nativo): recebe um boolean solto, não `{ animated: true }`.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd(true));
  };

  const handleVoltar = () => {
    // 2 níveis dentro de treinos_rapidos (lista -> detalhe do treino) — o
    // botão voltar sai do detalhe pra lista antes de sair pro menu.
    if (modo === 'treinos_rapidos' && treinoSelecionado) {
      setTreinoSelecionado(null);
      return;
    }
    setModo('menu');
  };

  // Transações síncronas (mesmo padrão de treinos-prontos/[key].tsx) — sem
  // await, o resultado já está pronto quando a chamada retorna.
  const handleTreinarAgora = (treino: AtlasTreinoRapido) => {
    try {
      const exerciciosResolvidos = resolverExerciciosDoTreino(treino);
      if (exerciciosResolvidos.length === 0) {
        Alert.alert('Não foi possível iniciar', 'Nenhum exercício deste treino foi encontrado no catálogo.');
        return;
      }

      const result = treinarAgoraComExercicios(treino.nome, exerciciosResolvidos);
      if (result.status === 'already_has_session_today') {
        Alert.alert(
          'Você já tem um treino hoje',
          'Termine ou cancele a sessão de hoje antes de começar outra. Se quiser, salve este treino como plano pra usar depois.'
        );
        return;
      }

      onClose();
      router.replace('/hoje');
    } catch (err) {
      reportError('Erro ao iniciar treino', err);
    }
  };

  const handleSalvarComoPlano = (treino: AtlasTreinoRapido) => {
    try {
      const exerciciosResolvidos = resolverExerciciosDoTreino(treino);
      if (exerciciosResolvidos.length === 0) {
        Alert.alert('Não foi possível salvar', 'Nenhum exercício deste treino foi encontrado no catálogo.');
        return;
      }

      criarESalvarComExercicios(treino.nome, exerciciosResolvidos);
      onClose();
      router.push('/planilhas');
      Alert.alert('Plano salvo!', `"${treino.nome}" foi salvo em Planilhas.`);
    } catch (err) {
      reportError('Erro ao salvar plano', err);
    }
  };

  const mostrarVoltar = modo !== 'menu';
  const titulo =
    modo === 'menu'
      ? 'ATLAS'
      : modo === 'conversa'
        ? 'Tirar uma dúvida'
        : (treinoSelecionado?.nome ?? 'Treinos rápidos');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-surface px-5 pb-6 pt-5" style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%' }}>
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-1 flex-row items-center gap-2 pr-2">
              {mostrarVoltar && (
                <Pressable onPress={handleVoltar} hitSlop={8}>
                  <Ionicons name="arrow-back-outline" size={22} color={colors.text} />
                </Pressable>
              )}
              {modo === 'menu' && <Ionicons name="flash" size={22} color={colors.accent} />}
              <Text numberOfLines={1} className="flex-1 font-display text-xl uppercase text-accent">
                {titulo}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          {modo === 'menu' && (
            <View>
              <MenuOpcao
                icone="barbell-outline"
                titulo="Montar meu treino"
                descricao="O Atlas monta um plano personalizado pro seu perfil"
                onPress={handleIrParaAssistente}
              />
              <MenuOpcao
                icone="flash-outline"
                titulo="Treinos rápidos"
                descricao="Sessões prontas pra quando o tempo é curto"
                onPress={() => setModo('treinos_rapidos')}
              />
              <MenuOpcao
                icone="help-circle-outline"
                titulo="Tirar uma dúvida"
                descricao="Pergunte sobre exercícios, treino ou nutrição"
                onPress={() => setModo('conversa')}
                isLast
              />
            </View>
          )}

          {modo === 'conversa' && (
            <View>
              {/* KeyboardAwareScrollView (não ScrollView + KeyboardAvoidingView
                  manual) — mesma solução que resolveu o teclado tampando a
                  SessionExecution em hoje.tsx. `enableOnAndroid` é o que falta
                  por padrão pra ela agir no Android (só o iOS é coberto sem
                  essa flag); o TextInput fica FORA dela, fixo no fim do sheet,
                  como pedido. */}
              <KeyboardAwareScrollView
                ref={scrollRef}
                enableOnAndroid
                extraScrollHeight={80}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 300 }}
                contentContainerStyle={{ paddingBottom: 8 }}>
                {mensagens.map((msg) => (
                  <View
                    key={msg.id}
                    className={`mb-2 rounded px-3 py-2 ${msg.role === 'atlas' ? 'self-start bg-bg' : 'self-end bg-accent'}`}
                    style={{ maxWidth: '85%' }}>
                    <Text className={`font-body text-sm ${msg.role === 'atlas' ? 'text-text' : 'text-white'}`}>
                      {msg.content}
                    </Text>
                  </View>
                ))}
              </KeyboardAwareScrollView>

              <View className="mt-3 flex-row items-end gap-2">
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="Pergunte algo..."
                  placeholderTextColor={colors.muted}
                  className="flex-1 rounded border border-border bg-bg px-4 py-3 font-body text-base text-text"
                  onSubmitEditing={handleEnviar}
                  returnKeyType="send"
                  multiline
                />
                <Pressable
                  onPress={handleEnviar}
                  disabled={!input.trim()}
                  className={`h-11 w-11 items-center justify-center rounded-full ${input.trim() ? 'bg-accent' : 'bg-border'}`}>
                  <Ionicons name="arrow-up-outline" size={20} color="#fff" />
                </Pressable>
              </View>
            </View>
          )}

          {modo === 'treinos_rapidos' && !treinoSelecionado && (
            <ScrollView style={{ maxHeight: 420 }}>
              {getTreinosRapidos().map((treino) => (
                <Pressable key={treino.id} onPress={() => setTreinoSelecionado(treino)} className="mb-3">
                  <Card>
                    <Text className="font-card-title text-base text-text">{treino.nome}</Text>
                    <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
                      <Label>{`${treino.duracao_min} min`}</Label>
                      <Label className="uppercase">{treino.nivel}</Label>
                      <Label>{`${treino.exercicios.length} exercícios`}</Label>
                    </View>
                  </Card>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {modo === 'treinos_rapidos' && treinoSelecionado && (
            <View>
              <ScrollView style={{ maxHeight: 340 }}>
                {treinoSelecionado.exercicios.map((ex, index) => (
                  <View key={`${ex.nome}-${index}`} className="mb-3 border-b border-border pb-3">
                    <Text className="font-card-title text-sm text-text">{ex.nome}</Text>
                    <Label className="mt-1">{`${ex.series}x${ex.reps} · descanso ${ex.descanso_s}s`}</Label>
                    {ex.dica && <Label className="mt-1 italic text-muted">{ex.dica}</Label>}
                  </View>
                ))}
              </ScrollView>

              <View className="mt-4 flex-row gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onPress={() => handleSalvarComoPlano(treinoSelecionado)}>
                  Salvar como plano
                </Button>
                <Button className="flex-1" onPress={() => handleTreinarAgora(treinoSelecionado)}>
                  Treinar agora
                </Button>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function MenuOpcao({
  icone,
  titulo,
  descricao,
  onPress,
  isLast,
}: {
  icone: 'barbell-outline' | 'flash-outline' | 'help-circle-outline';
  titulo: string;
  descricao: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable onPress={onPress} className={isLast ? '' : 'mb-3'}>
      <Card className="flex-row items-center gap-3">
        <Ionicons name={icone} size={24} color={colors.accent} />
        <View className="flex-1">
          <Text className="font-card-title text-base text-text">{titulo}</Text>
          <Label className="mt-0.5">{descricao}</Label>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Card>
    </Pressable>
  );
}
