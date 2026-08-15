import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Label } from '@/components/ui/label';
import { colors } from '@/theme/tokens';

const PIN_LENGTH = 4;

// null = espaço vazio (mantém o grid 3 colunas alinhado sem um 4º dígito à
// esquerda do 0). 'backspace' é tratado à parte do resto dos dígitos.
const KEYPAD_ROWS: (string | 'backspace' | null)[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [null, '0', 'backspace'],
];

type PinPadProps = {
  title: string;
  error?: string | null;
  onComplete: (pin: string) => void;
};

/**
 * Entrada de PIN reutilizável — teclado numérico NA TELA (não o teclado
 * nativo), de propósito: não depende de layout/idioma/autocorrect do
 * teclado do sistema, fica inteiro dentro do controle visual do app (Chapa e
 * Ferro), e nunca empurra o resto do layout ao abrir. Não sabe nada sobre
 * criar/verificar PIN — só coleta 4 dígitos e devolve via `onComplete`; quem
 * usa decide o que fazer com eles (CreatePinFlow, VerifyPinFlow).
 *
 * Se limpa sozinho: no instante em que o 4º dígito é digitado, chama
 * `onComplete(pin)` E já zera o próprio buffer no mesmo passo — sempre
 * pronto pra uma nova tentativa (ex: depois de "PIN incorreto") sem quem usa
 * precisar mandar nenhum sinal de reset de fora. `error`, quando presente, só
 * é exibido — cabe a quem usa limpar esse texto quando fizer sentido (ex: ao
 * iniciar uma nova tentativa).
 */
export function PinPad({ title, error, onComplete }: PinPadProps) {
  const [digits, setDigits] = useState('');

  const handlePressDigit = (digit: string) => {
    if (digits.length >= PIN_LENGTH) return;
    const next = digits + digit;
    if (next.length === PIN_LENGTH) {
      setDigits('');
      onComplete(next);
    } else {
      setDigits(next);
    }
  };

  const handleBackspace = () => setDigits((prev) => prev.slice(0, -1));

  return (
    <View className="w-full items-center">
      <Text className="mb-5 text-center font-card-title text-2xl text-text">{title}</Text>

      <View className="mb-3 flex-row gap-6">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View
            key={i}
            className={`h-7 w-7 rounded-full border-2 ${
              i < digits.length ? 'border-accent bg-accent' : 'border-border bg-transparent'
            }`}
          />
        ))}
      </View>

      <Label className="mb-5 h-5 text-center text-base text-accent">{error ?? ''}</Label>

      {/* Grade proporcional, não em px fixo: cada tecla é `flex-1` com
          `aspectRatio: 1` (quadrada, então `rounded-full` continua um
          círculo perfeito em qualquer tamanho computado), então a largura
          de toque cresce/encolhe com a largura disponível do modal — cabe
          igual numa tela pequena (~320pt) ou numa tela grande, sem cortar.
          `max-w-sm` só existe pra não deixar as teclas enormes/desproporcionais
          num tablet; `w-full` faz o grid usar toda a largura que tiver até lá. */}
      <View className="w-full max-w-sm">
        {KEYPAD_ROWS.map((row, rowIndex) => (
          <View key={rowIndex} className="mb-4 flex-row gap-4">
            {row.map((key, keyIndex) => {
              if (key === null) return <View key={keyIndex} className="flex-1" style={{ aspectRatio: 1 }} />;
              if (key === 'backspace') {
                return (
                  <Pressable
                    key={keyIndex}
                    onPress={handleBackspace}
                    hitSlop={8}
                    className="flex-1 items-center justify-center rounded-full"
                    style={{ aspectRatio: 1 }}>
                    <Ionicons name="backspace-outline" size={32} color={colors.muted} />
                  </Pressable>
                );
              }
              return (
                <Pressable
                  key={keyIndex}
                  onPress={() => handlePressDigit(key)}
                  className="flex-1 items-center justify-center rounded-full border-2 border-border"
                  style={{ aspectRatio: 1 }}>
                  <Text className="font-display text-4xl text-text">{key}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
