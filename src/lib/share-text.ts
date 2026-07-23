import { Share } from 'react-native';

// Share.share (react-native core) em vez de expo-sharing: expo-sharing é
// orientado a arquivo/URI, exigiria escrever um .txt temporário só pra
// compartilhar texto puro. Share.share manda a string direto pro sheet
// nativo (WhatsApp, e-mail, etc.), sem dependência nova.
export async function shareText(message: string): Promise<void> {
  try {
    await Share.share({ message });
  } catch (err) {
    console.error('Falha ao compartilhar:', err);
  }
}

export function buildSessionShareText(params: {
  dayLabel: string;
  dateLabel: string;
  durationLabel: string | null;
  items: {
    exerciseNome: string;
    skipped: boolean;
    sets: { numeroSerie: number; reps: number; carga: number; rpe: number | null }[];
  }[];
}): string {
  const lines: string[] = [];
  lines.push(`Treino: ${params.dayLabel}`);
  lines.push(params.durationLabel ? `${params.dateLabel} · ${params.durationLabel}` : params.dateLabel);
  lines.push('');

  for (const item of params.items) {
    if (item.skipped) {
      lines.push(`${item.exerciseNome} (pulado)`);
      lines.push('');
      continue;
    }
    lines.push(item.exerciseNome);
    if (item.sets.length === 0) {
      lines.push('  (sem séries registradas)');
    } else {
      for (const set of item.sets) {
        const rpeSuffix = set.rpe != null ? ` · RPE ${set.rpe}` : '';
        lines.push(`  Série ${set.numeroSerie}: ${set.reps} reps · ${set.carga}kg${rpeSuffix}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export function buildPlanShareText(params: {
  planNome: string;
  days: {
    label: string;
    exercises: {
      nome: string;
      seriesAlvo: number;
      repsAlvo: number;
      cargaAlvo: number | null;
      supersetGroup: string | null;
    }[];
  }[];
}): string {
  const lines: string[] = [];
  lines.push(`Plano: ${params.planNome}`);
  lines.push('');

  for (const day of params.days) {
    lines.push(day.label);
    for (const ex of day.exercises) {
      const cargaSuffix = ex.cargaAlvo != null ? ` · ${ex.cargaAlvo}kg` : '';
      const supersetSuffix = ex.supersetGroup ? ` (supersérie ${ex.supersetGroup})` : '';
      lines.push(`  ${ex.nome}: ${ex.seriesAlvo}x${ex.repsAlvo}${cargaSuffix}${supersetSuffix}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
