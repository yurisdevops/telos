import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { eq } from 'drizzle-orm';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { db } from '@/db';
import { sessions } from '@/db/schema';
import { computeWeekStreak } from '@/lib/date';
import { useDbQuery } from '@/lib/use-db-query';

export function FrequencySection() {
  const sessionRows = useDbQuery(
    () => db.select({ data: sessions.data }).from(sessions).where(eq(sessions.concluida, true)),
    ['sessions'],
    []
  );

  const allDates = useMemo(() => (sessionRows ?? []).map((row) => row.data), [sessionRows]);
  const streak = useMemo(() => computeWeekStreak(allDates), [allDates]);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;

  const trainedDays = useMemo(() => {
    const set = new Set<number>();
    for (const date of allDates) {
      if (date.startsWith(monthPrefix)) set.add(Number(date.slice(8, 10)));
    }
    return set;
  }, [allDates, monthPrefix]);

  const leadingOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: Array<number | null> = [
    ...Array.from({ length: leadingOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <Card className="mb-6">
      <Text className="font-display text-5xl text-accent">{streak}</Text>
      <Label className="mb-4">{streak === 1 ? 'semana treinada seguida' : 'semanas treinadas seguidas'}</Label>

      <View className="flex-row flex-wrap gap-1">
        {cells.map((day, index) => (
          <View
            key={index}
            className={`h-8 w-8 items-center justify-center rounded ${
              day === null ? '' : trainedDays.has(day) ? 'bg-accent' : 'border border-border'
            }`}>
            {day !== null && (
              <Text className={`font-body text-xs ${trainedDays.has(day) ? 'text-white' : 'text-muted'}`}>
                {day}
              </Text>
            )}
          </View>
        ))}
      </View>
    </Card>
  );
}
