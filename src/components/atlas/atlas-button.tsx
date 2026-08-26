import { Image, Pressable } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAtlas } from '@/lib/atlas-context';
import { colors } from '@/theme/tokens';

// Rotas onde o botão fica escondido — Perfil e Planilhas já têm seus
// próprios pontos de entrada/fluxos (o card "Montar com Atlas" em
// planilhas.tsx, por exemplo) e o FAB só competiria com eles ali. `includes`
// (não igualdade exata) pra cobrir sub-rotas dessas 2 telas também, se um dia
// existirem.
const OCULTAR_EM = ['/perfil', '/planilhas'];

/**
 * Botão flutuante do Atlas — vive junto do `{dialog}` no `(tabs)/_layout.tsx`
 * (fora de cada tela individual), então sobrevive à troca de aba sem
 * remontar. Não tem mais estado próprio nem renderiza o `<AtlasModal>`
 * (isso subiu pro `AtlasProvider`/layout raiz — ver atlas-context.tsx) — só
 * consome `abrirAtlas()` do contexto global, sem argumento (limpa qualquer
 * contexto de exercício de um ❓ anterior, abre o menu genérico).
 */
export function AtlasButton() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { abrirAtlas } = useAtlas();

  if (OCULTAR_EM.some((rota) => pathname.includes(rota))) return null;

  // Tab bar do RN não expõe a própria altura calculada por hook — 60
  // aproxima a altura padrão dela (~49-56pt) com folga; +16 é a margem
  // visual até o botão, por cima da área segura do device.
  const bottom = insets.bottom + 60 + 16;

  return (
    <Pressable
      style={{
        position: 'absolute',
        bottom,
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        zIndex: 999,
      }}
      onPress={() => abrirAtlas()}>
      {/* `require` do RN core (não expo-image) — mesmo padrão já usado pro
          ícone adaptativo do app em telos-loading-screen.tsx (mesma
          profundidade de import, 3 níveis até assets/images/), com
          `resizeMode` (API do Image do RN core, não `contentFit` do
          expo-image). */}
      <Image
        source={require('../../../assets/images/atlas-icon.png')}
        style={{ width: 32, height: 32 }}
        resizeMode="contain"
      />
    </Pressable>
  );
}
