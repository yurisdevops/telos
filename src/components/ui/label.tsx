import { Text, type TextProps } from 'react-native';

export function Label({ className = '', ...props }: TextProps) {
  return (
    <Text
      className={`font-label text-xs uppercase tracking-wider text-muted ${className}`}
      {...props}
    />
  );
}
