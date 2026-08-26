import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/** Exercício em foco quando o Atlas é aberto a partir de um botão ❓
 * contextual (durante o treino ou na tela de detalhes do catálogo) — `null`
 * quando aberto pelo botão flutuante genérico (sem exercício associado). */
export type AtlasExercicioContexto = { wgerId: number; nome: string };

type AtlasContextValue = {
  visible: boolean;
  exercicioContexto: AtlasExercicioContexto | null;
  /** Abre o Atlas. Sem argumento (botão flutuante genérico) limpa qualquer
   * contexto de exercício anterior; com um exercício, o modal já nasce
   * sabendo qual é (ver AtlasModal — pula direto pro modo conversa com as
   * dicas daquele exercício). */
  abrirAtlas: (exercicio?: AtlasExercicioContexto) => void;
  fecharAtlas: () => void;
};

const AtlasContext = createContext<AtlasContextValue | null>(null);

/**
 * Estado global do Atlas — precisa viver ACIMA de `(tabs)` no layout raiz
 * (não só dentro de `(tabs)/_layout.tsx`, onde o AtlasButton mora), porque
 * telas como `exercicio/[id].tsx` são rotas IRMÃS de `(tabs)` na Stack raiz
 * (não descendentes dela) — um Context montado só dentro de `(tabs)` nunca
 * seria visível pra essas telas. O próprio `<AtlasModal />` também é
 * renderizado uma vez no layout raiz (não mais dentro de AtlasButton), pra
 * existir independente de qual tela/rota disparou `abrirAtlas`.
 */
export function AtlasProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [exercicioContexto, setExercicioContexto] = useState<AtlasExercicioContexto | null>(null);

  const abrirAtlas = useCallback((exercicio?: AtlasExercicioContexto) => {
    setExercicioContexto(exercicio ?? null);
    setVisible(true);
  }, []);

  const fecharAtlas = useCallback(() => setVisible(false), []);

  const value = useMemo<AtlasContextValue>(
    () => ({ visible, exercicioContexto, abrirAtlas, fecharAtlas }),
    [visible, exercicioContexto, abrirAtlas, fecharAtlas]
  );

  return <AtlasContext.Provider value={value}>{children}</AtlasContext.Provider>;
}

/** Diferente de `useScreenScrollRef` (screen.tsx), que devolve `null` de
 * propósito porque "fora de uma Screen scrollable" é um caso legítimo —
 * aqui não: `AtlasProvider` envolve o app inteiro (ver _layout.tsx raiz),
 * então usar `useAtlas()` fora dele é sempre um erro de composição, não um
 * caso esperado. Lança cedo em vez de devolver um valor incompleto. */
export function useAtlas(): AtlasContextValue {
  const context = useContext(AtlasContext);
  if (!context) {
    throw new Error('useAtlas() precisa ser chamado dentro de um <AtlasProvider>.');
  }
  return context;
}
