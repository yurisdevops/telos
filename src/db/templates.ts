import { db } from '@/db';
import { exercises, workoutDayExercises, workoutDays } from '@/db/schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type TemplateKey = 'ppl' | 'upper_lower' | 'full_body' | 'abc';

type TemplateExercise = {
  wgerId: number;
  seriesAlvo: number;
  repsAlvo: number;
};

type TemplateDay = {
  label: string;
  exercises: TemplateExercise[];
};

type Template = {
  label: string;
  description: string;
  days: TemplateDay[];
};

/**
 * Modelos sugeridos — ponto de partida editável, não algo fixo. Exercícios
 * escolhidos por serem básicos e amplamente disponíveis (barra, halteres,
 * máquinas comuns), referenciados por `wgerId` real do catálogo atual (o
 * mesmo identificador estável usado no backup/restore e na migração de
 * catálogo — se um exercício não existir mais no dispositivo, `applyTemplate`
 * só pula aquele item, nunca aborta a criação do plano). Séries/reps são só
 * sugestão (3x10 padrão); carga fica sempre em branco — o usuário define.
 */
export const TEMPLATES: Record<TemplateKey, Template> = {
  ppl: {
    label: 'PPL (Push/Pull/Legs)',
    description: 'Push, Pull e Legs — 3 dias, cada grupo muscular treinado 1x por ciclo.',
    days: [
      {
        label: 'Push',
        exercises: [
          { wgerId: 73, seriesAlvo: 3, repsAlvo: 10 }, // Supino reto
          { wgerId: 567, seriesAlvo: 3, repsAlvo: 10 }, // Desenvolvimento com halteres
          { wgerId: 348, seriesAlvo: 3, repsAlvo: 12 }, // Elevação lateral
          { wgerId: 245, seriesAlvo: 3, repsAlvo: 12 }, // Tríceps testa com halteres
        ],
      },
      {
        label: 'Pull',
        exercises: [
          { wgerId: 355, seriesAlvo: 3, repsAlvo: 10 }, // Puxada Alta
          { wgerId: 81, seriesAlvo: 3, repsAlvo: 10 }, // Remada curvada com halteres
          { wgerId: 92, seriesAlvo: 3, repsAlvo: 12 }, // Rosca direta com halteres
          { wgerId: 1645, seriesAlvo: 3, repsAlvo: 12 }, // Encolhimento com halteres
        ],
      },
      {
        label: 'Legs',
        exercises: [
          { wgerId: 1805, seriesAlvo: 3, repsAlvo: 10 }, // Agachamento com barra
          { wgerId: 371, seriesAlvo: 3, repsAlvo: 12 }, // Leg press
          { wgerId: 369, seriesAlvo: 3, repsAlvo: 12 }, // Cadeira extensora
          { wgerId: 364, seriesAlvo: 3, repsAlvo: 12 }, // Mesa flexora
          { wgerId: 146, seriesAlvo: 3, repsAlvo: 15 }, // Panturrilha no leg press
        ],
      },
    ],
  },
  upper_lower: {
    label: 'Upper/Lower',
    description: 'Superior e inferior — 2 dias, bom para treinar cada grupo 2x por semana.',
    days: [
      {
        label: 'Upper',
        exercises: [
          { wgerId: 73, seriesAlvo: 3, repsAlvo: 10 }, // Supino reto
          { wgerId: 81, seriesAlvo: 3, repsAlvo: 10 }, // Remada curvada com halteres
          { wgerId: 567, seriesAlvo: 3, repsAlvo: 10 }, // Desenvolvimento com halteres
          { wgerId: 355, seriesAlvo: 3, repsAlvo: 10 }, // Puxada Alta
          { wgerId: 92, seriesAlvo: 3, repsAlvo: 12 }, // Rosca direta com halteres
          { wgerId: 245, seriesAlvo: 3, repsAlvo: 12 }, // Tríceps testa com halteres
        ],
      },
      {
        label: 'Lower',
        exercises: [
          { wgerId: 1805, seriesAlvo: 3, repsAlvo: 10 }, // Agachamento com barra
          { wgerId: 507, seriesAlvo: 3, repsAlvo: 10 }, // Levantamento terra romeno
          { wgerId: 371, seriesAlvo: 3, repsAlvo: 12 }, // Leg press
          { wgerId: 369, seriesAlvo: 3, repsAlvo: 12 }, // Cadeira extensora
          { wgerId: 364, seriesAlvo: 3, repsAlvo: 12 }, // Mesa flexora
          { wgerId: 146, seriesAlvo: 3, repsAlvo: 15 }, // Panturrilha no leg press
        ],
      },
    ],
  },
  full_body: {
    label: 'Full Body',
    description: 'Corpo inteiro num dia só — bom pra quem treina poucas vezes por semana.',
    days: [
      {
        label: 'Corpo Inteiro',
        exercises: [
          { wgerId: 1805, seriesAlvo: 3, repsAlvo: 10 }, // Agachamento com barra
          { wgerId: 73, seriesAlvo: 3, repsAlvo: 10 }, // Supino reto
          { wgerId: 81, seriesAlvo: 3, repsAlvo: 10 }, // Remada curvada com halteres
          { wgerId: 567, seriesAlvo: 3, repsAlvo: 10 }, // Desenvolvimento com halteres
          { wgerId: 92, seriesAlvo: 3, repsAlvo: 12 }, // Rosca direta com halteres
          { wgerId: 245, seriesAlvo: 3, repsAlvo: 12 }, // Tríceps testa com halteres
          { wgerId: 146, seriesAlvo: 3, repsAlvo: 15 }, // Panturrilha no leg press
        ],
      },
    ],
  },
  abc: {
    label: 'ABC',
    description: 'A (peito/tríceps), B (costas/bíceps), C (pernas/ombros) — 3 dias.',
    days: [
      {
        label: 'A · Peito e Tríceps',
        exercises: [
          { wgerId: 73, seriesAlvo: 3, repsAlvo: 10 }, // Supino reto
          { wgerId: 537, seriesAlvo: 3, repsAlvo: 10 }, // Supino inclinado com halteres
          { wgerId: 238, seriesAlvo: 3, repsAlvo: 12 }, // Crucifixo com halteres
          { wgerId: 245, seriesAlvo: 3, repsAlvo: 12 }, // Tríceps testa com halteres
          { wgerId: 549, seriesAlvo: 3, repsAlvo: 12 }, // Tríceps francês sentado
        ],
      },
      {
        label: 'B · Costas e Bíceps',
        exercises: [
          { wgerId: 355, seriesAlvo: 3, repsAlvo: 10 }, // Puxada Alta
          { wgerId: 81, seriesAlvo: 3, repsAlvo: 10 }, // Remada curvada com halteres
          { wgerId: 921, seriesAlvo: 3, repsAlvo: 10 }, // Remada baixa sentada na polia
          { wgerId: 92, seriesAlvo: 3, repsAlvo: 12 }, // Rosca direta com halteres
          { wgerId: 94, seriesAlvo: 3, repsAlvo: 12 }, // Rosca direta com barra W
        ],
      },
      {
        label: 'C · Pernas e Ombros',
        exercises: [
          { wgerId: 1805, seriesAlvo: 3, repsAlvo: 10 }, // Agachamento com barra
          { wgerId: 371, seriesAlvo: 3, repsAlvo: 12 }, // Leg press
          { wgerId: 369, seriesAlvo: 3, repsAlvo: 12 }, // Cadeira extensora
          { wgerId: 364, seriesAlvo: 3, repsAlvo: 12 }, // Mesa flexora
          { wgerId: 567, seriesAlvo: 3, repsAlvo: 10 }, // Desenvolvimento com halteres
          { wgerId: 348, seriesAlvo: 3, repsAlvo: 12 }, // Elevação lateral
        ],
      },
    ],
  },
};

