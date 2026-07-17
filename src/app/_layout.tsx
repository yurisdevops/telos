import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { db } from '@/db';
import migrations from '@/db/migrations/migrations';
import { seedDatabase } from '@/db/seed';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { success, error } = useMigrations(db, migrations);

  useEffect(() => {
    if (success) {
      seedDatabase();
    }
  }, [success]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Erro ao rodar as migrações: {error.message}</Text>
        </View>
      ) : success ? (
        <Stack
          screenOptions={{
            headerShown: false,
            headerStyle: { backgroundColor: '#171717' },
            headerTintColor: '#ffffff',
          }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="exercicio/[id]" options={{ headerShown: true, title: 'Exercício' }} />
          <Stack.Screen name="plano/[id]" options={{ headerShown: true, title: 'Plano' }} />
          <Stack.Screen
            name="plano/novo"
            options={{ headerShown: true, title: 'Novo plano', presentation: 'modal' }}
          />
          <Stack.Screen
            name="plano/selecionar-exercicio"
            options={{ headerShown: true, title: 'Selecionar exercício' }}
          />
        </Stack>
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
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
  },
});
