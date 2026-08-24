import type { ComponentProps } from 'react';
import { and, eq, sql } from 'drizzle-orm';
import Ionicons from '@expo/vector-icons/Ionicons';

import { db } from '@/db';
import { exercises, sessions, setLogs } from '@/db/schema';
import { ADHERENCE_WEEKS_WINDOW, computeAdherence } from '@/components/progresso/adherence-section';
import { REFERENCE_MAX, REFERENCE_MIN, TRACKED_MUSCLES } from '@/components/perfil/volume-analysis-section';
import { computeWeeklyMuscleSeries, computeWeeklyPushPull } from '@/db/analysis';
import { computeWeekStreak, getTodayDateString, getWeekStartIso } from '@/lib/date';
import { findSessionPrs } from '@/lib/personal-records';
import { getLoadIncrement } from '@/lib/suggest-load';
import { computeTrainedDaysInWeek } from '@/lib/stats';

export type CoachInsightTipo = 'positivo' | 'atencao' | 'sugestao' | 'neutro';

export type CoachInsight = {
  id: string;
  tipo: CoachInsightTipo;
  titulo: string; // curto, ex: "Estagnação no agachamento"
  mensagem: string; // 1-3 frases em português natural, tom de professor
  acao?: string; // ação concreta opcional, ex: "Tente 82.5kg na próxima vez"
  // Nome do Ionicon — tipado contra o próprio componente (mesmo padrão já
  // usado em collapsible-section.tsx: `ComponentProps<typeof Ionicons>['name']`)
  // em vez de `string` solto, pra um nome de ícone errado quebrar o `tsc`
  // aqui, não silenciosamente virar um ícone em branco no device.
  icone: ComponentProps<typeof Ionicons>['name'];
};

export type CoachReport = {
  saudacao: string; // ex: "Boa semana, Yuri." ou "Vamos analisar sua semana."
  insights: CoachInsight[];
  geradoEm: number; // timestamp
};

const MAX_INSIGHTS = 4;

// Prioridade de exibição quando há mais candidatos do que MAX_INSIGHTS —
// "atencao > sugestao > positivo > neutro", exatamente como pedido. O sort
// abaixo é estável, então dentro do mesmo tipo a ordem em que cada regra foi
// avaliada (2→3→4→5→6) é preservada.
const TIPO_PRIORITY: Record<CoachInsightTipo, number> = {
  atencao: 3,
  sugestao: 2,
  positivo: 1,
  neutro: 0,
};

