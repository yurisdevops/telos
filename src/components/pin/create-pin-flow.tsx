import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FormModal } from '@/components/form-modal';
import { Card } from '@/components/ui/card';
import { createPin } from '@/db/pin';
import { PinPad } from './pin-pad';

type Step = 'create' | 'confirm';

type CreatePinFlowProps = {
  visible: boolean;
  onCreated: () => void;
  onCancel: () => void;
};

function reportError(context: string, err: unknown) {
  console.error(context, err);
}

/**
 * Fluxo de 2 passos pra criar o PIN pela 1ª vez — reutilizável de propósito
 * (a Etapa C liga isso no reset de histórico quando ainda não há PIN; nada
 * aqui sabe o que vem depois de `onCreated`).
 *
 * "Crie" → 1º PIN fica só em memória (`firstPin`, nunca grava nada ainda) →
 * "Confirme" → se bater, `createPin()` (hash+salt de verdade, ver
 * src/db/pin.ts) e `onCreated()`. Se NÃO bater, o 1º PIN é descartado (não
 * fica "meio lembrado" — evita o usuário ficar em dúvida de qual dos dois
 * valeu) e o fluxo volta pro passo 1 do zero, com o aviso de erro.
 */
export function CreatePinFlow({ visible, onCreated, onCancel }: CreatePinFlowProps) {
  const [step, setStep] = useState<Step>('create');
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep('create');
    setFirstPin(null);
    setError(null);
    setSaving(false);
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const handleFirstComplete = (pin: string) => {
    setFirstPin(pin);
    setError(null);
    setStep('confirm');
  };

  const handleConfirmComplete = async (pin: string) => {
    if (pin !== firstPin) {
      setStep('create');
      setFirstPin(null);
      setError('Os PINs não conferem. Tente de novo.');
      return;
    }

    setSaving(true);
    try {
      await createPin(pin);
      reset();
      onCreated();
    } catch (err) {
      reportError('Erro ao criar PIN', err);
      setStep('create');
      setFirstPin(null);
      setSaving(false);
      setError('Erro ao salvar o PIN. Tente de novo.');
    }
  };

  return (
    <FormModal visible={visible} onRequestClose={handleCancel}>
      <View className="items-center">
        {step === 'create' && (
          <Card className="mb-5 w-full border-l-4 border-l-accent">
            <Text className="font-body text-sm text-text">
              Guarde bem seu PIN. Não há como recuperá-lo — se esquecer, a única saída é criar um novo.
            </Text>
          </Card>
        )}

        {step === 'create' ? (
          <PinPad title="Crie seu PIN" error={error} onComplete={handleFirstComplete} />
        ) : (
          <PinPad title="Confirme seu PIN" onComplete={handleConfirmComplete} />
        )}

        <Pressable onPress={handleCancel} disabled={saving} hitSlop={8} className="mt-5">
          <Text className="font-label text-xs uppercase text-muted">Cancelar</Text>
        </Pressable>
      </View>
    </FormModal>
  );
}
