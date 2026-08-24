import { Fragment, useMemo } from 'react';
import { Text, View } from 'react-native';

import { Label } from '@/components/ui/label';
import { computeWeeklyMuscleSeries, computeWeeklyPushPull } from '@/db/analysis';
import { useDbQuery } from '@/lib/use-db-query';

// Exportados — coach.ts reusa a MESMA faixa de referência e a MESMA lista de
// músculos "grandes" pra gerar o insight de volume, em vez de redeclarar os
// mesmos 8 nomes e os mesmos números 10/20 por conta própria.
export const REFERENCE_MIN = 10;
export const REFERENCE_MAX = 20;

// Só os grupos "grandes" que a faixa de referência de 10-20 séries/semana da
// literatura de volume cobre. Os demais 9 grupos do catálogo (Abdômen,
// Panturrilhas, Antebraços, Trapézio, Lombar, Pescoço, Corpo inteiro,
// Adutores, Glúteo médio) ficam de fora do painel — essa faixa não se
// aplica a eles.
export const TRACKED_MUSCLES = [
  'Peito',
  'Dorsais',
  'Quadríceps',
  'Posterior de coxa',
  'Glúteos',
  'Ombros',
  'Bíceps',
  'Tríceps',
];

// Desequilíbrio empurrar/puxar: só alerta se o lado maior já tem volume
// suficiente pra o "2x" não ser ruído de poucas séries (ex: 2 vs 1 sérias
// bate a regra dos 2x mas não significa nada).
const PUSH_PULL_MIN_SERIES = 6;
const PUSH_PULL_RATIO = 2;

type MuscleRowState = 'zero' | 'low' | 'inRange' | 'high';

function classifyMuscleRow(value: number): MuscleRowState {
  if (value === 0) return 'zero';
  if (value < REFERENCE_MIN) return 'low';
  if (value <= REFERENCE_MAX) return 'inRange';
  return 'high';
}

const BAR_COLOR_BY_STATE: Record<MuscleRowState, string> = {
  zero: 'bg-border',
  low: 'bg-warning',
  inRange: 'bg-success',
  high: 'bg-accent',
};

const TEXT_COLOR_BY_STATE: Record<MuscleRowState, string> = {
  zero: 'text-muted',
  low: 'text-warning',
  inRange: 'text-success',
  high: 'text-accent',
};

function formatPerWeek(value: number): string {
  return value.toFixed(1);
}

/**
 * Painel de volume — mesma filosofia da StagnationSection: mostra o dado,
 * aponta o desvio, a decisão é do usuário. Nunca prescreve exercício/carga.
 * Sempre exibe o panorama (não só quando há alerta) — os alertas por regra
 * ficam destacados no topo, no mesmo estilo "amarelo de atenção" já usado
 * nos avisos do Assistente.
 */