function parseMusclesJson(json: string): string[] {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// REGRA 1 — saudação contextual
// ---------------------------------------------------------------------------

function buildSaudacao(treinosEstaSemana: number, userName: string | null, bateuPrEstaSemana: boolean): string {
  let base: string;
  if (treinosEstaSemana === 0) {
    base = 'Ainda não há treinos registrados esta semana.';
  } else if (treinosEstaSemana <= 2) {
    base = 'Você já começou a semana. Vamos ver como está indo.';
  } else {
    base = userName ? `Boa semana, ${userName}.` : 'Boa semana de treinos.';
  }
  if (bateuPrEstaSemana) base += ' E você bateu recorde — ótimo.';
  return base;
}

/** PR batido nesta semana — reusa `findSessionPrs` (mesma função do card de
 * compartilhamento/celebração) em cada sessão concluída da semana atual, em
 * vez de reimplementar a comparação de cargas aqui. Poucas sessões por
 * semana (no máximo 1/dia na prática), então rodar uma consulta por sessão é
 * barato. */
async function hasAnyPrThisWeek(sessionIdsThisWeek: number[]): Promise<boolean> {
  for (const sessionId of sessionIdsThisWeek) {
    const prs = await findSessionPrs(sessionId);
    if (prs.length > 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// REGRA 2 — volume por músculo (reusa computeWeeklyMuscleSeries)
// ---------------------------------------------------------------------------

// Só os 8 músculos "grandes" já usados em VolumeAnalysisSection têm uma faixa
// de referência definida (10-20 séries/semana) — os mesmos usados ali,
// reaproveitados daqui em vez de redeclarados. Título com concordância de
// gênero/número certa pra cada um (lista fixa e pequena, então um mapa
// explícito é mais seguro que tentar adivinhar "esquecido/a(s)" por regra).
const MUSCLE_ESQUECIDO_TITLE: Record<string, string> = {
  Peito: 'Peito esquecido',
  Dorsais: 'Costas esquecidas',
  Quadríceps: 'Quadríceps esquecido',
  'Posterior de coxa': 'Posterior de coxa esquecido',
  Glúteos: 'Glúteos esquecidos',
  Ombros: 'Ombros esquecidos',
  Bíceps: 'Bíceps esquecido',
  Tríceps: 'Tríceps esquecido',
};

function buildVolumeInsight(muscleSeries: Record<string, number>): CoachInsight | null {
  // "0 séries há 2+ semanas seguidas": `computeWeeklyMuscleSeries` já soma as
  // últimas 4 semanas completas e divide por 4 — se a MÉDIA é 0 (ou o músculo
  // nem aparece no resultado, que só lista músculos com pelo menos uma série),
  // o total das 4 semanas é 0, o que só é possível se TODAS as 4 semanas
  // tiveram 0 séries (nenhuma pode ser negativa) — logo cobre com folga a
  // regra de "2+ semanas seguidas" sem precisar de uma consulta semana-a-semana
  // separada.
  for (const musculo of TRACKED_MUSCLES) {
    const value = muscleSeries[musculo] ?? 0;
    if (value === 0) {
      return {
        id: 'volume-musculo',
        tipo: 'atencao',
        titulo: MUSCLE_ESQUECIDO_TITLE[musculo] ?? `${musculo} esquecido`,
        mensagem: `Você não treinou ${musculo.toLowerCase()} nas últimas 2 semanas. Grupos musculares negligenciados perdem força e podem criar desequilíbrios.`,
        acao: `Inclua pelo menos 1 exercício de ${musculo.toLowerCase()} no próximo treino.`,
        icone: 'body-outline',
      };
    }
  }

  // Nenhum músculo zerado — verifica excesso (>20/sem), pegando o mais alto
  // (o "mais urgente" entre os candidatos, como pedido).
  let highest: { musculo: string; value: number } | null = null;
  for (const musculo of TRACKED_MUSCLES) {
    const value = muscleSeries[musculo] ?? 0;
    if (value > REFERENCE_MAX && (!highest || value > highest.value)) {
      highest = { musculo, value };
    }
  }
  if (highest) {
    return {
      id: 'volume-musculo',
      tipo: 'atencao',
      titulo: `Volume alto em ${highest.musculo.toLowerCase()}`,
      mensagem: `Você está fazendo ${highest.value.toFixed(1)} séries de ${highest.musculo.toLowerCase()} por semana — acima do que a maioria precisa para crescer (${REFERENCE_MIN}-${REFERENCE_MAX}). Mais não é sempre melhor; recuperação também conta.`,
      icone: 'analytics-outline',
    };
  }

  // 10-20 pra todo mundo, ou nada a reportar (sem dado suficiente) — nenhum
  // insight, exatamente como pedido ("está bem, não perturbe").
  return null;
}

// ---------------------------------------------------------------------------
// REGRA 3 — equilíbrio empurrar/puxar (reusa computeWeeklyPushPull)
// ---------------------------------------------------------------------------

const PUSH_PULL_IMBALANCE_RATIO = 1.5;

function buildPushPullInsight(empurrarPorSemana: number, puxarPorSemana: number): CoachInsight | null {
  if (empurrarPorSemana <= puxarPorSemana * PUSH_PULL_IMBALANCE_RATIO) return null;
  return {
    id: 'push-pull',
    tipo: 'atencao',
    titulo: 'Desequilíbrio entre empurrar e puxar',
    mensagem: `Você empurra ${empurrarPorSemana.toFixed(1)} séries e puxa ${puxarPorSemana.toFixed(1)} por semana. Esse desequilíbrio sobrecarrega os ombros com o tempo.`,
    acao: 'Adicione uma remada ou puxada na próxima semana.',
    icone: 'swap-horizontal-outline',
  };
}

// ---------------------------------------------------------------------------
// REGRA 4 — estagnação por CONTAGEM DE SESSÕES (não por dias corridos)
// ---------------------------------------------------------------------------

// Mesmos filtros/junções de `computeStagnation` (stagnation-section.tsx) —
// concluída, sem peso corporal, sem aquecimento, fora-da-academia excluída —
// mas com um critério DIFERENTE de propósito: aqui conta SESSÕES seguidas na
// mesma carga (o que o pedido explicitamente descreve: "últimas 4+ sessões"),
// não dias corridos desde a última alta (o critério de computeStagnation, que
// só dispara depois de 28 dias). Os dois sinais respondem perguntas
// diferentes — por isso este não reusa `computeStagnation` diretamente
// (reusaria um resultado que mede a coisa errada), mas reusa a MESMA forma de
// consulta pra não inventar um critério de filtro novo.
const MIN_STAGNANT_SESSIONS = 4;

type StagnationCandidate = { exerciseId: number; nome: string; equipamento: string; carga: number; sessoes: number };

async function findMostStagnantExercise(): Promise<StagnationCandidate | null> {
  const rows = await db
    .select({
      exerciseId: setLogs.exerciseId,
      nome: exercises.nome,
      equipamento: exercises.equipamento,
      data: sessions.data,
      maxCarga: sql<number>`max(${setLogs.carga})`,
    })
    .from(setLogs)
    .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
    .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
    .where(
      and(
        eq(sessions.concluida, true),
        eq(setLogs.pesoCorporal, false),
        eq(setLogs.aquecimento, false),
        eq(sessions.foraDaAcademia, false)
      )
    )
    .groupBy(setLogs.exerciseId, sessions.data);

  const byExercise = new Map<
    number,
    { nome: string; equipamento: string; points: { data: string; maxCarga: number }[] }
  >();
  for (const row of rows) {
    if (row.maxCarga == null) continue;
    const entry = byExercise.get(row.exerciseId) ?? { nome: row.nome, equipamento: row.equipamento, points: [] };
    entry.points.push({ data: row.data, maxCarga: row.maxCarga });
    byExercise.set(row.exerciseId, entry);
  }

  let best: StagnationCandidate | null = null;
  for (const [exerciseId, entry] of byExercise) {
    const points = [...entry.points].sort((a, b) => a.data.localeCompare(b.data));
    if (points.length < MIN_STAGNANT_SESSIONS) continue;

    // Anda de trás pra frente contando quantas sessões seguidas (a partir da
    // mais recente) mantiveram a MESMA carga máxima — pra no primeiro ponto
    // que quebrar a sequência (carga diferente).
    const lastLoad = points[points.length - 1].maxCarga;
    let sessoesNaMesmaCarga = 0;
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].maxCarga !== lastLoad) break;
      sessoesNaMesmaCarga++;
    }
    if (sessoesNaMesmaCarga < MIN_STAGNANT_SESSIONS) continue;
    if (!best || sessoesNaMesmaCarga > best.sessoes) {
      best = { exerciseId, nome: entry.nome, equipamento: entry.equipamento, carga: lastLoad, sessoes: sessoesNaMesmaCarga };
    }
  }
  return best;
}

function buildStagnationInsight(candidate: StagnationCandidate): CoachInsight {
  // `getLoadIncrement` (mesma função de suggest-load.ts, usada no fluxo de
  // registro de série) — se o equipamento não tem incremento conhecido
  // (ex: peso corporal, elástico), cai só na sugestão de reps, sem inventar
  // um número de carga.
  const equipamentoList = parseMusclesJson(candidate.equipamento);
  const increment = getLoadIncrement(equipamentoList);
  const acao =
    increment != null
      ? `Tente ${Math.round((candidate.carga + increment) * 100) / 100}kg, ou faça 1 repetição a mais em cada série.`
      : 'Faça 1 repetição a mais em cada série da próxima vez.';

  return {
    id: 'estagnacao',
    tipo: 'sugestao',
    titulo: `Estagnação em ${candidate.nome}`,
    mensagem: `Você está há ${candidate.sessoes} treinos com o mesmo peso em ${candidate.nome} (${candidate.carga}kg). O corpo já se adaptou a esse estímulo.`,
    acao,
    icone: 'trending-up-outline',
  };
}

// ---------------------------------------------------------------------------
// REGRA 5 — aderência (reusa computeAdherence)
// ---------------------------------------------------------------------------

function buildAdherenceInsight(adherence: NonNullable<Awaited<ReturnType<typeof computeAdherence>>>): CoachInsight | null {
  const percent = Math.round((adherence.completedInWindow / adherence.expectedInWindow) * 100);

  if (percent < 60) {
    return {
      id: 'aderencia',
      tipo: 'atencao',
      // `computeAdherence` mede uma janela deslizante de até
      // ADHERENCE_WEEKS_WINDOW semanas (não necessariamente "este mês") — a
      // mensagem cita o número real de semanas da janela em vez do "esse mês"
      // do pedido original, pra não afirmar um período que a consulta não mede.
      mensagem: `Você treinou ${percent}% do planejado nas últimas ${adherence.numWeeks} ${adherence.numWeeks === 1 ? 'semana' : 'semanas'}. Isso está abaixo do que seu plano prevê.`,
      acao: 'Se o plano está difícil de cumprir, o Assistente pode ajustar a frequência.',
      titulo: 'Aderência abaixo do plano',
      icone: 'calendar-outline',
    };
  }

  // >85% pedido "por 3+ semanas seguidas" — `computeAdherence` não guarda uma
  // série semana-a-semana (é um agregado da janela inteira), então usamos o
  // próprio `numWeeks` da janela agregada como a contagem de semanas: um
  // agregado >85% sustentado por 3+ semanas é o sinal mais próximo disso que
  // dá pra obter sem duplicar a consulta como uma pipeline semanal nova.
  if (percent > 85 && adherence.numWeeks >= 3) {
    return {
      id: 'aderencia',
      tipo: 'positivo',
      titulo: 'Consistência sólida',
      mensagem: `${adherence.numWeeks} semanas seguindo o plano com ${percent}% de aderência. Consistência é o que separa resultado de tentativa.`,
      icone: 'trophy-outline',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// REGRA 6 — streak (reusa computeWeekStreak)
// ---------------------------------------------------------------------------

function buildStreakInsight(streak: number): CoachInsight | null {
  if (streak < 4) return null;
  return {
    id: 'streak',
    tipo: 'positivo',
    titulo: 'Sequência consistente',
    mensagem: `${streak} semanas treinando em sequência. Você está construindo um hábito sólido.`,
    icone: 'flame-outline',
  };
}

// ---------------------------------------------------------------------------
// Montagem do relatório
// ---------------------------------------------------------------------------

/**
 * Lê as análises que já existem no app (nenhuma refeita aqui) e sintetiza um
 * relatório de coach em linguagem natural. Função pura de leitura — não
 * grava nada.
 */
export async function generateCoachReport(userName: string | null): Promise<CoachReport> {
  const todayIso = getTodayDateString();
  const weekStartIso = getWeekStartIso(todayIso);

  const concludedSessionRows = await db
    .select({ id: sessions.id, data: sessions.data })
    .from(sessions)
    .where(eq(sessions.concluida, true));
  const concludedDates = concludedSessionRows.map((row) => row.data);

  const trainedDaysThisWeek = computeTrainedDaysInWeek(concludedDates, weekStartIso);
  const treinosEstaSemana = trainedDaysThisWeek.filter(Boolean).length;
  const streak = computeWeekStreak(concludedDates);

  const sessionIdsThisWeek = concludedSessionRows.filter((row) => row.data >= weekStartIso).map((row) => row.id);

  // Janela de aderência idêntica à usada em AdherenceSection (mesmo cálculo,
  // mesma constante — ver adherence-section.tsx).
  const now = new Date();
  const todayIsoUtc = now.toISOString().slice(0, 10);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - ADHERENCE_WEEKS_WINDOW * 7);
  const cutoffIsoUtc = cutoffDate.toISOString().slice(0, 10);

  const [muscleSeries, pushPull, adherence, stagnationCandidate, bateuPrEstaSemana] = await Promise.all([
    computeWeeklyMuscleSeries(),
    computeWeeklyPushPull(),
    computeAdherence(cutoffIsoUtc, todayIsoUtc),
    findMostStagnantExercise(),
    hasAnyPrThisWeek(sessionIdsThisWeek),
  ]);

  const candidates: CoachInsight[] = [];

  const volumeInsight = buildVolumeInsight(muscleSeries);
  if (volumeInsight) candidates.push(volumeInsight);

  const pushPullInsight = buildPushPullInsight(pushPull.empurrarPorSemana, pushPull.puxarPorSemana);
  if (pushPullInsight) candidates.push(pushPullInsight);

  if (stagnationCandidate) candidates.push(buildStagnationInsight(stagnationCandidate));

  if (adherence) {
    const adherenceInsight = buildAdherenceInsight(adherence);
    if (adherenceInsight) candidates.push(adherenceInsight);
  }

  const streakInsight = buildStreakInsight(streak);
  if (streakInsight) candidates.push(streakInsight);

  // Sort estável: preserva a ordem de geração (regra 2→3→4→5→6) dentro de
  // cada tipo, só reordena ENTRE tipos.
  const sorted = [...candidates].sort((a, b) => TIPO_PRIORITY[b.tipo] - TIPO_PRIORITY[a.tipo]);
  const insights = sorted.slice(0, MAX_INSIGHTS);

  return {
    saudacao: buildSaudacao(treinosEstaSemana, userName, bateuPrEstaSemana),
    insights,
    geradoEm: Date.now(),
  };
}
