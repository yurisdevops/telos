import { View, type ViewProps } from 'react-native';

type ProgressBarProps = {
  /** 0 to 1. Values outside that range are clamped. */
  progress: number;
} & ViewProps;

export function ProgressBar({ progress, className = '', ...props }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View className={`h-2 overflow-hidden rounded bg-surface ${className}`} {...props}>
      <View className="h-full rounded bg-accent" style={{ width: `${clamped * 100}%` }} />
    </View>
  );
}
