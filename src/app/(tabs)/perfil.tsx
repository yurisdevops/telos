import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ChangelogModal } from '@/components/changelog-modal';
import { CreatePinFlow } from '@/components/pin/create-pin-flow';
import { VerifyPinFlow } from '@/components/pin/verify-pin-flow';
import { Screen } from '@/components/screen';
import { SummaryStatsSection } from '@/components/perfil/summary-stats-section';
import { VolumeAnalysisSection } from '@/components/perfil/volume-analysis-section';
import { WorkoutHistorySection } from '@/components/perfil/workout-history-section';
import { MeasurementsSection } from '@/components/progresso/measurements-section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { getLatestBodyWeightKg, upsertBodyWeightToday } from '@/db/body-weight';
import { hasPin } from '@/db/pin';
import { resetHistory, useSessionCount } from '@/db/reset-history';
import {
  pickAndSaveProfilePhoto,
  removeProfilePhoto,
  SEXO_OPTIONS,
  updateUserProfile,
  useUserProfile,
  type Sexo,
} from '@/db/user-profile';
import { EXPERIENCE_OPTIONS, type AssistantExperience } from '@/lib/assistant-profile';
import { CHANGELOG_ENTRIES } from '@/lib/changelog';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { formatNumberPtBr } from '@/lib/format';
import { useDbQuery } from '@/lib/use-db-query';
import { colors } from '@/theme/tokens';

function reportError(context: string, err: unknown) {
  console.error(context, err);
  Alert.alert(context, String(err instanceof Error ? err.message : err));
}

