import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { desc } from 'drizzle-orm';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { cardioLogs } from '@/db/schema';
import { INTENSIDADES_CARDIO, MODALIDADES_CARDIO, type IntensidadeCardio, type ModalidadeCardio } from '@/lib/cardio';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

// Só faz sentido registrar distância pra modalidades onde ela é uma medida
// natural do esforço (percurso percorrido) — hiit/natação/pular corda/
// escada/elíptico/outro não têm essa noção (ou já é coberta por duração).
const MODALIDADES_COM_DISTANCIA = new Set<ModalidadeCardio>(['corrida', 'caminhada', 'bike', 'esteira']);

// Cor por intensidade — classes literais (não `border-${cor}` interpolado)
// de propósito: o NativeWind precisa ver a classe completa no código-fonte
// pra extraí-la, uma string montada em runtime não seria capturada.
const INTENSITY_CLASSNAMES: Record<IntensidadeCardio, { border: string; bg: string }> = {
  leve: { border: 'border-success', bg: 'bg-success' },
  moderado: { border: 'border-warning', bg: 'bg-warning' },
  intenso: { border: 'border-accent', bg: 'bg-accent' },
};

export default function AdicionarCardioScreen() {
  const router = useRouter();
  // Aceita OS DOIS params, mas só um vem preenchido por vez — quem navega
  // pra cá decide qual (hoje.tsx passa sessionId, modo A, bloco dentro de
  // treino de força; cardio/sessao.tsx passa cardioSessionId, modo B, sessão
  // separada só de cardio). Salva com o que veio: nunca os dois, nunca
  // nenhum (mesmo invariante já validado no backup, ver db/backup/validate.ts).
  const { sessionId, cardioSessionId } = useLocalSearchParams<{
    sessionId?: string;
    cardioSessionId?: string;
  }>();
  const sessionIdNum = sessionId ? Number(sessionId) : null;
  const cardioSessionIdNum = cardioSessionId ? Number(cardioSessionId) : null;

  const [modalidade, setModalidade] = useState<ModalidadeCardio | null>(null);
  const [duracao, setDuracao] = useState('');
  const [distancia, setDistancia] = useState('');
  const [intensidade, setIntensidade] = useState<IntensidadeCardio | null>(null);
  const [saving, setSaving] = useState(false);

  // Pré-preenche com a modalidade/intensidade do ÚLTIMO bloco de cardio
  // registrado (qualquer sessão, força ou cardio separado — `orderBy(id)`
  // é o próprio histórico de inserção, mais direto que ordenar por data de
  // sessão pra "o que escolhi da última vez"). Só o caminho mais simples já
  // disponível: lê um dado que já existe, sem criar preferência nova
  // persistida. `modalidadeTouched`/`intensidadeTouched` (mesmo padrão de
  // assistente.tsx pré-preenchendo do Perfil) evitam sobrescrever uma escolha
  // que o usuário já fez enquanto a query ainda estava em voo.
  const [modalidadeTouched, setModalidadeTouched] = useState(false);
  const [intensidadeTouched, setIntensidadeTouched] = useState(false);
  const ultimoLogRows = useDbQuery(
    () =>
      db
        .select({ modalidade: cardioLogs.modalidade, intensidade: cardioLogs.intensidade })
        .from(cardioLogs)
        .orderBy(desc(cardioLogs.id))
        .limit(1),
    ['cardio_logs'],
    []
  );
  const ultimoLog = ultimoLogRows?.[0];

  useEffect(() => {
    if (modalidadeTouched || !ultimoLog) return;
    setModalidade(ultimoLog.modalidade as ModalidadeCardio);
  }, [ultimoLog, modalidadeTouched]);

  useEffect(() => {
    if (intensidadeTouched || !ultimoLog) return;
    setIntensidade(ultimoLog.intensidade as IntensidadeCardio);
  }, [ultimoLog, intensidadeTouched]);

  const showDistancia = modalidade != null && MODALIDADES_COM_DISTANCIA.has(modalidade);

  const canSave = useMemo(
    () => modalidade != null && duracao.trim() !== '' && Number(duracao) > 0 && intensidade != null,
    [modalidade, duracao, intensidade]
  );

  const handleSave = async () => {
    if (!canSave || !modalidade || !intensidade) return;

    const duracaoNum = Number(duracao);
    const distanciaNum = showDistancia && distancia.trim() !== '' ? Number(distancia) : null;
    if (!Number.isFinite(duracaoNum) || (distanciaNum != null && !Number.isFinite(distanciaNum))) return;

    setSaving(true);
    try {
      await db.insert(cardioLogs).values({
        sessionId: sessionIdNum,
        cardioSessionId: cardioSessionIdNum,
        modalidade,
        duracaoMin: duracaoNum,
        distanciaKm: distanciaNum,
        intensidade,
      });
      router.back();
    } catch (err) {
      console.error('Falha ao salvar bloco de cardio:', err);
      Alert.alert('Erro ao salvar cardio', String(err instanceof Error ? err.message : err));
      setSaving(false);
    }
  };

  return (
    <Screen showBack scrollable>
      <ScreenTitle title="Adicionar cardio" />

      <Label className="mb-2">Modalidade</Label>
      <View className="mb-5 flex-row flex-wrap justify-between">
        {MODALIDADES_CARDIO.map((item) => {
          const selected = modalidade === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => {
                setModalidadeTouched(true);
                setModalidade(item.key);
              }}
              className={`mb-2 flex-row items-center gap-2 rounded border px-3 py-3 ${
                selected ? 'border-accent bg-accent' : 'border-border bg-surface'
              }`}
              style={{ width: '48%' }}>
              <Ionicons name={item.icon} size={18} color={selected ? '#fff' : colors.muted} />
              <Text
                numberOfLines={1}
                className={`flex-1 font-label text-xs uppercase tracking-wide ${
                  selected ? 'text-white' : 'text-muted'
                }`}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Label className="mb-1">Duração (min)</Label>
      <Input
        value={duracao}
        onChangeText={setDuracao}
        keyboardType="number-pad"
        placeholder="Ex: 20"
        className="mb-5"
      />

      {showDistancia && (
        <>
          <Label className="mb-1">Distância (km, opcional)</Label>
          <Input
            value={distancia}
            onChangeText={setDistancia}
            keyboardType="decimal-pad"
            placeholder="Ex: 3.5"
            className="mb-5"
          />
        </>
      )}

      <Label className="mb-2">Intensidade</Label>
      <View className="mb-6 flex-row gap-2">
        {INTENSIDADES_CARDIO.map((item) => {
          const selected = intensidade === item.key;
          const classNames = INTENSITY_CLASSNAMES[item.key];
          return (
            <Pressable
              key={item.key}
              onPress={() => {
                setIntensidadeTouched(true);
                setIntensidade(item.key);
              }}
              className={`flex-1 items-center rounded border px-3 py-3 ${
                selected ? `${classNames.border} ${classNames.bg}` : 'border-border bg-surface'
              }`}>
              <Text
                className={`font-label text-xs uppercase tracking-wide ${selected ? 'text-white' : 'text-muted'}`}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row gap-2">
        <Button variant="secondary" className="flex-1" onPress={() => router.back()}>
          Cancelar
        </Button>
        <Button className="flex-1" disabled={!canSave || saving} onPress={handleSave}>
          Salvar
        </Button>
      </View>
    </Screen>
  );
}
