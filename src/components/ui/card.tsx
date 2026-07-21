import { View, type ViewProps } from 'react-native';

type CardProps = ViewProps;

export function Card({ className = '', ...props }: CardProps) {
  return <View className={`rounded border border-border bg-surface p-4 ${className}`} {...props} />;
}
