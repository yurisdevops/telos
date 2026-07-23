import { Linking, Pressable, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '@/components/screen';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { colors } from '@/theme/tokens';

const WGER_URL = 'https://wger.de';
const CC_BY_SA_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

function openLink(url: string) {
  Linking.openURL(url).catch((err) => {
    console.error('Falha ao abrir link:', err);
  });
}

export default function SobreScreen() {
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen showBack scrollable>
      <ScreenTitle title="Sobre" subtitle={`Telos · versão ${version}`} />

      <Text className="mb-6 font-body text-base text-text">
        Telos é um app de gestão de treino de academia, local-first e totalmente offline —
        catálogo de exercícios, criação de planos, execução de sessões e acompanhamento de
        progresso, tudo salvo no próprio dispositivo.
      </Text>

      <Pressable onPress={() => router.push('/backup')} className="mb-6">
        <Card className="flex-row items-center justify-between">
          <View>
            <Text className="font-card-title text-lg text-text">Dados e backup</Text>
            <Label className="mt-1">Exportar ou restaurar seus planos e histórico</Label>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Card>
      </Pressable>

      <Card className="border-l-4 border-l-accent">
        <Text className="mb-3 font-card-title text-lg text-text">Créditos</Text>

        <Text className="mb-1 font-body text-base text-text">
          O catálogo de exercícios foi derivado da base de dados aberta da{' '}
          <Text
            className="text-accent underline"
            onPress={() => openLink(WGER_URL)}>
            wger (wger.de)
          </Text>
          , publicada sob a licença{' '}
          <Text
            className="text-accent underline"
            onPress={() => openLink(CC_BY_SA_URL)}>
            Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)
          </Text>
          .
        </Text>

        <View className="mt-3">
          <Label>
            Dados traduzidos para português e enriquecidos com descrições e dicas de execução
            adicionais.
          </Label>
        </View>
      </Card>
    </Screen>
  );
}
