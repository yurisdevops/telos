import { useEffect, useRef } from 'react';
import { Animated, Modal, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

import { Button } from './button';

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  // Opcional — alguns Alert.alert que este componente substitui têm só
  // título, sem corpo (ex: "Excluir plano" com o nome do plano já dito no
  // título). `undefined` omite a linha inteira, sem espaço reservado.
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Substitui Alert.alert pra confirmações (2+ botões) — Chapa e Ferro em vez
 * do diálogo cru do SO (ver investigação anterior). Uso normalmente via
 * `useConfirmDialog` (src/lib/use-confirm-dialog.tsx), não direto — mas o
 * componente em si não depende do hook, só das props acima.
 *
 * Mesmo molde de Modal que FormModal (transparent + fade + statusBarTranslucent
 * + overlay bg-black/70) — só o conteúdo interno muda (card de confirmação
 * em vez de formulário).
 *
 * DELIBERADAMENTE `<Modal>` nativo, não a "View absoluta" do AtlasModal —
 * mesmo pedido explícito numa leva anterior. AtlasModal precisa da View
 * absoluta porque tem um TextInput dentro: no Android, o `<Modal>` nativo
 * abre numa janela separada que não herda `softwareKeyboardLayoutMode:
 * "resize"`, então o teclado tampa o campo (ver AtlasModal). ConfirmDialog
 * NUNCA tem TextInput — esse problema não existe aqui. Trocar mesmo assim
 * introduziria um bug real: cada tela instancia seu PRÓPRIO
 * `useConfirmDialog()` e renderiza `{dialog}` inline dentro da própria
 * árvore (muitas vezes dentro de `<Screen scrollable>`, ou até dentro de um
 * `<CollapsibleSection>`) — uma View `position:'absolute'` nesse ponto fica
 * posicionada relativa ao CONTEÚDO do ScrollView (que cresce com o scroll),
 * não à tela visível, então `top:'35%'` acertaria a posição errada
 * (relativa a uma altura de conteúdo variável, não ao viewport real) em vez
 * de centralizar na tela — funciona pro AtlasModal porque ELE é montado uma
 * única vez no layout raiz, fora de qualquer scroll, não replicado em ~10
 * telas como o ConfirmDialog. O `<Modal>` nativo garante centralização
 * correta em qualquer um desses lugares, sem essa armadilha.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  // Aceito e guardado, mas hoje NÃO muda o visual do botão de confirmar (ver
  // comentário abaixo, no <Button> de confirmar) — mantido na assinatura
  // porque o texto/semântica de quem chama já distingue (`variant:
  // 'destructive'` deixa a intenção clara no código de quem usa), e serve de
  // gancho pra uma diferenciação visual futura (ex: ícone de aviso) sem
  // quebrar a API.
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  void variant;

  // Abre com um leve "pop" (0.9 -> 1, spring) — reseta pra 0.9 toda vez que
  // `visible` fica `true`, pra tocar de novo do zero em cada abertura (sem
  // isso, reabrir o mesmo diálogo herdaria o valor final da vez anterior e
  // não animaria nada). Sem animação de saída — o fade nativo do próprio
  // `Modal` (`animationType="fade"`) já cobre o fechamento, mesmo critério
  // do FormModal.
  const scale = useRef(new Animated.Value(0.9)).current;
  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.9);
    Animated.spring(scale, {
      toValue: 1,
      friction: 8,
      tension: 65,
      useNativeDriver: true,
    }).start();
  }, [visible, scale]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/70">
        <Animated.View
          style={{
            width: '85%',
            maxWidth: 320,
            marginHorizontal: 32,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 16,
            padding: 24,
            transform: [{ scale }],
          }}>
          <Text
            style={{
              fontFamily: fonts.display,
              fontSize: 18,
              color: colors.text,
              textAlign: 'center',
              marginBottom: 8,
            }}>
            {title}
          </Text>
          {message && (
            <Text
              style={{
                fontFamily: fonts.label,
                fontSize: 13,
                color: colors.muted,
                textAlign: 'center',
                lineHeight: 20,
                marginBottom: 20,
              }}>
              {message}
            </Text>
          )}
          <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 16 }} />

          {/* Confirmar sempre em bg-accent sólido + texto branco
              (variant="primary"), independente de `variant` ser 'default' ou
              'destructive' — accent já É o vermelho do app (não tem um
              segundo tom de "perigo" separado), então já comunica peso/
              importância sozinho nos dois casos. O `variant="destructive"`
              do próprio Button (borda+texto accent, fundo transparente) foi
              corrigido nesta mesma leva pra outros usos (botões inline fora
              de diálogo), mas AQUI, dentro do diálogo, o botão de ação
              principal fica sólido de propósito — mais forte que uma borda,
              e é o botão mais importante da tela nesse momento. */}
          <Button variant="primary" onPress={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" className="mt-2" onPress={onCancel}>
            {cancelLabel}
          </Button>
        </Animated.View>
      </View>
    </Modal>
  );
}
