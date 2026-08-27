import { useRef } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { AtlasButton } from '@/components/atlas/atlas-button';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { useOpenSessionNeedsConfirm } from '@/lib/use-open-session-guard';
import { colors } from '@/theme/tokens';

export default function TabsLayout() {
  const needsConfirm = useOpenSessionNeedsConfirm();
  const { confirm, dialog } = useConfirmDialog();
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
      // "Sair" é a ação principal aqui (o toque original na aba, que o
      // preventDefault acima interrompeu) — fica em confirmLabel (botão
      // sólido accent do diálogo); "Continuar treino" é o padrão seguro,
      // fica em cancelLabel. Não é destrutivo (nada se perde, como o
      // próprio texto explica), por isso `variant` fica no default.
      confirm({
        title: 'Sessão não concluída',
        message:
          'Você ainda não concluiu o treino de hoje. O que já foi preenchido está salvo e continua aqui quando você voltar — nada se perde. Quer continuar treinando ou sair mesmo assim?',
        confirmLabel: 'Sair',
        cancelLabel: 'Continuar treino',
      }).then((ok) => {
        if (ok) navigation.navigate(routeName);
      });
    };

  return (
    <>
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
          title: 'Início',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
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
      {/* Posição secundária (última) desde a introdução do Dashboard como
          tela inicial — o catálogo continua acessível pela barra, só não é
          mais a 1ª parada; também tem um atalho no próprio Dashboard. */}
      <Tabs.Screen
        name="catalogo"
        options={{
          title: 'Catálogo',
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell-outline" color={color} size={size} />,
        }}
        listeners={({ navigation, route }) => ({
          tabPress: guardedTabPress(navigation, route.name),
        })}
      />
    </Tabs>
    {dialog}
    <AtlasButton />
    </>
  );
}
