import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { buscarResposta, getTreinosRapidos, type AtlasMessage, type AtlasTreinoRapido } from '@/lib/atlas';
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

/**
 * Modal do Atlas (assistente offline do Telos) — 3 modos internos: menu
 * (entrada), conversa (busca offline no roteiro curado, `@/lib/atlas`) e
 * treinos_rapidos (lista + detalhe de um treino pronto). Sem lib de bottom
 * sheet: `Modal` nativo `transparent` + View ancorada embaixo, mesmo padrão
 * já usado em ConfirmDialog/FormModal no resto do app.
 */
export function AtlasModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const [modo, setModo] = useState<AtlasModo>('menu');
  const [mensagens, setMensagens] = useState<AtlasMessage[]>([MENSAGEM_INICIAL]);
  const [input, setInput] = useState('');
  const [treinoSelecionado, setTreinoSelecionado] = useState<AtlasTreinoRapido | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Altura do teclado (Android) — o `KeyboardAvoidingView` abaixo já cobre o
  // iOS (`behavior:'padding'`, animação nativa sincronizada com o teclado);
  // no Android ele é inerte de propósito (`behavior:undefined` — ver
  // comentário no JSX), porque o Modal nativo aqui NÃO herda o
  // `softwareKeyboardLayoutMode:"resize"` da janela principal (diferente da
  // tela de trás, que é a própria Activity) — o SO não redimensiona nada
  // sozinho dentro de um Modal no Android. `keyboardDidShow`/`keyboardDidHide`
  // (não `keyboardWillShow/Hide`, que só existem no iOS) são os únicos
  // eventos de teclado que o Android de fato dispara.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
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

  const mostrarVoltar = modo !== 'menu';
  const titulo =
    modo === 'menu'
      ? 'ATLAS'
      : modo === 'conversa'
        ? 'Tirar uma dúvida'
        : (treinoSelecionado?.nome ?? 'Treinos rápidos');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* iOS: 'padding' encolhe a área visível quando o teclado abre — mesmo
          comportamento de FormModal.tsx (o outro Modal do app com TextInput
          dentro), que este segue de propósito. Android: `undefined` (não
          'height') — o Modal aqui herda o `softwareKeyboardLayoutMode:
          "resize"` do app.json igual à tela por trás; 'height' duplicaria
          essa compensação (o mesmo problema já mapeado no bug do teclado da
          aba Treinar, nesta mesma conversa). */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end bg-black/50">
        <View
          className="bg-surface px-5 pb-6 pt-5"
          style={{
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '80%',
            // `undefined` (não 0) quando o teclado Android não está aberto —
            // deixa o `pb-6` da className valer normalmente; só troca pelo
            // valor calculado quando há teclado de fato pra abrir espaço.
            paddingBottom: Platform.OS === 'android' && keyboardHeight > 0 ? keyboardHeight + 8 : undefined,
          }}>
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-1 flex-row items-center gap-2 pr-2">
              {mostrarVoltar && (
                <Pressable onPress={handleVoltar} hitSlop={8}>
                  <Ionicons name="arrow-back-outline" size={22} color={colors.text} />
                </Pressable>
              )}
              {modo === 'menu' && <Ionicons name="flash" size={22} color={colors.accent} />}
              <Text
                numberOfLines={1}
                className="flex-1 font-display text-xl uppercase text-accent">
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
              <ScrollView
                ref={scrollRef}
                style={{ maxHeight: 340 }}
                contentContainerStyle={{ paddingBottom: 8 }}
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
                keyboardShouldPersistTaps="handled">
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
              </ScrollView>

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
              <ScrollView style={{ maxHeight: 380 }}>
                {treinoSelecionado.exercicios.map((ex, index) => (
                  <View key={`${ex.nome}-${index}`} className="mb-3 border-b border-border pb-3">
                    <Text className="font-card-title text-sm text-text">{ex.nome}</Text>
                    <Label className="mt-1">{`${ex.series}x${ex.reps} · descanso ${ex.descanso_s}s`}</Label>
                    {ex.dica && <Label className="mt-1 italic text-muted">{ex.dica}</Label>}
                  </View>
                ))}
              </ScrollView>
              {/* Ainda não salva o treino escolhido como plano — só devolve
                  pro fluxo já existente do assistente (ver PASSO 5 do
                  pedido: a integração de verdade vem numa próxima etapa). */}
              <Button className="mt-3" onPress={handleIrParaAssistente}>
                Usar este treino
              </Button>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
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
