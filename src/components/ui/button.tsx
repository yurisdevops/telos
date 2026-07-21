import type { ReactNode } from 'react';
import { Pressable, Text, type PressableProps } from 'react-native';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

type ButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  disabled?: boolean;
} & Omit<PressableProps, 'children' | 'disabled'>;

const CONTAINER_BY_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent',
  secondary: 'border border-border bg-transparent',
  ghost: 'bg-transparent',
  destructive: 'border border-border bg-transparent',
};

const TEXT_BY_VARIANT: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-text',
  ghost: 'text-muted',
  destructive: 'text-muted',
};

export function Button({ children, variant = 'primary', disabled, className = '', ...props }: ButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      className={`items-center justify-center rounded px-4 py-3 ${CONTAINER_BY_VARIANT[variant]} ${
        disabled ? 'opacity-50' : ''
      } ${className}`}
      {...props}>
      {typeof children === 'string' ? (
        <Text className={`font-label text-sm uppercase tracking-wide ${TEXT_BY_VARIANT[variant]}`}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
