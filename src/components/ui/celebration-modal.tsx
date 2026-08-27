import { Modal, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';
import { Button } from './button';

type CelebrationModalProps = {
  visible: boolean;
  /** Já capitalizado por quem chama (index.tsx) — este componente não
   * formata texto, só exibe o que recebe. */
  mesNome: string;
  treinos: number;
  /** Emoji já resolvido por quem chama (getCelebrationIcon). */
  icone: string;
  mensagem: string;
  onClose: () => void;
};

/**
 * Modal de celebração mensal — `<Modal>` nativo (não a View-absoluta do
 * Atlas): diferente do AtlasModal, não tem nenhum TextInput dentro, então o
 * problema de teclado que motivou aquela solução não existe aqui. Mesmo
 * padrão visual de ConfirmDialog (ui/confirm-dialog.tsx): `transparent
 * animationType="fade" statusBarTranslucent`, overlay escuro, card
 * centralizado.
 */
export function CelebrationModal({ visible, mesNome, treinos, icone, mensagem, onClose }: CelebrationModalProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.75)',
          paddingHorizontal: 24,
        }}>
        <View
          style={{
            width: '100%',
            maxWidth: 300,
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 20,
            padding: 28,
          }}>
          <Text style={{ fontSize: 48 }}>{icone}</Text>

          <Text
            style={{
              marginTop: 14,
              fontFamily: fonts.display,
              fontSize: 14,
              color: colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}>
            {mesNome}
          </Text>

          <Text style={{ fontFamily: fonts.display, fontSize: 56, color: colors.accent }}>{treinos}</Text>
          <Text
            style={{
              fontFamily: fonts.label,
              fontSize: 11,
              color: colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}>
            Dias de treino
          </Text>

          <View style={{ marginTop: 16, marginBottom: 16, width: 40, height: 2, backgroundColor: colors.accent }} />

          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 14,
              lineHeight: 20,
              color: colors.text,
              textAlign: 'center',
            }}>
            {mensagem}
          </Text>

          <Button className="mt-6 w-full" onPress={onClose}>
            Continuar
          </Button>
        </View>
      </View>
    </Modal>
  );
}
