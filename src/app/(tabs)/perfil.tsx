import type { ReactNode } from 'react';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '@/components/screen';
import { WorkoutHistorySection } from '@/components/perfil/workout-history-section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { getLatestBodyWeightKg, upsertBodyWeightToday } from '@/db/body-weight';
import { updateUserProfile, useUserProfile } from '@/db/user-profile';
import { EXPERIENCE_OPTIONS, type AssistantExperience } from '@/lib/assistant-profile';
import { formatNumberPtBr } from '@/lib/format';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

function reportError(context: string, err: unknown) {
  console.error(context, err);
  Alert.alert(context, String(err instanceof Error ? err.message : err));
}

export default function PerfilScreen() {
  const profile = useUserProfile();

  // Mesmo padrão "draft ?? valor salvo" já usado na nota pessoal do exercício
  // (exercicio/[id].tsx): edita livremente sem gravar nada até apertar Salvar.
  const [nomeDraft, setNomeDraft] = useState<string | null>(null);
  const [alturaDraft, setAlturaDraft] = useState<string | null>(null);
  const nomeValue = nomeDraft ?? profile?.nome ?? '';
  const alturaValue = alturaDraft ?? (profile?.alturaCm != null ? String(profile.alturaCm) : '');

  const [pesoDraft, setPesoDraft] = useState('');
  const latestPesoKg = useDbQuery(() => getLatestBodyWeightKg(), ['body_weight_logs'], []);

  // Nome/altura: explícito "Salvar" (mesmo padrão de "Salvar nota" no
  // exercício e "Registrar hoje" do peso corporal) — não onBlur, pra não
  // gravar um valor de altura incompleto/inválido enquanto o usuário digita.
  const handleSaveDadosPessoais = async () => {
    const trimmedNome = nomeValue.trim();
    const alturaTrim = alturaValue.trim();
    const alturaNum = alturaTrim ? Number(alturaTrim) : null;
    const alturaValida = alturaNum != null && Number.isFinite(alturaNum) && alturaNum > 0 ? Math.round(alturaNum) : null;

    try {
      await updateUserProfile({
        nome: trimmedNome ? trimmedNome : null,
        alturaCm: alturaValida,
      });
      setNomeDraft(null);
      setAlturaDraft(null);
    } catch (err) {
      reportError('Erro ao salvar dados pessoais', err);
    }
  };

  // Experiência: chip aplica na hora, igual todo outro chip de seleção do
  // app (categoria, favoritos, modo treino) — nunca fica atrás de um botão.
  const handleSetExperiencia = async (value: AssistantExperience) => {
    try {
      await updateUserProfile({ experiencia: value });
    } catch (err) {
      reportError('Erro ao salvar experiência', err);
    }
  };

  const handleRegisterPeso = async () => {
    const normalized = pesoDraft.trim().replace(',', '.');
    const value = Number(normalized);
    if (!value || value <= 0) return;

    try {
      await upsertBodyWeightToday(value);
      setPesoDraft('');
    } catch (err) {
      reportError('Erro ao registrar peso', err);
    }
  };

  return (
    <Screen edges={['top', 'left', 'right']} scrollable>
      <ScreenTitle title="Perfil" />

      <Card className="mb-6 flex-row items-center gap-4">
        <View className="h-16 w-16 items-center justify-center rounded-full border border-border bg-bg">
          <Ionicons name="person-outline" size={32} color={colors.muted} />
        </View>
        <Text className="flex-1 font-card-title text-xl text-text" numberOfLines={1}>
          {profile?.nome ? profile.nome : 'Adicionar nome'}
        </Text>
      </Card>

      <Section title="Dados pessoais">
        <Label className="mb-1">Nome</Label>
        <Input
          value={nomeValue}
          onChangeText={setNomeDraft}
          placeholder="Seu nome"
          className="mb-4"
        />

        <Label className="mb-1">Altura (cm)</Label>
        <Input
          value={alturaValue}
          onChangeText={setAlturaDraft}
          keyboardType="number-pad"
          placeholder="Ex: 175"
          className="mb-4"
        />

        <Button variant="secondary" onPress={handleSaveDadosPessoais}>
          Salvar
        </Button>

        <Label className="mb-2 mt-6">Experiência</Label>
        <View className="flex-row flex-wrap gap-2">
          {EXPERIENCE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={profile?.experiencia === option.value}
              onPress={() => handleSetExperiencia(option.value)}
            />
          ))}
        </View>

        <Label className="mb-2 mt-6">Peso corporal</Label>
        <Label className="mb-3 text-muted">
          {latestPesoKg != null ? `Peso atual: ${formatNumberPtBr(latestPesoKg)}kg` : 'Sem registros de peso ainda.'}
        </Label>
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Input
              value={pesoDraft}
              onChangeText={setPesoDraft}
              keyboardType="decimal-pad"
              placeholder="Ex: 78,5"
            />
          </View>
          <Button onPress={handleRegisterPeso} disabled={!pesoDraft.trim()}>
            Registrar hoje
          </Button>
        </View>
      </Section>

      <Section title="Histórico">
        <WorkoutHistorySection />
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-6">
      <Label className="mb-3">{title}</Label>
      {children}
    </View>
  );
}
