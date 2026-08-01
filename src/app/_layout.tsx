import '@/global.css';

// Importa cada peso do seu próprio submódulo (não do índice raiz do pacote)
// de propósito: o index.js agregado do @expo-google-fonts/* faz require() dos
// 18 pesos (9 + itálico) incondicionalmente, então importar dali faz o Metro
// empacotar todos eles mesmo só usando 3 — ~7,8MB de fontes não usadas por
// família. Importando do submódulo específico, só o peso realmente usado
// entra no bundle.
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { BarlowCondensed_900Black } from '@expo-google-fonts/barlow-condensed/900Black';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import { ChangelogModal } from '@/components/changelog-modal';
import { db } from '@/db';
import migrations from '@/db/migrations/migrations';
import { seedDatabase } from '@/db/seed';
import { ensureUserProfileRow, getLastSeenChangelogVersion, markChangelogSeen } from '@/db/user-profile';
import { CURRENT_CHANGELOG_VERSION, getUnseenChangelog, type ChangelogEntry } from '@/lib/changelog';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { success, error } = useMigrations(db, migrations);
  const [fontsLoaded, fontError] = useFonts({
    BarlowCondensed_900Black,
    BarlowCondensed_700Bold,
    BarlowCondensed_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const [unseenChangelog, setUnseenChangelog] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    if (!success) return;
    seedDatabase();
    // ensureUserProfileRow() é síncrono por baixo dos panos (.run(), não
    // await) — termina e commita a linha id=1 antes desta linha seguinte
    // rodar, então a leitura assíncrona abaixo (que só começa depois) nunca
    // corre o risco de encontrar a tabela sem a linha. Falha na checagem de
    // changelog (ex: erro de query) só é logada — nunca impede o boot, que
    // depende só de `ready` (success && fontsLoaded), não desta checagem.
    ensureUserProfileRow();

    getLastSeenChangelogVersion()
      .then((lastSeen) => setUnseenChangelog(getUnseenChangelog(lastSeen)))
      .catch((err) => console.error('Falha ao checar novidades:', err));
  }, [success]);

  const handleDismissChangelog = () => {
    setUnseenChangelog([]);
    markChangelogSeen(CURRENT_CHANGELOG_VERSION).catch((err) =>
      console.error('Falha ao marcar novidades como vistas:', err)
    );
  };

  const ready = success && fontsLoaded;
  const anyError = error ?? fontError;

  useEffect(() => {
    if (ready || anyError) {
      SplashScreen.hideAsync();
    }
  }, [ready, anyError]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="light" />
      {anyError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Erro ao iniciar o app: {anyError.message}</Text>
        </View>
      ) : ready ? (
        <>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="plano/novo" options={{ presentation: 'modal' }} />
          </Stack>
          {unseenChangelog.length > 0 && (
            <ChangelogModal visible entries={unseenChangelog} onDismiss={handleDismissChangelog} />
          )}
        </>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      )}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.bg,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
  },
});
