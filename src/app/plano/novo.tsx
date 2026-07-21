import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { workoutPlans } from '@/db/schema';
import { colors } from '@/theme/tokens';

export default function NovoPlanoScreen() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const trimmed = nome.trim();

  const handleSave = async () => {
    if (!trimmed) return;

    try {
      const [created] = await db
        .insert(workoutPlans)
        .values({ nome: trimmed, tipo: 'Personalizado', criadoEm: new Date().toISOString() })
        .returning();

      router.replace({ pathname: '/plano/[id]', params: { id: String(created.id) } });
    } catch (err) {
      console.error('Falha ao criar plano:', err);
      Alert.alert('Erro ao criar plano', String(err instanceof Error ? err.message : err));
    }
  };

  return (
    <Screen showBack scrollable>
      <ScreenTitle title="Novo plano" />

      <View>
        <Text className="mb-2 font-card-title text-lg text-text">Nome do plano</Text>
        <TextInput
          value={nome}
          onChangeText={setNome}
          placeholder="Ex: Push Pull Legs"
          placeholderTextColor={colors.muted}
          autoFocus
          className="rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
        />
        <Button className="mt-4" disabled={!trimmed} onPress={handleSave}>
          Criar plano
        </Button>
      </View>
    </Screen>
  );
}
