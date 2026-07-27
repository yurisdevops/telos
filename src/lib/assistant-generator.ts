import type { Exercise } from '@/db/schema';
import { TEMPLATES } from '@/db/templates';
import type { AssistantExperience, AssistantGoal, AssistantProfile } from '@/lib/assistant-profile';
import { classifyMovementPattern } from '@/lib/movement-pattern';

export type GeneratedExercise = {
  wgerId: number;
  nome: string;
  seriesAlvo: number;
  /** Faixa de repetições (ex: "8-12") — o schema atual guarda um número
   * único por exercício; a etapa que conectar isso ao banco precisa decidir
   * como reduzir a faixa a um valor (ex: o limite inferior, ou estender o
   * schema pra aceitar faixa). Não resolvido aqui de propósito. */
  repsAlvo: string;
  cargaAlvo: null;
};

export type GeneratedDay = {
  label: string;
  exercises: GeneratedExercise[];
};

export type ExerciseSwap = {
  dia: string;
  motivo: 'nivel' | 'altura';
  original: string;
  substituto: string;
};

export type GeneratedPlan = {
  nomeSugerido: string;
  dias: GeneratedDay[];
  /** Avisos pra mostrar na interface (ex: teto de frequência pra iniciante,
   * exercício removido por falta de substituto de nível). */
  avisos: string[];
  trocas: ExerciseSwap[];
};

const GOAL_LABEL: Record<AssistantGoal, string> = {
  hipertrofia: 'Hipertrofia',
  emagrecimento: 'Emagrecimento',
  forca: 'Força',
  condicionamento: 'Condicionamento',
};

// Altura a partir da qual preferimos variações mais amigáveis a membros
// longos (item 4 do pedido) — 190cm como corte simples e determinístico.
const ALTURA_LONGA_CM = 190;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** O catálogo guarda nivel com acento ("avançado", "intermediário") — o
 * perfil do assistente usa códigos limpos. Ponte entre os dois; nivel
 * desconhecido/não classificado vira `null` (tratado como não permitido
 * pra iniciante/intermediário, permitido pra avançado). */
function normalizeNivel(nivel: string | null): AssistantExperience | null {
  switch (nivel) {
    case 'iniciante':
      return 'iniciante';
    case 'intermediário':
      return 'intermediario';
    case 'avançado':
      return 'avancado';
    default:
      return null;
  }
}

function allowedLevels(experiencia: AssistantExperience): Set<AssistantExperience> {
  if (experiencia === 'iniciante') return new Set(['iniciante']);
  if (experiencia === 'intermediario') return new Set(['iniciante', 'intermediario']);
  return new Set(['iniciante', 'intermediario', 'avancado']);
}

type KeyCompoundRule = {
  categoria: string;
  matches: (nomeNormalizado: string) => boolean;
};

/**
 * Compostos fundamentais liberados pro iniciante mesmo quando classificados
 * "intermediário" no catálogo. Sem essa exceção, NENHUM composto livre
 * apareceria pra quem está começando — a classificação de nível (Onda de
 * catálogo anterior) marca todo composto livre como "intermediário" por
 * definição, então "iniciante só aceita nível iniciante" colapsava o Full
 * Body inteiro em máquinas/isoladores, sem nenhuma âncora.
 *
 * Nunca libera nível "avançado" (checado à parte, em `isKeyCompoundForIniciante`),
 * nem terra convencional, nem levantamento olímpico, nem variação técnica
 * (agachamento frontal, búlgaro, afundo, sumô) — só o padrão básico com carga
 * controlável, exatamente os 5 pedidos: agachamento (barra/Smith), supino
 * reto, remada curvada/apoio no peito, desenvolvimento de ombro, puxada alta.
 */
const INICIANTE_KEY_COMPOUND_RULES: KeyCompoundRule[] = [
  {
    categoria: 'Pernas',
    matches: (n) =>
      n.includes('agachamento') &&
      (n.includes('barra') || n.includes('smith') || n.includes('livre')) &&
      !n.includes('frontal') &&
      !n.includes('bulgaro') &&
      !n.includes('afundo') &&
      !n.includes('sumo'),
  },
  {
    categoria: 'Peito',
    matches: (n) => n.includes('supino') && n.includes('reto'),
  },
  {
    categoria: 'Costas',
    matches: (n) =>
      n.includes('remada') &&
      (n.includes('curvada') || n.includes('cavalinho') || (n.includes('apoio') && n.includes('peito'))),
  },
  {
    categoria: 'Ombros',
    matches: (n) => n.includes('desenvolvimento'),
  },
  {
    categoria: 'Costas',
    matches: (n) => n.includes('puxada alta') || n.includes('puxada frontal') || n.includes('pulldown'),
  },
];

