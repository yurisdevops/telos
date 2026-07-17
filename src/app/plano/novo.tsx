import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { db } from '@/db';
import { workoutPlans } from '@/db/schema';

export default function NovoPlanoScreen() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const trimmed = nome.trim();

  const handleSave = async () => {
    if (!trimmed) return;

    const [created] = await db
      .insert(workoutPlans)
      .values({ nome: trimmed, tipo: 'Personalizado', criadoEm: new Date().toISOString() })
      .returning();

    router.replace({ pathname: '/plano/[id]', params: { id: String(created.id) } });
  };

  return (
    <View className="flex-1 bg-neutral-950 px-4 pt-6">
      <Text className="mb-2 text-lg font-semibold text-white">Nome do plano</Text>
      <TextInput
        value={nome}
        onChangeText={setNome}
        placeholder="Ex: Push Pull Legs"
        placeholderTextColor="#737373"
        autoFocus
        className="rounded-xl bg-neutral-800 px-4 py-3 text-white"
      />
      <Pressable
        onPress={handleSave}
        disabled={!trimmed}
        className={`mt-4 rounded-xl px-4 py-3 ${trimmed ? 'bg-green-600' : 'bg-neutral-800'}`}>
        <Text className={`text-center font-semibold ${trimmed ? 'text-black' : 'text-neutral-500'}`}>
          Criar plano
        </Text>
      </Pressable>
    </View>
  );
}
