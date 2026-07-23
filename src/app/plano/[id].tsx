import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';

import { FormModal } from '@/components/form-modal';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Label } from '@/components/ui/label';
import { ScreenTitle } from '@/components/ui/screen-title';
import { db } from '@/db';
import { exercises, workoutDayExercises, workoutDays, workoutPlans } from '@/db/schema';
import { duplicateDayTx, duplicatePlanTx } from '@/db/duplicate';
import { buildPlanShareText, shareText } from '@/lib/share-text';
import { colors } from '@/theme/tokens';

const SUPERSET_GROUP_OPTIONS = ['Nenhuma', 'A', 'B', 'C', 'D'] as const;

export default function PlanoDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const planId = Number(id);
  const [isAddDayModalVisible, setIsAddDayModalVisible] = useState(false);
  const [dayLabel, setDayLabel] = useState('');

  const [renameTarget, setRenameTarget] = useState<{ type: 'plan' | 'day'; id: number } | null>(
    null
  );
  const [renameValue, setRenameValue] = useState('');

  const [editingExercise, setEditingExercise] = useState<{ id: number; nome: string } | null>(
    null
  );
  const [editSeries, setEditSeries] = useState('');
  const [editReps, setEditReps] = useState('');
  const [editCarga, setEditCarga] = useState('');
  const [editSupersetGroup, setEditSupersetGroup] = useState<string | null>(null);

  const [duplicatePlanModalVisible, setDuplicatePlanModalVisible] = useState(false);
  const [duplicatePlanName, setDuplicatePlanName] = useState('');

  const [duplicateDayTarget, setDuplicateDayTarget] = useState<{ id: number; label: string } | null>(
    null
  );
  const [duplicateDayName, setDuplicateDayName] = useState('');
  const [duplicateDayTargetPlanId, setDuplicateDayTargetPlanId] = useState<number | null>(null);

  const { data: planRows } = useLiveQuery(
    db.select().from(workoutPlans).where(eq(workoutPlans.id, planId)),
    [planId]
  );
  const plan = planRows?.[0];

  const { data: allPlans } = useLiveQuery(db.select().from(workoutPlans));

  const { data: days } = useLiveQuery(
    db.select().from(workoutDays).where(eq(workoutDays.planId, planId)),
    [planId]
  );
  const sortedDays = useMemo(() => [...(days ?? [])].sort((a, b) => a.ordem - b.ordem), [days]);

  const { data: dayExercises } = useLiveQuery(
    db
      .select({
        id: workoutDayExercises.id,
        dayId: workoutDayExercises.dayId,
        seriesAlvo: workoutDayExercises.seriesAlvo,
        repsAlvo: workoutDayExercises.repsAlvo,
        cargaAlvo: workoutDayExercises.cargaAlvo,
        ordem: workoutDayExercises.ordem,
        supersetGroup: workoutDayExercises.supersetGroup,
        exerciseNome: exercises.nome,
      })
      .from(workoutDayExercises)
      .innerJoin(exercises, eq(workoutDayExercises.exerciseId, exercises.id))
      .orderBy(workoutDayExercises.ordem)
  );

  const exercisesByDay = useMemo(() => {
    const map = new Map<number, NonNullable<typeof dayExercises>>();
    for (const row of dayExercises ?? []) {
      const list = map.get(row.dayId) ?? [];
      list.push(row);
      map.set(row.dayId, list);
    }
    return map;
  }, [dayExercises]);

  const handleAddDay = async () => {
    const trimmed = dayLabel.trim();
    if (!trimmed) return;
    try {
      await db.insert(workoutDays).values({
        planId,
        label: trimmed,
        ordem: sortedDays.length,
      });
      setDayLabel('');
      setIsAddDayModalVisible(false);
    } catch (err) {
      console.error('Falha ao adicionar dia:', err);
      Alert.alert('Erro ao adicionar dia', String(err instanceof Error ? err.message : err));
    }
  };

  const openRenamePlan = () => {
    setRenameTarget({ type: 'plan', id: planId });
    setRenameValue(plan?.nome ?? '');
  };

  const openRenameDay = (day: { id: number; label: string }) => {
    setRenameTarget({ type: 'day', id: day.id });
    setRenameValue(day.label);
  };

  const handleRenameConfirm = async () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    try {
      if (renameTarget.type === 'plan') {
        await db.update(workoutPlans).set({ nome: trimmed }).where(eq(workoutPlans.id, renameTarget.id));
      } else {
        await db.update(workoutDays).set({ label: trimmed }).where(eq(workoutDays.id, renameTarget.id));
      }
      setRenameTarget(null);
    } catch (err) {
      console.error('Falha ao renomear:', err);
      Alert.alert('Erro ao renomear', String(err instanceof Error ? err.message : err));
    }
  };

  const openEditExercise = (row: {
    id: number;
    exerciseNome: string;
    seriesAlvo: number;
    repsAlvo: number;
    cargaAlvo: number | null;
    supersetGroup: string | null;
  }) => {
    setEditingExercise({ id: row.id, nome: row.exerciseNome });
    setEditSeries(String(row.seriesAlvo));
    setEditReps(String(row.repsAlvo));
    setEditCarga(row.cargaAlvo != null ? String(row.cargaAlvo) : '');
    setEditSupersetGroup(row.supersetGroup);
  };

  const handleEditExerciseConfirm = async () => {
    if (!editingExercise) return;
    const seriesNum = Number(editSeries);
    const repsNum = Number(editReps);
    const cargaNum = editCarga.trim() ? Number(editCarga) : null;
    if (!seriesNum || !repsNum) return;
    try {
      await db
        .update(workoutDayExercises)
        .set({
          seriesAlvo: seriesNum,
          repsAlvo: repsNum,
          cargaAlvo: cargaNum,
          supersetGroup: editSupersetGroup,
        })
        .where(eq(workoutDayExercises.id, editingExercise.id));
      setEditingExercise(null);
    } catch (err) {
      console.error('Falha ao editar exercício:', err);
      Alert.alert('Erro ao editar exercício', String(err instanceof Error ? err.message : err));
    }
  };

  const handleRemoveExercise = (dayExerciseId: number) => {
    Alert.alert('Remover exercício', 'Deseja remover este exercício do dia?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await db.delete(workoutDayExercises).where(eq(workoutDayExercises.id, dayExerciseId));
          } catch (err) {
            console.error('Falha ao remover exercício:', err);
            Alert.alert('Erro ao remover exercício', String(err instanceof Error ? err.message : err));
          }
        },
      },
    ]);
  };

  const handleMoveExercise = (dayId: number, exerciseRowId: number, direction: 'up' | 'down') => {
    const list = exercisesByDay.get(dayId) ?? [];
    const index = list.findIndex((row) => row.id === exerciseRowId);
    if (index === -1) return;
    const neighborIndex = direction === 'up' ? index - 1 : index + 1;
    if (neighborIndex < 0 || neighborIndex >= list.length) return;

    const current = list[index];
    const neighbor = list[neighborIndex];
    try {
      db.transaction((tx) => {
        tx.update(workoutDayExercises)
          .set({ ordem: neighbor.ordem })
          .where(eq(workoutDayExercises.id, current.id))
          .run();
        tx.update(workoutDayExercises)
          .set({ ordem: current.ordem })
          .where(eq(workoutDayExercises.id, neighbor.id))
          .run();
      });
    } catch (err) {
      console.error('Falha ao mover exercício:', err);
      Alert.alert('Erro ao mover exercício', String(err instanceof Error ? err.message : err));
    }
  };

  const handleRemoveDay = (dayId: number) => {
    Alert.alert(
      'Remover dia',
      'Isso também remove os exercícios adicionados nele. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.delete(workoutDayExercises).where(eq(workoutDayExercises.dayId, dayId));
              await db.delete(workoutDays).where(eq(workoutDays.id, dayId));
            } catch (err) {
              console.error('Falha ao remover dia:', err);
              Alert.alert('Erro ao remover dia', String(err instanceof Error ? err.message : err));
            }
          },
        },
      ]
    );
  };

  const handleDeletePlan = () => {
    Alert.alert(
      'Excluir plano',
      `Tem certeza que deseja excluir "${plan?.nome}"? Essa ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              for (const day of sortedDays) {
                await db.delete(workoutDayExercises).where(eq(workoutDayExercises.dayId, day.id));
              }
              await db.delete(workoutDays).where(eq(workoutDays.planId, planId));
              await db.delete(workoutPlans).where(eq(workoutPlans.id, planId));
              router.back();
            } catch (err) {
              console.error('Falha ao excluir plano:', err);
              Alert.alert('Erro ao excluir plano', String(err instanceof Error ? err.message : err));
            }
          },
        },
      ]
    );
  };

  const handleSharePlan = async () => {
    await shareText(
      buildPlanShareText({
        planNome: plan?.nome ?? 'Plano',
        days: sortedDays.map((day) => ({
          label: day.label,
          exercises: (exercisesByDay.get(day.id) ?? []).map((ex) => ({
            nome: ex.exerciseNome,
            seriesAlvo: ex.seriesAlvo,
            repsAlvo: ex.repsAlvo,
            cargaAlvo: ex.cargaAlvo,
            supersetGroup: ex.supersetGroup,
          })),
        })),
      })
    );
  };

  const openDuplicatePlan = () => {
    setDuplicatePlanName(`${plan?.nome ?? ''} (cópia)`);
    setDuplicatePlanModalVisible(true);
  };

  const handleDuplicatePlanConfirm = () => {
    const trimmed = duplicatePlanName.trim();
    if (!trimmed) return;
    try {
      const newPlanId = duplicatePlanTx(planId, trimmed);
      setDuplicatePlanModalVisible(false);
      router.push({ pathname: '/plano/[id]', params: { id: String(newPlanId) } });
    } catch (err) {
      console.error('Falha ao duplicar plano:', err);
      Alert.alert('Erro ao duplicar plano', String(err instanceof Error ? err.message : err));
    }
  };

  const openDuplicateDay = (day: { id: number; label: string }) => {
    setDuplicateDayTarget(day);
    setDuplicateDayName(`${day.label} (cópia)`);
    setDuplicateDayTargetPlanId(planId);
  };

  const handleDuplicateDayConfirm = () => {
    if (!duplicateDayTarget || duplicateDayTargetPlanId == null) return;
    const trimmed = duplicateDayName.trim();
    if (!trimmed) return;
    try {
      duplicateDayTx(duplicateDayTarget.id, duplicateDayTargetPlanId, trimmed);
      setDuplicateDayTarget(null);
    } catch (err) {
      console.error('Falha ao duplicar dia:', err);
      Alert.alert('Erro ao duplicar dia', String(err instanceof Error ? err.message : err));
    }
  };

  return (
    <Screen showBack scrollable>
      <ScreenTitle
        title={plan?.nome ?? 'Plano'}
        subtitle={`${sortedDays.length} ${sortedDays.length === 1 ? 'dia' : 'dias'}`}
        action={
          <View className="flex-row items-center gap-3">
            <Pressable onPress={handleSharePlan} hitSlop={8} className="p-1">
              <Ionicons name="share-outline" size={22} color={colors.muted} />
            </Pressable>
            <Pressable onPress={openDuplicatePlan} hitSlop={8} className="p-1">
              <Ionicons name="copy-outline" size={22} color={colors.muted} />
            </Pressable>
            <Pressable onPress={openRenamePlan} hitSlop={8} className="p-1">
              <Ionicons name="pencil-outline" size={22} color={colors.muted} />
            </Pressable>
          </View>
        }
      />

      <View>
        {sortedDays.map((day) => {
          const dayExerciseList = exercisesByDay.get(day.id) ?? [];
          return (
            <Card key={day.id} className="mb-4">
              <View className="mb-1 flex-row items-center justify-between">
                <Pressable
                  className="mr-2 flex-1 flex-row items-center gap-2"
                  onPress={() => openRenameDay(day)}>
                  <Text className="flex-1 font-display text-2xl uppercase text-text" numberOfLines={1}>
                    {day.label}
                  </Text>
                  <Ionicons name="pencil-outline" size={16} color={colors.muted} />
                </Pressable>
                <View className="flex-row items-center gap-2">
                  <Button variant="secondary" onPress={() => openDuplicateDay(day)}>
                    Duplicar
                  </Button>
                  <Button variant="destructive" onPress={() => handleRemoveDay(day.id)}>
                    Remover
                  </Button>
                </View>
              </View>
              <Label className="mb-3">
                {`${dayExerciseList.length} ${dayExerciseList.length === 1 ? 'exercício' : 'exercícios'}`}
              </Label>

              {dayExerciseList.map((row, index) => (
                <View
                  key={row.id}
                  className="mb-2 flex-row items-center justify-between rounded border border-border bg-bg px-3 py-2">
                  <Pressable
                    className="flex-1 flex-row items-center justify-between pr-2"
                    onPress={() => openEditExercise(row)}>
                    <View className="flex-1 pr-2">
                      <Text className="font-body-medium text-base text-text" numberOfLines={1}>
                        {row.exerciseNome}
                      </Text>
                      {row.supersetGroup != null && (
                        <Label className="mt-0.5 text-accent">{`Supersérie ${row.supersetGroup}`}</Label>
                      )}
                    </View>
                    <Text className="font-display text-lg text-text" numberOfLines={1}>
                      {`${row.seriesAlvo}x${row.repsAlvo}`}
                      {row.cargaAlvo != null && (
                        <Text className="font-display text-lg text-muted">{` · ${row.cargaAlvo}kg`}</Text>
                      )}
                    </Text>
                  </Pressable>
                  <View className="flex-row items-center">
                    <Pressable
                      onPress={() => handleMoveExercise(day.id, row.id, 'up')}
                      disabled={index === 0}
                      hitSlop={6}
                      className="p-1">
                      <Ionicons
                        name="chevron-up"
                        size={18}
                        color={index === 0 ? colors.border : colors.muted}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => handleMoveExercise(day.id, row.id, 'down')}
                      disabled={index === dayExerciseList.length - 1}
                      hitSlop={6}
                      className="p-1">
                      <Ionicons
                        name="chevron-down"
                        size={18}
                        color={index === dayExerciseList.length - 1 ? colors.border : colors.muted}
                      />
                    </Pressable>
                    <Button variant="ghost" onPress={() => handleRemoveExercise(row.id)}>
                      <Ionicons name="close" size={18} color={colors.muted} />
                    </Button>
                  </View>
                </View>
              ))}

              <Button
                variant="primary"
                className="mt-2"
                onPress={() =>
                  router.push({ pathname: '/plano/selecionar-exercicio', params: { dayId: String(day.id) } })
                }>
                + Adicionar exercício
              </Button>
            </Card>
          );
        })}

        <Button className="mb-3" onPress={() => setIsAddDayModalVisible(true)}>
          + Adicionar dia
        </Button>

        <Button variant="destructive" onPress={handleDeletePlan}>
          Excluir plano
        </Button>
      </View>

      <FormModal
        visible={isAddDayModalVisible}
        onRequestClose={() => setIsAddDayModalVisible(false)}>
        <Text className="mb-3 font-card-title text-lg text-text">Nome do dia</Text>
        <TextInput
          value={dayLabel}
          onChangeText={setDayLabel}
          placeholder="Ex: Peito e Tríceps"
          placeholderTextColor={colors.muted}
          autoFocus
          className="rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
        />
        <View className="mt-4 flex-row gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onPress={() => setIsAddDayModalVisible(false)}>
            Cancelar
          </Button>
          <Button className="flex-1" onPress={handleAddDay}>
            Adicionar
          </Button>
        </View>
      </FormModal>

      <FormModal visible={!!renameTarget} onRequestClose={() => setRenameTarget(null)}>
        <Text className="mb-3 font-card-title text-lg text-text">
          {renameTarget?.type === 'plan' ? 'Nome do plano' : 'Nome do dia'}
        </Text>
        <TextInput
          value={renameValue}
          onChangeText={setRenameValue}
          placeholderTextColor={colors.muted}
          autoFocus
          className="rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
        />
        <View className="mt-4 flex-row gap-2">
          <Button variant="secondary" className="flex-1" onPress={() => setRenameTarget(null)}>
            Cancelar
          </Button>
          <Button className="flex-1" onPress={handleRenameConfirm}>
            Salvar
          </Button>
        </View>
      </FormModal>

      <FormModal visible={!!editingExercise} onRequestClose={() => setEditingExercise(null)}>
        <Text className="mb-3 font-card-title text-lg text-text">{editingExercise?.nome}</Text>

        <Label className="mb-1">Séries</Label>
        <TextInput
          value={editSeries}
          onChangeText={setEditSeries}
          keyboardType="number-pad"
          className="mb-3 rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
        />

        <Label className="mb-1">Repetições</Label>
        <TextInput
          value={editReps}
          onChangeText={setEditReps}
          keyboardType="number-pad"
          className="mb-3 rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
        />

        <Label className="mb-1">Carga alvo (kg, opcional)</Label>
        <TextInput
          value={editCarga}
          onChangeText={setEditCarga}
          keyboardType="decimal-pad"
          placeholder="Ex: 20"
          placeholderTextColor={colors.muted}
          className="mb-4 rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
        />

        <Label className="mb-1">Supersérie</Label>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {SUPERSET_GROUP_OPTIONS.map((option) => {
            const value = option === 'Nenhuma' ? null : option;
            return (
              <Chip
                key={option}
                label={option}
                selected={editSupersetGroup === value}
                onPress={() => setEditSupersetGroup(value)}
              />
            );
          })}
        </View>

        <View className="flex-row gap-2">
          <Button variant="secondary" className="flex-1" onPress={() => setEditingExercise(null)}>
            Cancelar
          </Button>
          <Button className="flex-1" onPress={handleEditExerciseConfirm}>
            Salvar
          </Button>
        </View>

        <Button
          variant="destructive"
          className="mt-2"
          onPress={() => {
            const id = editingExercise?.id;
            setEditingExercise(null);
            if (id != null) handleRemoveExercise(id);
          }}>
          Remover exercício do dia
        </Button>
      </FormModal>

      <FormModal
        visible={duplicatePlanModalVisible}
        onRequestClose={() => setDuplicatePlanModalVisible(false)}>
        <Text className="mb-3 font-card-title text-lg text-text">Duplicar plano</Text>
        <Label className="mb-1">Nome da cópia</Label>
        <TextInput
          value={duplicatePlanName}
          onChangeText={setDuplicatePlanName}
          autoFocus
          className="mb-4 rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
        />
        <Label className="mb-4">Cria uma cópia com todos os dias e exercícios. Sessões e histórico não são copiados.</Label>
        <View className="flex-row gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onPress={() => setDuplicatePlanModalVisible(false)}>
            Cancelar
          </Button>
          <Button className="flex-1" onPress={handleDuplicatePlanConfirm}>
            Duplicar
          </Button>
        </View>
      </FormModal>

      <FormModal visible={!!duplicateDayTarget} onRequestClose={() => setDuplicateDayTarget(null)}>
        <Text className="mb-3 font-card-title text-lg text-text">Duplicar dia</Text>
        <Label className="mb-1">Nome da cópia</Label>
        <TextInput
          value={duplicateDayName}
          onChangeText={setDuplicateDayName}
          autoFocus
          className="mb-4 rounded border border-border bg-surface px-4 py-3 font-body text-base text-text"
        />
        <Label className="mb-2">Para qual plano?</Label>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {(allPlans ?? []).map((p) => (
            <Chip
              key={p.id}
              label={p.id === planId ? 'Este plano' : p.nome}
              selected={duplicateDayTargetPlanId === p.id}
              onPress={() => setDuplicateDayTargetPlanId(p.id)}
            />
          ))}
        </View>
        <View className="flex-row gap-2">
          <Button variant="secondary" className="flex-1" onPress={() => setDuplicateDayTarget(null)}>
            Cancelar
          </Button>
          <Button className="flex-1" onPress={handleDuplicateDayConfirm}>
            Duplicar
          </Button>
        </View>
      </FormModal>
    </Screen>
  );
}
