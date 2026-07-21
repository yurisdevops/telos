import { useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { colors } from '@/theme/tokens';

export function Input({ className = '', onFocus, onBlur, ...props }: TextInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      placeholderTextColor={colors.muted}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
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
}
