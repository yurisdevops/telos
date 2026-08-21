import { forwardRef, useRef, useState, type Ref } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { useScreenScrollRef } from '@/components/screen';
import { colors } from '@/theme/tokens';

// Combina o ref encaminhado por quem usa `Input` (ex: foco manual entre
// campos, ver SetRow em hoje.tsx) com o ref interno que este componente
// precisa pra rolar a si mesmo até acima do teclado — os dois convivem sem
// conflito, cada um só escreve no seu próprio destino.
function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(node);
      else (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}

type InputProps = TextInputProps & {
  // Desliga o auto-scroll manual (scrollResponderScrollNativeHandleToKeyboard)
  // deste campo específico — só a tela de Treino usa (SetRow em hoje.tsx),
  // que agora depende de KeyboardAvoidingView (iOS) + resize nativo do
  // Android em vez do scroll manual. Padrão `false`/ausente em todo o resto
  // do app (Medidas, Perfil etc.) — nada muda pra quem não passar essa prop.
  disableAutoScroll?: boolean;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { className = '', onFocus, onBlur, disableAutoScroll, ...props },
  forwardedRef
) {
  const [focused, setFocused] = useState(false);
  const innerRef = useRef<TextInput>(null);
  // `null` fora de uma <Screen scrollable> (ex: dentro de FormModal, que tem
  // seu próprio ScrollView) — o onFocus abaixo já cobre isso (só rola se
  // existir um ScrollView de Screen pra rolar).
  const scrollRef = useScreenScrollRef();

  return (
    <TextInput
      ref={mergeRefs(innerRef, forwardedRef)}
      placeholderTextColor={colors.muted}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
        if (disableAutoScroll) return;
        // Rola o ScrollView da Screen (via contexto) pra trazer ESTE campo
        // pra cima do teclado — sem isso, campos perto do fim de telas
        // longas (ex: panturrilha em Medidas corporais, aba Corpo) ficam
        // tampados. `scrollResponderScrollNativeHandleToKeyboard` é a API
        // do próprio React Native feita pra exatamente isso (mesma que
        // libs de "keyboard aware scroll view" usam por baixo) — sem
        // dependência nova. `requestAnimationFrame`: dá um tick pro layout
        // assentar (troca de `focused` acima, teclado começando a abrir)
        // antes de medir/rolar. Duplo rAF + `120`: folga extra de frame e de
        // distância, pro caso do teclado ainda estar abrindo no 1º tick.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (innerRef.current && scrollRef?.current) {
              scrollRef.current.scrollResponderScrollNativeHandleToKeyboard(innerRef.current, 120, true);
            }
          });
        });
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      className={`rounded border px-4 py-3 font-body text-base text-text ${
        focused ? 'border-accent' : 'border-border'
      } bg-surface ${className}`}
      {...props}
    />
  );
});
