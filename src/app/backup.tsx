import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { buildBackupPayload } from '@/db/backup/serialize';
import { importBackupPayload } from '@/db/backup/restore';
import { TABLE_LABELS, type BackupPayload, type ImportMode, type ImportSummary, type TableKey } from '@/db/backup/types';
import { BackupValidationError, assertValidBackupPayload } from '@/db/backup/validate';
import { getTodayDateString } from '@/lib/date';
import { colors } from '@/theme/tokens';

const TABLE_ORDER: TableKey[] = [
  'workoutPlans',
  'workoutDays',
  'workoutDayExercises',
  'sessions',
  'sessionExtraExercises',
  'sessionSkips',
  'setLogs',
];

function reportError(context: string, err: unknown) {
  console.error(context, err);
  Alert.alert(context, String(err instanceof Error ? err.message : err));
}

function joinCounts(counts: Record<TableKey, number>): string[] {
  return TABLE_ORDER.map((key) => (counts[key] > 0 ? `${counts[key]} ${TABLE_LABELS[key]}` : null)).filter(
    (part): part is string => part !== null
  );
}

function summarizeImport(summary: ImportSummary): string {
  const lines: string[] = [];

  const insertedParts = joinCounts(summary.inserted);
  lines.push(insertedParts.length > 0 ? `Importado: ${insertedParts.join(', ')}.` : 'Nada novo para importar.');

  const reusedParts = joinCounts(summary.reused);
  if (reusedParts.length > 0) {
    lines.push(`Já existia (reaproveitado): ${reusedParts.join(', ')}.`);
  }

  const ambiguousParts = joinCounts(summary.ambiguous);
  if (ambiguousParts.length > 0) {
    lines.push(`Inserido como novo por nome/rótulo ambíguo com o que já existe: ${ambiguousParts.join(', ')}.`);
  }

  if (summary.skippedOrphanExercise.length > 0) {
    const names = [...new Set(summary.skippedOrphanExercise.map((s) => s.exerciseNomeSnapshot))].join(', ');
    lines.push(
      `${summary.skippedOrphanExercise.length} registro(s) ignorado(s) por referenciar exercício que não existe mais no catálogo: ${names}.`
    );
  }

  return lines.join('\n\n');
}

export default function BackupScreen() {
  const [stage, setStage] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const busy = stage !== null;

  const handleExport = async () => {
    try {
      setStage('Lendo dados...');
      const payload = await buildBackupPayload();

      setStage('Gerando arquivo...');
      const filename = `telos-backup-${getTodayDateString()}.json`;
      const file = new File(Paths.cache, filename);
      if (file.exists) file.delete();
      file.write(JSON.stringify(payload, null, 2));

      setStage(null);

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Compartilhamento indisponível', 'Não é possível compartilhar arquivos neste dispositivo.');
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: 'Exportar backup do Telos',
      });
    } catch (err) {
      setStage(null);
      reportError('Erro ao exportar backup', err);
    }
  };

  const runImport = async (payload: BackupPayload, importMode: ImportMode) => {
    setStage('Restaurando...');
    // Yield real antes da transação síncrona pesada — sem isso o React nunca
    // chega a pintar "Restaurando..." antes da thread travar durante o import.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      const summary = importBackupPayload(payload, importMode);
      setStage(null);
      Alert.alert('Backup restaurado', summarizeImport(summary));
    } catch (err) {
      setStage(null);
      reportError('Erro ao restaurar backup', err);
    }
  };

  const handleImport = async () => {
    try {
      setStage('Lendo backup...');
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled) {
        setStage(null);
        return;
      }

      const file = new File(result.assets[0].uri);
      const text = await file.text();
      const parsed = JSON.parse(text);
      const payload = assertValidBackupPayload(parsed);
      setStage(null);

      if (mode === 'replace') {
        Alert.alert(
          'Substituir todos os dados?',
          'Isso apaga TODOS os seus planos, dias, sessões e séries atuais e coloca no lugar exatamente o que está neste arquivo de backup. Essa ação não pode ser desfeita.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Substituir', style: 'destructive', onPress: () => runImport(payload, 'replace') },
          ]
        );
      } else {
        Alert.alert(
          'Mesclar backup?',
          'Isso adiciona ao que você já tem os planos, dias, sessões e séries deste arquivo que ainda não existem no aparelho. Nada é apagado.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Mesclar', onPress: () => runImport(payload, 'merge') },
          ]
        );
      }
    } catch (err) {
      setStage(null);
      if (err instanceof BackupValidationError) {
        Alert.alert('Arquivo de backup inválido', err.message);
      } else if (err instanceof SyntaxError) {
        Alert.alert('Arquivo de backup inválido', 'O arquivo escolhido não é um JSON válido.');
      } else {
        reportError('Erro ao ler backup', err);
      }
    }
  };

  return (
    <Screen showBack scrollable>
      <ScreenTitle title="Dados e backup" subtitle="Tudo salvo só neste aparelho — exporte para não perder" />

      {busy && (
        <Card className="mb-4 flex-row items-center gap-3">
          <ActivityIndicator color={colors.accent} />
          <Text className="font-body text-base text-text">{stage}</Text>
        </Card>
      )}

      <Card className="mb-4">
        <Text className="mb-1 font-card-title text-lg text-text">Exportar backup</Text>
        <Text className="mb-3 font-body text-base text-muted">
          Gera um arquivo com todos os seus planos, dias, sessões e séries registradas (o catálogo
          de exercícios não entra — ele já vem com o app). Você escolhe onde salvar ou enviar.
        </Text>
        <Button onPress={handleExport} disabled={busy}>
          Exportar backup
        </Button>
      </Card>

      <Card>
        <Text className="mb-1 font-card-title text-lg text-text">Restaurar backup</Text>
        <Text className="mb-3 font-body text-base text-muted">
          Escolha um arquivo de backup exportado pelo Telos.
        </Text>

        <Label className="mb-2">Ao importar</Label>
        <View className="mb-3 flex-row gap-2">
          <Chip label="Mesclar" selected={mode === 'merge'} onPress={() => setMode('merge')} />
          <Chip label="Substituir tudo" selected={mode === 'replace'} onPress={() => setMode('replace')} />
        </View>
        <Text className="mb-3 font-body text-sm text-muted">
          {mode === 'merge'
            ? 'Adiciona o que ainda não existe no aparelho, sem apagar nada.'
            : 'Apaga tudo que existe hoje e coloca no lugar o conteúdo do backup.'}
        </Text>

        <Button variant="secondary" onPress={handleImport} disabled={busy}>
          Escolher arquivo de backup
        </Button>
      </Card>
    </Screen>
  );
}