export const TEMPLATE_ORDER: TemplateKey[] = ['ppl', 'upper_lower', 'full_body', 'abc'];

/** Aplica um template a um plano recém-criado: cria os dias e os exercícios
 * sugeridos, resolvendo por `wgerId` contra o catálogo atual do dispositivo.
 * Um exercício não encontrado (catálogo desatualizado/diferente) é só
 * pulado — nunca aborta a criação do plano. */
export function applyTemplate(tx: Tx, planId: number, templateKey: TemplateKey) {
  const template = TEMPLATES[templateKey];
  const wgerIdMap = new Map(
    tx
      .select({ id: exercises.id, wgerId: exercises.wgerId })
      .from(exercises)
      .all()
      .map((row) => [row.wgerId, row.id])
  );

  template.days.forEach((day, dayIndex) => {
    const createdDay = tx
      .insert(workoutDays)
      .values({ planId, label: day.label, ordem: dayIndex })
      .returning()
      .get();

    day.exercises.forEach((templateExercise, exerciseIndex) => {
      const exerciseId = wgerIdMap.get(templateExercise.wgerId);
      if (exerciseId === undefined) return;

      tx.insert(workoutDayExercises)
        .values({
          dayId: createdDay.id,
          exerciseId,
          seriesAlvo: templateExercise.seriesAlvo,
          repsAlvo: templateExercise.repsAlvo,
          cargaAlvo: null,
          ordem: exerciseIndex,
          supersetGroup: null,
        })
        .run();
    });
  });
}
