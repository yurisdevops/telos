import { useRef } from 'react';
import { Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { useOpenSessionNeedsConfirm } from '@/lib/use-open-session-guard';
import { colors } from '@/theme/tokens';

// Âncora do grupo de abas — index.tsx (Catálogo) continua sendo o arquivo
// fisicamente chamado "index", mas não é mais o ponto de entrada visual:
// sem isso, abrir o app cairia direto no Catálogo (agora escondido da barra,
// ver `options={{ href: null }}` abaixo) sem nenhuma aba acesa correspondente
// na barra — visualmente quebrado. "hoje" (Treinar) é o "o que eu faço hoje"
// do app, o mesmo motivo que já o torna a única aba com guarda de sessão
// especial (guardedTabPress protege TODAS as outras contra sair de uma
// sessão aberta em "hoje", nunca o contrário).
export const unstable_settings = {
  initialRouteName: 'hoje',
};

export default function TabsLayout() {
  const needsConfirm = useOpenSessionNeedsConfirm();
  // Ref porque o listener de tabPress é registrado uma vez pelo navigator —
  // ler de um ref garante o valor mais recente no momento do toque, em vez de
  // uma closure presa ao valor de quando o listener foi criado.
  const needsConfirmRef = useRef(needsConfirm);
  needsConfirmRef.current = needsConfirm;

  const guardedTabPress =
    (navigation: { navigate: (name: string) => void }, routeName: string) =>
    (e: { preventDefault: () => void }) => {
      if (!needsConfirmRef.current) return;
      e.preventDefault();
      Alert.alert(
        'Sessão não concluída',
        'Você ainda não concluiu o treino de hoje. O que já foi preenchido está salvo e continua aqui quando você voltar — nada se perde. Quer continuar treinando ou sair mesmo assim?',
        [
          { text: 'Continuar treino', style: 'cancel' },
          { text: 'Sair', onPress: () => navigation.navigate(routeName) },
        ]
      );
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
        },
      }}>
      {/* Catálogo sai da barra (options.href: null — o padrão suportado pelo
          próprio expo-router pra isso, tabBarItemStyle: display:'none' por
          baixo) mas a rota continua existindo e navegável via router.push
          (ex: o novo acesso em planilhas.tsx). listeners some com ela — não
          tem botão de aba pra guardar mais. */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Catálogo',
          href: null,
        }}
      />
      <Tabs.Screen
        name="planilhas"
        options={{
          title: 'Planilhas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="clipboard-outline" color={color} size={size} />
          ),
        }}
        listeners={({ navigation, route }) => ({
          tabPress: guardedTabPress(navigation, route.name),
        })}
      />
      <Tabs.Screen
        name="hoje"
        options={{
          title: 'Treinar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="progresso"
        options={{
          title: 'Progresso',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" color={color} size={size} />
          ),
        }}
        listeners={({ navigation, route }) => ({
          tabPress: guardedTabPress(navigation, route.name),
        })}
      />
      <Tabs.Screen
        name="corpo"
        options={{
          title: 'Corpo',
          tabBarIcon: ({ color, size }) => <Ionicons name="body-outline" color={color} size={size} />,
        }}
        listeners={({ navigation, route }) => ({
          tabPress: guardedTabPress(navigation, route.name),
        })}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
        listeners={({ navigation, route }) => ({
          tabPress: guardedTabPress(navigation, route.name),
        })}
      />
    </Tabs>
  );
}
