import { Pressable, Text } from 'react-native';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function Chip({ label, selected = false, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded border px-3 py-1.5 ${
        selected ? 'border-accent bg-accent' : 'border-border bg-transparent'
      }`}>
      <Text
        className={`font-label text-xs uppercase tracking-wide ${
          selected ? 'text-white' : 'text-muted'
        }`}>
        {label}
      </Text>
    </Pressable>
  );
}
