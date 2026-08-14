import { Alert } from 'react-native';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

/**
 * Rasteriza o card (via `cardRef`, uma View comum montada fora da tela) pra
 * PNG e abre o share sheet nativo. `captureRef` já devolve um caminho de
 * arquivo temporário pronto pra usar — ao contrário da versão anterior (SVG +
 * toDataURL), não precisa escrever nada manualmente via expo-file-system
 * antes de compartilhar.
 *
 * Nunca lança — erro ou cancelamento do usuário só loga, igual shareText() já
 * fazia antes desta feature existir.
 */
export async function shareWorkoutImage(
  cardRef: React.RefObject<View | null>,
  width: number,
  height: number
): Promise<void> {
  try {
    const target = cardRef.current;
    if (!target) {
      throw new Error('Card de compartilhamento ainda não está pronto.');
    }

    const uri = await captureRef(target, { format: 'png', quality: 1, width, height });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert('Compartilhamento indisponível', 'Não é possível compartilhar imagens neste dispositivo.');
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartilhar treino' });
  } catch (err) {
    console.error('Falha ao compartilhar imagem do treino:', err);
  }
}