export function VolumeAnalysisSection() {
  const muscleSeries = useDbQuery(computeWeeklyMuscleSeries, ['set_logs', 'sessions'], []);
  const pushPull = useDbQuery(computeWeeklyPushPull, ['set_logs', 'sessions'], []);

  const { muscleAlerts, pushPullAlert } = useMemo(() => {
    if (!muscleSeries || !pushPull) return { muscleAlerts: [] as string[], pushPullAlert: null as string | null };

    const muscleAlerts: string[] = [];
    for (const muscle of TRACKED_MUSCLES) {
      const value = muscleSeries[muscle] ?? 0;
      // 0 é tratado à parte (pode ser um padrão de movimento que a pessoa não
      // treina de propósito) — só entra no alerta quando há ALGUM trabalho
      // direto, mas abaixo da faixa de referência.
      if (value > 0 && value < REFERENCE_MIN) {
        muscleAlerts.push(
          `${muscle}: ~${formatPerWeek(value)} séries diretas por semana (média de 4 semanas). ` +
            `Volume comumente associado a crescimento fica em torno de ${REFERENCE_MIN}-${REFERENCE_MAX} séries semanais.`
        );
      }
    }

    let pushPullAlert: string | null = null;
    const { empurrarPorSemana, puxarPorSemana } = pushPull;
    const bigger = Math.max(empurrarPorSemana, puxarPorSemana);
    const smaller = Math.min(empurrarPorSemana, puxarPorSemana);
    if (bigger >= PUSH_PULL_MIN_SERIES && (smaller === 0 || bigger >= smaller * PUSH_PULL_RATIO)) {
      pushPullAlert =
        `Empurrar: ~${formatPerWeek(empurrarPorSemana)}/sem, Puxar: ~${formatPerWeek(puxarPorSemana)}/sem. ` +
        `Desequilíbrios grandes e prolongados entre empurrar e puxar podem sobrecarregar o ombro — considere equilibrar.`;
    }

    return { muscleAlerts, pushPullAlert };
  }, [muscleSeries, pushPull]);

  const maxValue = useMemo(() => {
    if (!muscleSeries) return REFERENCE_MAX;
    const trackedValues = TRACKED_MUSCLES.map((muscle) => muscleSeries[muscle] ?? 0);
    return Math.max(REFERENCE_MAX, ...trackedValues, 1);
  }, [muscleSeries]);

  const isLoading = muscleSeries === undefined || pushPull === undefined;
  const hasAnyTraining = !isLoading && Object.keys(muscleSeries).length > 0;
  const hasAnyAlert = muscleAlerts.length > 0 || pushPullAlert !== null;
  const pushPullTotal = pushPull ? pushPull.empurrarPorSemana + pushPull.puxarPorSemana : 0;

  return (
    <Fragment>
      <Label className="mb-4">Séries diretas por grupo muscular · média das últimas 4 semanas completas</Label>

      <View className="mb-4 rounded border-l-4 border-l-accent bg-surface px-3 py-2">
        <Text className="font-body text-sm text-muted">
          Estes números são um retrato do seu volume recente, não uma prescrição. Use como
          referência; ajuste conforme seu contexto, e em caso de lesão ou dúvida, procure um
          profissional.
        </Text>
      </View>

      {isLoading ? null : !hasAnyTraining ? (
        <Text className="py-8 text-center font-body text-muted">
          Ainda não há treinos suficientes nas últimas 4 semanas completas pra analisar seu volume.
        </Text>
      ) : (
        <>
          {muscleAlerts.map((text, index) => (
            <View key={index} className="mb-2 rounded border-l-4 border-l-warning bg-surface px-3 py-2">
              <Text className="font-body text-sm text-text">{text}</Text>
            </View>
          ))}
          {pushPullAlert && (
            <View className="mb-2 rounded border-l-4 border-l-warning bg-surface px-3 py-2">
              <Text className="font-body text-sm text-text">{pushPullAlert}</Text>
            </View>
          )}
          {muscleAlerts.length > 0 && (
            <Label className="mb-4 text-muted">
              Essa contagem é só de trabalho direto (o músculo listado como primário no
              catálogo) — músculos treinados indiretamente, como secundários em outros
              exercícios, podem receber mais estímulo do que esse número sozinho sugere.
            </Label>
          )}
          {!hasAnyAlert && (
            <Label className="mb-4 text-muted">Sem sinais de desequilíbrio no período.</Label>
          )}

          <Text className="mb-2 font-card-title text-base text-text">Séries por grupo</Text>
          {TRACKED_MUSCLES.map((muscle) => {
            const value = muscleSeries[muscle] ?? 0;
            const state = classifyMuscleRow(value);
            return (
              <View key={muscle} className="mb-3">
                <View className="mb-1 flex-row items-center justify-between">
                  <Label>{muscle}</Label>
                  <Text className={`font-label text-xs ${TEXT_COLOR_BY_STATE[state]}`}>
                    {formatPerWeek(value)}
                  </Text>
                </View>
                <View className="h-3 overflow-hidden rounded bg-surface">
                  <View
                    className="absolute h-full bg-border"
                    style={{
                      left: `${(REFERENCE_MIN / maxValue) * 100}%`,
                      width: `${((REFERENCE_MAX - REFERENCE_MIN) / maxValue) * 100}%`,
                    }}
                  />
                  <View
                    className={`h-full rounded ${BAR_COLOR_BY_STATE[state]}`}
                    style={{ width: `${Math.min(100, (value / maxValue) * 100)}%` }}
                  />
                </View>
              </View>
            );
          })}

          <Text className="mb-2 mt-6 font-card-title text-base text-text">Empurrar vs. puxar</Text>
          <View className="flex-row items-center gap-4">
            <View className="flex-1">
              <Text className="font-display text-3xl text-accent">
                {formatPerWeek(pushPull.empurrarPorSemana)}
              </Text>
              <Label>séries/sem · empurrar</Label>
            </View>
            <View className="flex-1">
              <Text className="font-display text-3xl text-accent">
                {formatPerWeek(pushPull.puxarPorSemana)}
              </Text>
              <Label>séries/sem · puxar</Label>
            </View>
          </View>
          {pushPullTotal > 0 && (
            <View className="mt-3 h-3 flex-row overflow-hidden rounded bg-surface">
              <View
                className="h-full bg-accent"
                style={{ width: `${(pushPull.empurrarPorSemana / pushPullTotal) * 100}%` }}
              />
              <View
                className="h-full bg-border"
                style={{ width: `${(pushPull.puxarPorSemana / pushPullTotal) * 100}%` }}
              />
            </View>
          )}
        </>
      )}
    </Fragment>
  );
}
