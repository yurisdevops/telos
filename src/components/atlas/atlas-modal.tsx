import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Keyboard, Pressable, ScrollView, Text, View, type KeyboardEvent } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { db } from '@/db';
import { exercises } from '@/db/schema';
import { criarESalvarComExercicios, treinarAgoraComExercicios } from '@/db/ready-workouts';
import { parseRepsRangeToInt } from '@/lib/assistant-generator';
import { getTreinosRapidos, resolverExercicioPorNome, type AtlasTreinoRapido } from '@/lib/atlas';
import { useAtlas } from '@/lib/atlas-context';
import { colors } from '@/theme/tokens';

type AtlasModo = 'menu' | 'treinos_rapidos';

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

// Altura da tela (não um "600" fixo) — a folga de fora-da-tela precisa ser
// GARANTIDAMENTE maior que qualquer altura real que o sheet possa assumir
// (até 85% da tela, ver `maxHeight` abaixo); um valor fixo pequeno deixaria
// uma tira do sheet visível permanentemente em telas altas (85% de uma tela
// de 800pt já são 680pt, mais que os 600 do rascunho original).
const ALTURA_TELA = Dimensions.get('window').height;

/**
 * Sheet do Atlas (assistente offline do Telos) — 2 modos internos: menu
 * (entrada) e treinos_rapidos (lista + detalhe de um treino pronto, com
 * "Treinar agora"/"Salvar como plano" via `@/db/ready-workouts`).
 *
 * NÃO é um `<Modal>` nativo — motivo: no Android, `<Modal>` abre numa janela
 * separada (um Dialog), que NÃO herda o `softwareKeyboardLayoutMode:
 * "resize"` da Activity principal (app.json), então nenhum
 * KeyboardAvoidingView/listener manual/KeyboardAwareScrollView dentro dele
 * resolve o teclado tampando o input de verdade. A solução é sair da janela
 * separada: renderizar como uma View absoluta direto na árvore principal
 * (montada uma vez em `_layout.tsx` raiz, fora de `(tabs)`, pro mesmo motivo
 * de `exercicio/[id].tsx` — ver atlas-context.tsx) — como agora faz parte da
 * MESMA janela/Activity que o resto do app, o resize nativo do Android
 * empurra o sheet pra cima junto com tudo o mais quando o teclado abre, sem
 * nenhum workaround.
 *
 * Sempre montada (nunca condicionada a `visible`); some via
 * `pointerEvents:'none'` (não intercepta toque quando fechada) + a animação
 * de `translateY` abaixo — o padrão de outros modais do app (Modal nativo
 * `transparent` + overlay) não se aplica aqui de propósito, por causa do
 * problema acima.
 */
export function AtlasModal() {
  const router = useRouter();
  const { visible, fecharAtlas } = useAtlas();
  const [modo, setModo] = useState<AtlasModo>('menu');
  const [treinoSelecionado, setTreinoSelecionado] = useState<AtlasTreinoRapido | null>(null);

  // Anima a entrada/saída do sheet (spring, mesmo em Android e iOS —
  // `useNativeDriver` funciona pra `transform` nos dois). Começa fora da
  // tela (ALTURA_TELA) porque o primeiro render acontece com `visible=false`
  // (o AtlasProvider nasce fechado).
  const translateY = useRef(new Animated.Value(ALTURA_TELA)).current;
  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : ALTURA_TELA,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start();
  }, [visible, translateY]);

  // Altura do teclado — SÓ pra reancorar o sheet acima dele (`bottom:
  // keyboardY` no Animated.View abaixo), não pra empurrar conteúdo. O
  // `softwareKeyboardLayoutMode:"resize"` do app.json redimensiona
  // corretamente conteúdo em FLUXO normal (é o que já resolveu o teclado na
  // aba Treinar), mas uma View absolutamente posicionada, ancorada via
  // `top`/`bottom`, fica FORA desse fluxo — o resize da Activity não
  // recalcula essa âncora de forma confiável no Android, deixando o sheet
  // preso à posição de ANTES do teclado abrir (na prática, escondido atrás
  // dele). `keyboardDidShow`/`keyboardDidHide` (não `Will`, que só existe no
  // iOS) funcionam nos dois SOs — no iOS, que nunca redimensiona a janela
  // sozinho, sempre foi assim que qualquer view precisa reagir ao teclado.
  const [keyboardY, setKeyboardY] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent) => {
      setKeyboardY(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardY(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Reseta toda vez que o modal ABRE — nunca herda estado de uma abertura
  // anterior. Mesmo padrão de WorkoutShareModal (DEFAULT_SHARE_OPTIONS a
  // cada `visible` virar true). Sempre abre no menu principal — o ❓
  // contextual (exercicioContexto, ver atlas-context.tsx) não pula mais pra
  // nenhuma conversa dedicada, só traz o usuário até aqui como o botão
  // flutuante genérico faria.
  useEffect(() => {
    if (!visible) return;
    setTreinoSelecionado(null);
    setModo('menu');
  }, [visible]);

  const handleIrParaAssistente = () => {
    fecharAtlas();
    router.push('/plano/assistente');
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

      fecharAtlas();
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
      fecharAtlas();
      router.push('/planilhas');
      Alert.alert('Plano salvo!', `"${treino.nome}" foi salvo em Planilhas.`);
    } catch (err) {
      reportError('Erro ao salvar plano', err);
    }
  };

  const mostrarVoltar = modo !== 'menu';
  const titulo = modo === 'menu' ? 'ATLAS' : (treinoSelecionado?.nome ?? 'Treinos rápidos');

  return (
    <View
      pointerEvents={visible ? 'auto' : 'none'}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
      {/* Overlay — fecha ao tocar fora. Só existe (visual e pro toque)
          enquanto `visible`; a View de fora já bloqueia todo toque quando
          fechada (`pointerEvents:'none'` cobre esta e o sheet abaixo
          também), então isto não precisa da própria checagem de visível
          além de não ser renderizado. */}
      {visible && (
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
          onPress={fecharAtlas}
        />
      )}

      <Animated.View
        className="bg-surface px-5 pb-6 pt-5"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          // Ancorado no teclado (`keyboardY`, 0 quando fechado), não na tela
          // — some da posição de "sem teclado" pra "acima do teclado" assim
          // que ele abre. Compõe com `translateY` (abertura/fechamento do
          // sheet em si): os dois deslocam a MESMA view, um por `bottom`
          // (layout), outro por `transform` (depois do layout) — quando
          // fechado, `translateY` (ALTURA_TELA) já joga o sheet bem pra fora
          // da tela de qualquer forma, então o valor de `keyboardY` nesse
          // momento não importa visualmente.
          bottom: keyboardY,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          // 70% (não mais 80%) — com o sheet podendo subir `keyboardY`
          // adicionais acima do que já ocupava, um teto mais folgado deixa
          // menos risco de o topo do sheet passar do topo da tela em
          // devices menores com teclado grande.
          maxHeight: '70%',
          transform: [{ translateY }],
        }}>
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
          <Pressable onPress={fecharAtlas} hitSlop={8}>
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
              isLast
            />
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
      </Animated.View>
    </View>
  );
}

function MenuOpcao({
  icone,
  titulo,
  descricao,
  onPress,
  isLast,
}: {
  icone: 'barbell-outline' | 'flash-outline';
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