function isKeyCompoundForIniciante(exercise: Exercise): boolean {
  const nome = normalize(exercise.nome);
  return INICIANTE_KEY_COMPOUND_RULES.some((rule) => rule.categoria === exercise.categoria && rule.matches(nome));
}

function parseMuscles(json: string): string[] {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

/** 3 séries pro iniciante, 4 pro avançado; intermediário fica no meio (a
 * faixa "3-4" pedida) diferenciando composto (4) de acessório (3) — mesmo
 * corte de composto/isolado já usado pro volume de reps abaixo. */
function seriesForExperience(experiencia: AssistantExperience, isCompound: boolean): number {
  if (experiencia === 'iniciante') return 3;
  if (experiencia === 'avancado') return 4;
  return isCompound ? 4 : 3;
}

function repsForGoal(objetivo: AssistantGoal, isCompound: boolean): string {
  switch (objetivo) {
    case 'hipertrofia':
      return isCompound ? '6-10' : '8-12';
    case 'forca':
      return isCompound ? '4-6' : '8-12';
    case 'emagrecimento':
      return '10-15';
    case 'condicionamento':
      return '10-15';
    default:
      return '10-15';
  }
}

/**
 * Se o template pedir mais dias do que o recomendável pro nível do usuário,
 * usa um teto — nunca gera 5-6 dias pra quem está começando. Devolve a
 * frequência efetiva e registra o motivo em `avisos` quando o teto é aplicado.
 */
function effectiveFrequency(profile: AssistantProfile, avisos: string[]): number {
  if (profile.experiencia === 'iniciante' && profile.frequencia >= 5) {
    const cap = 4;
    avisos.push(
      `Como você está começando, sugerimos ${cap} dias em vez de ${profile.frequencia} por semana — dá mais tempo de recuperação entre os treinos.`
    );
    return cap;
  }
  return profile.frequencia;
}

type BaseDayDef = { label: string; exercises: { wgerId: number }[] };

// wgerId das 3 âncoras compostas do template full_body (agachamento, supino
// reto, remada curvada) — ficam em todo dia de Full Body A/B(/C). O resto
// (desenvolvimento, rosca, tríceps, panturrilha) reveza entre os dias pra não
// duplicar a mesma sessão sob rótulos diferentes.
const FULL_BODY_ANCHOR_WGER_IDS = [1805, 73, 81];

function fullBodyPoolDays(count: 2 | 3): BaseDayDef[] {
  const pool = TEMPLATES.full_body.days[0].exercises;
  const anchors = pool.filter((e) => FULL_BODY_ANCHOR_WGER_IDS.includes(e.wgerId));
  const accessories = pool.filter((e) => !FULL_BODY_ANCHOR_WGER_IDS.includes(e.wgerId));

  const labels = count === 2 ? ['Full Body A', 'Full Body B'] : ['Full Body A', 'Full Body B', 'Full Body C'];
  return labels.map((label, dayIndex) => ({
    label,
    exercises: [...anchors, ...accessories.filter((_, accIndex) => accIndex % count === dayIndex)],
  }));
}

/**
 * Escolha do template base por frequência (item 1 do pedido):
 * - 2 → Full Body A/B (derivado do template `full_body`)
 * - 3 → Full Body A/B/C (idem)
 * - 4 → Upper/Lower repetido 2x (template `upper_lower`)
 * - 5 → PPL (3 dias) + Upper/Lower (2 dias) — `ppl` + `upper_lower`
 * - 6 → PPL repetido 2x (template `ppl`)
 * Upper/Lower e PPL repetidos usam os MESMOS exercícios nas duas ocorrências
 * de propósito — treinar o mesmo padrão 2x/semana é o objetivo desses
 * splits, não uma repetição indesejada (diferente do Full Body, onde A/B/C
 * precisam variar pra não serem só o mesmo dia com nome trocado).
 */
function baseDaysForFrequency(frequenciaEfetiva: number): BaseDayDef[] {
  switch (frequenciaEfetiva) {
    case 2:
      return fullBodyPoolDays(2);
    case 3:
      return fullBodyPoolDays(3);
    case 4:
      return [
        { label: 'Upper A', exercises: TEMPLATES.upper_lower.days[0].exercises },
        { label: 'Lower A', exercises: TEMPLATES.upper_lower.days[1].exercises },
        { label: 'Upper B', exercises: TEMPLATES.upper_lower.days[0].exercises },
        { label: 'Lower B', exercises: TEMPLATES.upper_lower.days[1].exercises },
      ];
    case 5:
      return [
        { label: 'Push', exercises: TEMPLATES.ppl.days[0].exercises },
        { label: 'Pull', exercises: TEMPLATES.ppl.days[1].exercises },
        { label: 'Legs', exercises: TEMPLATES.ppl.days[2].exercises },
        { label: 'Upper', exercises: TEMPLATES.upper_lower.days[0].exercises },
        { label: 'Lower', exercises: TEMPLATES.upper_lower.days[1].exercises },
      ];
    case 6:
      return [
        { label: 'Push A', exercises: TEMPLATES.ppl.days[0].exercises },
        { label: 'Pull A', exercises: TEMPLATES.ppl.days[1].exercises },
        { label: 'Legs A', exercises: TEMPLATES.ppl.days[2].exercises },
        { label: 'Push B', exercises: TEMPLATES.ppl.days[0].exercises },
        { label: 'Pull B', exercises: TEMPLATES.ppl.days[1].exercises },
        { label: 'Legs B', exercises: TEMPLATES.ppl.days[2].exercises },
      ];
    default:
      // Não deveria ocorrer (frequência sempre 2-6), mas nunca quebra.
      return fullBodyPoolDays(3);
  }
}

/** Busca um substituto de mesma categoria + músculo em comum, dentro dos
 * níveis permitidos, excluindo o que já está no dia. Candidatos ordenados por
 * wgerId (base determinística, independente da ordem de `catalog`), mas o
 * ESCOLHIDO roda por `dayIndex % candidates.length` em vez de ser sempre o
 * primeiro — senão o mesmo original vira sempre o mesmo substituto em todo
 * dia do plano (Full Body A/B/C colapsando em quase o mesmo dia repetido).
 * Continua determinístico: mesmo perfil + catálogo produz sempre o mesmo
 * plano, só que agora varia ENTRE os dias quando há mais de um candidato. */
function findLevelSubstitute(
  original: Exercise,
  catalog: Exercise[],
  allowed: Set<AssistantExperience>,
  excludeWgerIds: Set<number>,
  dayIndex: number
): Exercise | null {
  const originalMuscles = parseMuscles(original.musculos);
  const candidates = catalog
    .filter((ex) => ex.categoria === original.categoria)
    .filter((ex) => !excludeWgerIds.has(ex.wgerId))
    .filter((ex) => {
      const nivel = normalizeNivel(ex.nivel);
      return nivel !== null && allowed.has(nivel);
    })
    .filter((ex) => parseMuscles(ex.musculos).some((m) => originalMuscles.includes(m)))
    .sort((a, b) => a.wgerId - b.wgerId);
  if (candidates.length === 0) return null;
  return candidates[dayIndex % candidates.length];
}

type HeightSwapRule = {
  categoria: string;
  matchesOriginal: (nomeNormalizado: string) => boolean;
  matchesReplacement: (nomeNormalizado: string) => boolean;
};

// Item 4 do pedido: 3 trocas específicas por grupo, só acionadas acima de
// ALTURA_LONGA_CM. Corte por palavra-chave no nome (mesma técnica já usada em
// movement-pattern.ts), restrito à mesma categoria do catálogo.
const HEIGHT_SWAP_RULES: HeightSwapRule[] = [
  {
    categoria: 'Pernas',
    matchesOriginal: (n) =>
      n.includes('agachamento') && !n.includes('hack') && !n.includes('frontal') && !n.includes('smith') && !n.includes('leg press'),
    matchesReplacement: (n) => n.includes('hack') || n.includes('leg press') || n.includes('agachamento frontal'),
  },
  {
    categoria: 'Peito',
    matchesOriginal: (n) => n.includes('supino') && n.includes('reto') && !n.includes('inclinado'),
    matchesReplacement: (n) => n.includes('supino inclinado') && n.includes('halter'),
  },
  {
    categoria: 'Costas',
    matchesOriginal: (n) => n.includes('remada curvada'),
    matchesReplacement: (n) => n.includes('cavalinho') || (n.includes('apoio') && n.includes('peito')) || n.includes('peito apoiado'),
  },
];

function findHeightSubstitute(
  rule: HeightSwapRule,
  catalog: Exercise[],
  allowed: Set<AssistantExperience>,
  excludeWgerIds: Set<number>
): Exercise | null {
  const candidates = catalog
    .filter((ex) => ex.categoria === rule.categoria)
    .filter((ex) => !excludeWgerIds.has(ex.wgerId))
    .filter((ex) => {
      const nivel = normalizeNivel(ex.nivel);
      return nivel !== null && allowed.has(nivel);
    })
    .filter((ex) => rule.matchesReplacement(normalize(ex.nome)))
    .sort((a, b) => a.wgerId - b.wgerId);
  return candidates[0] ?? null;
}

function buildDay(
  label: string,
  templateExercises: { wgerId: number }[],
  profile: AssistantProfile,
  catalogByWgerId: Map<number, Exercise>,
  catalog: Exercise[],
  allowed: Set<AssistantExperience>,
  avisos: string[],
  trocas: ExerciseSwap[],
  dayIndex: number
): GeneratedDay {
  const usedInDay = new Set<number>();
  const resultExercises: GeneratedExercise[] = [];

  for (const templateEx of templateExercises) {
    let exercise = catalogByWgerId.get(templateEx.wgerId);
    if (!exercise) {
      avisos.push(`Exercício do modelo não encontrado no catálogo (wgerId ${templateEx.wgerId}) — pulado em "${label}".`);
      continue;
    }
    usedInDay.add(exercise.wgerId);

    // 1) Filtro/substituição por nível — "avançado" não filtra nada (qualquer
    // nível é permitido), então nem entra nesse bloco.
    if (profile.experiencia !== 'avancado') {
      const nivelAtual = normalizeNivel(exercise.nivel);
      // Composto-chave liberado pro iniciante mesmo em nível "intermediário"
      // (nunca em "avançado") — só se aplica à experiência iniciante, então
      // não muda nada pro caminho de intermediário.
      const liberadoComoChave =
        profile.experiencia === 'iniciante' &&
        (nivelAtual === 'iniciante' || nivelAtual === 'intermediario') &&
        isKeyCompoundForIniciante(exercise);
      const nivelPermitido = liberadoComoChave || (nivelAtual !== null && allowed.has(nivelAtual));
      if (!nivelPermitido) {
        const substituto = findLevelSubstitute(exercise, catalog, allowed, usedInDay, dayIndex);
        if (substituto) {
          trocas.push({ dia: label, motivo: 'nivel', original: exercise.nome, substituto: substituto.nome });
          usedInDay.delete(exercise.wgerId);
          usedInDay.add(substituto.wgerId);
          exercise = substituto;
        } else if (profile.experiencia === 'iniciante') {
          // Regra é "nunca incluir avançado" pro iniciante — sem substituto
          // disponível, remove o exercício em vez de violar a regra.
          avisos.push(`Sem substituto de nível iniciante pra "${exercise.nome}" em "${label}" — removido do dia.`);
          usedInDay.delete(exercise.wgerId);
          continue;
        }
        // intermediário sem substituto: mantém o original mesmo fora do nível
        // ("evitar avançado salvo se não houver alternativa" — permissivo).
      }
    }

    // 2) Ajuste por altura, sobre o exercício já resolvido pelo passo 1.
    if (profile.alturaCm != null && profile.alturaCm >= ALTURA_LONGA_CM) {
      const nomeNormalizado = normalize(exercise.nome);
      const rule = HEIGHT_SWAP_RULES.find((r) => r.categoria === exercise!.categoria && r.matchesOriginal(nomeNormalizado));
      if (rule) {
        const substituto = findHeightSubstitute(rule, catalog, allowed, usedInDay);
        if (substituto) {
          trocas.push({ dia: label, motivo: 'altura', original: exercise.nome, substituto: substituto.nome });
          usedInDay.delete(exercise.wgerId);
          usedInDay.add(substituto.wgerId);
          exercise = substituto;
        }
        // Sem substituto preferido disponível: mantém o exercício original,
        // como pedido ("se não achar a variação preferida, mantenha").
      }
    }

    const pattern = classifyMovementPattern(exercise);
    const isCompound = pattern !== null && pattern !== 'isolado';

    resultExercises.push({
      wgerId: exercise.wgerId,
      nome: exercise.nome,
      seriesAlvo: seriesForExperience(profile.experiencia, isCompound),
      repsAlvo: repsForGoal(profile.objetivo, isCompound),
      cargaAlvo: null,
    });
  }

  return { label, exercises: resultExercises };
}

/**
 * Função pura e determinística: mesmo `profile` + `catalog` sempre produz o
 * mesmo `GeneratedPlan`. Não toca no banco — quem chama decide o que fazer
 * com o resultado (por ora, só inspeção).
 */
export function generateWorkout(profile: AssistantProfile, catalog: Exercise[]): GeneratedPlan {
  const avisos: string[] = [];
  const trocas: ExerciseSwap[] = [];

  const frequenciaEfetiva = effectiveFrequency(profile, avisos);
  const allowed = allowedLevels(profile.experiencia);
  const catalogByWgerId = new Map(catalog.map((ex) => [ex.wgerId, ex]));

  const baseDays = baseDaysForFrequency(frequenciaEfetiva);
  const dias = baseDays.map((day, dayIndex) =>
    buildDay(day.label, day.exercises, profile, catalogByWgerId, catalog, allowed, avisos, trocas, dayIndex)
  );

  return {
    nomeSugerido: `${GOAL_LABEL[profile.objetivo]} · ${frequenciaEfetiva}x por semana`,
    dias,
    avisos,
    trocas,
  };
}
