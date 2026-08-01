import { useRef } from 'react';
import { Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { useOpenSessionNeedsConfirm } from '@/lib/use-open-session-guard';
import { colors } from '@/theme/tokens';

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
      <Tabs.Screen
        name="index"
        options={{
          title: 'Catálogo',
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell-outline" color={color} size={size} />,
        }}
        listeners={({ navigation, route }) => ({
          tabPress: guardedTabPress(navigation, route.name),
        })}
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
