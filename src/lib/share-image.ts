import { Alert } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type Svg from 'react-native-svg';

/**
 * `toDataURL` é baseado em callback (não Promise) — embrulha aqui. Faz UMA
 * retentativa curta se vier vazio: o próprio módulo nativo do react-native-svg
 * já tem uma lógica de retry interna (esperar a view existir/estar desenhada
 * antes de rasterizar), mas essa é uma segunda camada de segurança —
 * principalmente pro lado iOS, cujo retry nativo é limitado a 1 tentativa com
 * atraso fixo curto. Como o card fica sempre montado (fora da tela) desde que
 * a sessão existe, na prática o SVG já está desenhado bem antes do usuário
 * conseguir tocar no botão de compartilhar — isso aqui é só uma rede extra.
 */
function captureSvgAsBase64(
  svgRef: React.RefObject<Svg | null>,
  width: number,
  height: number,
  attempt = 0
): Promise<string> {
  return new Promise((resolve, reject) => {
    const svg = svgRef.current;
    if (!svg) {
      reject(new Error('Card de compartilhamento ainda não está pronto.'));
      return;
    }
    svg.toDataURL(
      (base64) => {
        if (base64) {
          resolve(base64);
          return;
        }
        if (attempt < 1) {
          setTimeout(() => {
            captureSvgAsBase64(svgRef, width, height, attempt + 1).then(resolve, reject);
          }, 150);
          return;
        }
        reject(new Error('Falha ao gerar a imagem do card.'));
      },
      { width, height }
    );
  });
}

/**
 * Rasteriza o card (via `svgRef`) pra PNG, escreve num arquivo temporário
 * (mesmo padrão de backup.tsx: `Paths.cache`, arquivo descartável só pra
 * viabilizar o compartilhamento) e abre o share sheet nativo. Nunca lança —
 * erro ou cancelamento do usuário só loga, igual shareText() já faz.
 */
export async function shareWorkoutImage(
  svgRef: React.RefObject<Svg | null>,
  width: number,
  height: number
): Promise<void> {
  try {
    const base64 = await captureSvgAsBase64(svgRef, width, height);

    const filename = `telos-treino-${Date.now()}.png`;
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.write(base64, { encoding: 'base64' });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert('Compartilhamento indisponível', 'Não é possível compartilhar imagens neste dispositivo.');
      return;
    }
    await Sharing.shareAsync(file.uri, { mimeType: 'image/png', dialogTitle: 'Compartilhar treino' });
  } catch (err) {
    console.error('Falha ao compartilhar imagem do treino:', err);
  }
}