export default function PerfilScreen() {
  const router = useRouter();
  const profile = useUserProfile();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  // Reler pelo Perfil mostra o changelog INTEIRO (não só o não visto — é "o
  // que mudou", não "o que há de novo") e só fecha ao dispensar; nunca chama
  // markChangelogSeen (isso é papel exclusivo do modal do boot).
  const [changelogModalVisible, setChangelogModalVisible] = useState(false);

  // Reset de histórico com PIN (Etapa C) — 3 travas em sequência, nessa
  // ordem: (1) Alert explicando o que apaga, (2) PIN (cria na 1ª vez, senão
  // pede o existente), (3) confirmação final com a contagem real de sessões.
  // `resetPhase` só cobre a etapa de PIN — a confirmação final e o Alert
  // inicial são nativos (Alert.alert), não precisam de estado próprio.
  const [resetPhase, setResetPhase] = useState<'create-pin' | 'verify-pin' | null>(null);
  const sessionCount = useSessionCount();

  // resetHistory() apaga sessions/set_logs com DELETE sem WHERE — o SQLite
  // pula a "truncate optimization" no update_hook nesse caso (comportamento
  // documentado: sqlite3_update_hook NÃO dispara pra DELETE sem WHERE), então
  // NENHUM listener nativo é notificado — nem useLiveQuery (WorkoutHistorySection)
  // nem useDbQuery (SummaryStatsSection/VolumeAnalysisSection), que usam o
  // mesmo addDatabaseChangeListener por baixo. A transação continua intacta
  // (atomicidade não muda); aqui só forçamos as 3 seções afetadas a REMONTAR
  // depois de um reset bem-sucedido — um remonte sempre refaz a query do zero
  // (independe do listener nativo ter disparado ou não), igual a reabrir o
  // app. `key` em cada componente individualmente (não um wrapper por cima de
  // tudo) — não arrisca resetar os drafts de "Dados pessoais", que ficam
  // fisicamente entre SummaryStats/VolumeAnalysis e WorkoutHistorySection.
  const [statsResetKey, setStatsResetKey] = useState(0);

  const handleResetPress = async () => {
    const ok = await confirm({
      title: 'Resetar histórico de treinos?',
      message:
        'Isso apaga TODO o seu histórico de treinos (sessões, séries, recordes). Seus planos, perfil e peso corporal são mantidos. Esta ação é IRREVERSÍVEL.',
      confirmLabel: 'Continuar',
      variant: 'destructive',
    });
    if (ok) startPinCheck();
  };

  const startPinCheck = async () => {
    try {
      const exists = await hasPin();
      setResetPhase(exists ? 'verify-pin' : 'create-pin');
    } catch (err) {
      reportError('Erro ao checar PIN', err);
    }
  };

  // Chamado tanto depois de CRIAR o PIN quanto depois de VERIFICAR um já
  // existente — nos dois casos a próxima (e última) trava é a confirmação
  // final abaixo. Fecha o modal de PIN antes de abrir o Alert nativo (os
  // dois por cima um do outro ao mesmo tempo seria estranho visualmente).
  const handlePinConfirmed = async () => {
    setResetPhase(null);
    const ok = await confirm({
      title: 'Tem certeza?',
      message: `Isso apaga ${sessionCount} ${sessionCount === 1 ? 'treino registrado' : 'treinos registrados'} e não pode ser desfeito.`,
      confirmLabel: 'APAGAR TUDO',
      variant: 'destructive',
    });
    if (ok) performReset();
  };

  const performReset = () => {
    try {
      resetHistory();
      // Só DEPOIS do commit ter dado certo — remonta as seções que dependem
      // de sessions/set_logs pra refletir o estado vazio na hora (ver
      // comentário em statsResetKey acima).
      setStatsResetKey((k) => k + 1);
      Alert.alert('Histórico apagado', 'Todo o seu histórico de treinos foi removido.');
    } catch (err) {
      reportError('Erro ao resetar histórico', err);
    }
  };

  // fotoUri pode apontar pra um arquivo que não existe mais (ex: restaurou
  // backup de outro device — o arquivo nunca viaja, só o caminho). Checagem
  // síncrona (`.exists` é propriedade, não precisa de await) e memoizada pra
  // não rodar a cada tecla digitada em nome/altura/peso (que re-renderiza a
  // tela inteira). onError cobre o resto (arquivo corrompido, sem permissão
  // de leitura etc.) que `.exists` sozinho não pega.
  const photoFileExists = useMemo(() => {
    if (!profile?.fotoUri) return false;
    try {
      return new File(profile.fotoUri).exists;
    } catch {
      return false;
    }
  }, [profile?.fotoUri]);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  useEffect(() => {
    setPhotoLoadFailed(false);
  }, [profile?.fotoUri]);
  const showPhoto = !!profile?.fotoUri && photoFileExists && !photoLoadFailed;

  const handlePickPhoto = () => {
    Alert.alert('Foto de perfil', undefined, [
      {
        text: 'Galeria',
        onPress: async () => {
          try {
            await pickAndSaveProfilePhoto('library');
          } catch (err) {
            reportError('Erro ao escolher foto', err);
          }
        },
      },
      {
        text: 'Câmera',
        onPress: async () => {
          try {
            await pickAndSaveProfilePhoto('camera');
          } catch (err) {
            reportError('Erro ao escolher foto', err);
          }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const handleRemovePhoto = async () => {
    try {
      await removeProfilePhoto();
    } catch (err) {
      reportError('Erro ao remover foto', err);
    }
  };

  // Mesmo padrão "draft ?? valor salvo" já usado na nota pessoal do exercício
  // (exercicio/[id].tsx): edita livremente sem gravar nada até apertar Salvar.
  const [nomeDraft, setNomeDraft] = useState<string | null>(null);
  const [alturaDraft, setAlturaDraft] = useState<string | null>(null);
  const nomeValue = nomeDraft ?? profile?.nome ?? '';
  const alturaValue = alturaDraft ?? (profile?.alturaCm != null ? String(profile.alturaCm) : '');

  const [pesoDraft, setPesoDraft] = useState('');
  const latestPesoKg = useDbQuery(() => getLatestBodyWeightKg(), ['body_weight_logs'], []);

  // Feedback de "salvo" — some sozinho depois de 1,5s. `savedFeedbackTimeout`
  // guarda o id pra limpar no unmount (troca de aba no meio da janela de
  // 1,5s não deve tentar setState numa tela que já saiu).
  const [savedFeedback, setSavedFeedback] = useState(false);
  const savedFeedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (savedFeedbackTimeout.current) clearTimeout(savedFeedbackTimeout.current);
    };
  }, []);

  // Nome/altura: explícito "Salvar" (mesmo padrão de "Salvar nota" no
  // exercício e "Registrar hoje" do peso corporal) — não onBlur, pra não
  // gravar um valor de altura incompleto/inválido enquanto o usuário digita.
  //
  // Investigação do pedido: não existe (e nunca existiu) um `isEditing` que
  // "fecha" e faz o botão sumir — os campos de Nome/Altura e o botão Salvar
  // já são SEMPRE visíveis nesta seção, sem modo de edição nenhum por trás.
  // O bug real era só a metade 2 do pedido: salvar não dava nenhum feedback
  // (os drafts só voltavam a `null`, e o valor exibido — vindo de
  // `profile?.nome` via useUserProfile — ficava visualmente idêntico ao que
  // já estava lá, então parecia que nada tinha acontecido). Corrigido só
  // isso; não criei um `isEditing`/`setIsEditing(false)` que não tem
  // correspondência nenhuma no código de verdade.
  const handleSaveDadosPessoais = async () => {
    const trimmedNome = nomeValue.trim();
    const alturaTrim = alturaValue.trim();
    const alturaNum = alturaTrim ? Number(alturaTrim) : null;
    const alturaValida = alturaNum != null && Number.isFinite(alturaNum) && alturaNum > 0 ? Math.round(alturaNum) : null;

    try {
      await updateUserProfile({
        nome: trimmedNome ? trimmedNome : null,
        alturaCm: alturaValida,
      });
      setNomeDraft(null);
      setAlturaDraft(null);
      setSavedFeedback(true);
      if (savedFeedbackTimeout.current) clearTimeout(savedFeedbackTimeout.current);
      savedFeedbackTimeout.current = setTimeout(() => setSavedFeedback(false), 1500);
    } catch (err) {
      reportError('Erro ao salvar dados pessoais', err);
    }
  };

  // Experiência: chip aplica na hora, igual todo outro chip de seleção do
  // app (categoria, favoritos, modo treino) — nunca fica atrás de um botão.
  const handleSetExperiencia = async (value: AssistantExperience) => {
    try {
      await updateUserProfile({ experiencia: value });
    } catch (err) {
      reportError('Erro ao salvar experiência', err);
    }
  };

  // Sexo: mesma mecânica do chip de experiência — aplica na hora. Nullable —
  // dado de perfil opcional como os outros desta seção (a feature que
  // motivou adicionar essa coluna, um boneco 2D, foi removida; o campo ficou
  // porque é um dado de perfil válido por si só, sem custo em manter). Tocar
  // no já selecionado desmarca (`toggle`), já que ninguém é obrigado a
  // escolher.
  const handleSetSexo = async (value: Sexo) => {
    try {
      await updateUserProfile({ sexo: profile?.sexo === value ? null : value });
    } catch (err) {
      reportError('Erro ao salvar sexo', err);
    }
  };

  const handleRegisterPeso = async () => {
    const normalized = pesoDraft.trim().replace(',', '.');
    const value = Number(normalized);
    if (!value || value <= 0) return;

    try {
      await upsertBodyWeightToday(value);
      setPesoDraft('');
    } catch (err) {
      reportError('Erro ao registrar peso', err);
    }
  };

  return (
    <Screen edges={['top', 'left', 'right']} scrollable>
      <ScreenTitle title="Perfil" />

      <Card className="mb-6 flex-row items-center gap-4">
        <View className="relative">
          <Pressable
            onPress={handlePickPhoto}
            className="h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-border bg-bg">
            {showPhoto ? (
              <Image
                source={profile!.fotoUri}
                style={{ width: 64, height: 64 }}
                contentFit="cover"
                onError={() => setPhotoLoadFailed(true)}
              />
            ) : (
              <Ionicons name="person-outline" size={32} color={colors.muted} />
            )}
          </Pressable>
          {showPhoto && (
            <Pressable
              onPress={handleRemovePhoto}
              hitSlop={8}
              className="absolute -right-1 -top-1 h-6 w-6 items-center justify-center rounded-full border border-border bg-surface">
              <Ionicons name="close" size={14} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <Text className="flex-1 font-card-title text-xl text-text" numberOfLines={1}>
          {profile?.nome ? profile.nome : 'Adicionar nome'}
        </Text>
      </Card>

      <SummaryStatsSection key={statsResetKey} />

      <CollapsibleSection title="Análise de volume">
        <VolumeAnalysisSection key={statsResetKey} />
      </CollapsibleSection>

      <Section title="Dados pessoais">
        <Label className="mb-1">Nome</Label>
        <Input
          value={nomeValue}
          onChangeText={setNomeDraft}
          placeholder="Seu nome"
          className="mb-4"
        />

        <Label className="mb-1">Altura (cm)</Label>
        <Input
          value={alturaValue}
          onChangeText={setAlturaDraft}
          keyboardType="number-pad"
          placeholder="Ex: 175"
          className="mb-4"
        />

        <Button variant="secondary" disabled={savedFeedback} onPress={handleSaveDadosPessoais}>
          {savedFeedback ? 'Salvo ✓' : 'Salvar'}
        </Button>
        {savedFeedback && (
          <Text className="mt-2 font-label text-xs text-success">✓ Dados salvos com sucesso</Text>
        )}

        <Label className="mb-2 mt-6">Experiência</Label>
        <View className="flex-row flex-wrap gap-2">
          {EXPERIENCE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={profile?.experiencia === option.value}
              onPress={() => handleSetExperiencia(option.value)}
            />
          ))}
        </View>

        {/* Nullable de propósito — dado de perfil opcional, sem uso funcional
            hoje (a feature que motivou adicionar isto, um boneco 2D, foi
            removida). Tocar no já selecionado desmarca (handleSetSexo). */}
        <Label className="mb-2 mt-6">Sexo</Label>
        <View className="flex-row flex-wrap gap-2">
          {SEXO_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={profile?.sexo === option.value}
              onPress={() => handleSetSexo(option.value)}
            />
          ))}
        </View>

        <Label className="mb-2 mt-6">Peso corporal</Label>
        <Label className="mb-3 text-muted">
          {latestPesoKg != null ? `Peso atual: ${formatNumberPtBr(latestPesoKg)}kg` : 'Sem registros de peso ainda.'}
        </Label>
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Input
              value={pesoDraft}
              onChangeText={setPesoDraft}
              keyboardType="decimal-pad"
              placeholder="Ex: 78,5"
            />
          </View>
          <Button onPress={handleRegisterPeso} disabled={!pesoDraft.trim()}>
            Registrar hoje
          </Button>
        </View>
      </Section>

      {/* mt-6: a "Section" acima (Dados pessoais) só empurra o que vem antes
          dela (margem no topo), não o que vem depois — sem isso os
          CollapsibleSection (que só têm mb-6, mesmo padrão do Card usado no
          resto da tela) ficariam colados nela. */}
      <View className="mt-6">
        <CollapsibleSection title="Medidas corporais">
          <MeasurementsSection />
        </CollapsibleSection>

        <CollapsibleSection title="Histórico de treinos">
          <WorkoutHistorySection key={statsResetKey} />
        </CollapsibleSection>
      </View>

      <Section title="Dados">
        <Pressable onPress={() => router.push('/backup')} className="mb-3">
          <Card className="flex-row items-center justify-between">
            <View>
              <Text className="font-card-title text-lg text-text">Dados e backup</Text>
              <Label className="mt-1">Exportar ou restaurar seus planos e histórico</Label>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Card>
        </Pressable>

        <Pressable onPress={() => setChangelogModalVisible(true)} className="mb-3">
          <Card className="flex-row items-center justify-between">
            <View>
              <Text className="font-card-title text-lg text-text">Novidades</Text>
              <Label className="mt-1">Reler o que já mudou no app</Label>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Card>
        </Pressable>

        {/* Movido do header do Catálogo pro Perfil (pedido desta leva) —
            `/sobre.tsx` continua existindo como está (intro do app, Ajuda,
            Créditos/atribuição wger sob CC BY-SA), só o ponto de entrada
            mudou. O bloco compacto de versão/autor no fim desta tela (ver
            abaixo) é NOVO e literal ao pedido, mas por si só não substitui
            o acesso à Ajuda nem aos Créditos — por isso este card continua
            apontando pra tela cheia, evitando que `/sobre` (e a atribuição
            de licença nela) fique inacessível no app. */}
        <Pressable onPress={() => router.push('/sobre')} className="mb-3">
          <Card className="flex-row items-center justify-between">
            <View>
              <Text className="font-card-title text-lg text-text">Sobre</Text>
              <Label className="mt-1">O app, ajuda e créditos</Label>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Card>
        </Pressable>

        {/* Visualmente perigosa, separada das ações normais acima: ícone e
            texto em accent (não há um vermelho dedicado no design system —
            accent já cumpre esse papel de "atenção" em todo o app), borda de
            destaque. A trava de verdade são as 3 etapas do fluxo, não a cor. */}
        <Pressable onPress={handleResetPress}>
          <Card className="flex-row items-center justify-between border-l-4 border-l-accent">
            <View className="flex-1 pr-3">
              <Text className="font-card-title text-lg text-accent">Resetar histórico de treinos</Text>
              <Label className="mt-1">Apaga sessões e séries — irreversível</Label>
            </View>
            <Ionicons name="trash-outline" size={20} color={colors.accent} />
          </Card>
        </Pressable>
      </Section>

      <CreatePinFlow
        visible={resetPhase === 'create-pin'}
        onCreated={handlePinConfirmed}
        onCancel={() => setResetPhase(null)}
      />
      <VerifyPinFlow
        visible={resetPhase === 'verify-pin'}
        onVerified={handlePinConfirmed}
        onCancel={() => setResetPhase(null)}
      />

      <ChangelogModal
        visible={changelogModalVisible}
        entries={CHANGELOG_ENTRIES}
        onDismiss={() => setChangelogModalVisible(false)}
      />

      {/* Sobre o app — compacto, discreto, só rodapé (o card "Sobre" acima,
          na seção Dados, é o ponto de entrada de verdade pra Ajuda/Créditos).
          Mesmo estilo das outras seções (Section/Label), como pedido. */}
      <Section title="Sobre o app">
        <Text className="font-card-title text-base text-text">Telos</Text>
        <Label className="mt-1">Desenvolvido por Yuri Souza</Label>
        <View className="my-3 h-px bg-border" />
        <Label>{`Versão ${appVersion}`}</Label>
      </Section>

      {confirmDialog}
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-6">
      <Label className="mb-3">{title}</Label>
      {children}
    </View>
  );
}
