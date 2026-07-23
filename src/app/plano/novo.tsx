import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { workoutPlans } from '@/db/schema';
import { applyTemplate, TEMPLATE_ORDER, TEMPLATES, type TemplateKey } from '@/db/templates';
import { colors } from '@/theme/tokens';

type TemplateChoice = 'personalizado' | TemplateKey;

const PERSONALIZADO_DESCRIPTION = 'Plano vazio — você adiciona dias e exercícios do zero.';

export default function NovoPlanoScreen() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [templateChoice, setTemplateChoice] = useState<TemplateChoice>('personalizado');
  const trimmed = nome.trim();

  const handleSave = () => {
    if (!trimmed) return;

    try {
      const planId = db.transaction((tx) => {
        const created = tx
          .insert(workoutPlans)
          .values({
            nome: trimmed,
            tipo: templateChoice === 'personalizado' ? 'Personalizado' : TEMPLATES[templateChoice].label,
            criadoEm: new Date().toISOString(),
          })
          .returning()
          .get();

        if (templateChoice !== 'personalizado') {
          applyTemplate(tx, created.id, templateChoice);
        }

        return created.id;
      });

      router.replace({ pathname: '/plano/[id]', params: { id: String(planId) } });
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
          className="mb-6 rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
        />

        <Text className="mb-1 font-card-title text-lg text-text">Modelo</Text>
        <Label className="mb-3">
          Modelo sugerido como ponto de partida — depois de criado, você edita tudo (dias,
          exercícios, séries, carga).
        </Label>
        <View className="mb-3 flex-row flex-wrap gap-2">
          <Chip
            label="Personalizado"
            selected={templateChoice === 'personalizado'}
            onPress={() => setTemplateChoice('personalizado')}
          />
          {TEMPLATE_ORDER.map((key) => (
            <Chip
              key={key}
              label={TEMPLATES[key].label}
              selected={templateChoice === key}
              onPress={() => setTemplateChoice(key)}
            />
          ))}
        </View>
        <Label className="mb-6">
          {templateChoice === 'personalizado' ? PERSONALIZADO_DESCRIPTION : TEMPLATES[templateChoice].description}
        </Label>

        <Button disabled={!trimmed} onPress={handleSave}>
          Criar plano
        </Button>
      </View>
    </Screen>
  );
}
