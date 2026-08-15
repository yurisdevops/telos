import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FormModal } from '@/components/form-modal';
import { verifyPin } from '@/db/pin';
import { PinPad } from './pin-pad';

type VerifyPinFlowProps = {
  visible: boolean;
  onVerified: () => void;
  onCancel: () => void;
};

function reportError(context: string, err: unknown) {
  console.error(context, err);
}

/**
 * Digita o PIN existente e confere contra o hash guardado — reutilizável
 * (Etapa C liga isso no reset de histórico quando já existe PIN; um futuro
 * bloqueio de app usaria o mesmo componente, sem mudar nada aqui).
 *
 * SEM limite de tentativas — decisão consciente, não esquecimento: é uma
 * trava local simples contra toque acidental/curiosidade de terceiros no
 * mesmo aparelho, não uma defesa contra ataque de força bruta remoto. Travar
 * o próprio dono do aparelho fora do app dele (ou introduzir delay
 * crescente) não protege nada aqui que o hash+salt já não cubra pelo que
 * eles realmente são — fricção local, não segurança de perímetro.
 */
export function VerifyPinFlow({ visible, onVerified, onCancel }: VerifyPinFlowProps) {
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleComplete = async (pin: string) => {
    setChecking(true);
    try {
      const ok = await verifyPin(pin);
      setChecking(false);
      if (ok) {
        setError(null);
        onVerified();
      } else {
        setError('PIN incorreto. Tente de novo.');
      }
    } catch (err) {
      reportError('Erro ao verificar PIN', err);
      setChecking(false);
      setError('Erro ao verificar PIN. Tente de novo.');
    }
  };

  const handleCancel = () => {
    setError(null);
    onCancel();
  };

  return (
    <FormModal visible={visible} onRequestClose={handleCancel}>
      <View className="items-center">
        <PinPad title="Digite seu PIN" error={error} onComplete={handleComplete} />
        <Pressable onPress={handleCancel} disabled={checking} hitSlop={8} className="mt-5">
          <Text className="font-label text-xs uppercase text-muted">Cancelar</Text>
        </Pressable>
      </View>
    </FormModal>
  );
}
