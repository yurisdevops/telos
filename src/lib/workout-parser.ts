import { db } from '@/db';
import { exercises } from '@/db/schema';
import { resolverExercicioPorNome, type ExercicioCatalogoBasico } from '@/lib/atlas';

export type ParsedExercicio = {
  /** Nome exatamente como apareceu no texto colado (antes do padrão de
   * séries/reps) — sempre exibido na prévia, encontrado ou não. */
  nomeTexto: string;
  /** `wgerId` do exercício casado no catálogo (não `id` local) — é o que
   * `applyGeneratedPlan` (db/templates.ts) espera, mesmo formato usado pelo
   * assistente e por `resolverExerciciosDoTreino` (atlas-modal.tsx). `null`
   * se não achou nada com confiança suficiente. */
  wgerId: number | null;
  series: number;
  /** "10" ou "12-15" (faixa preservada pra exibição) — reduzida a um
   * inteiro só na hora de salvar, via `parseRepsRangeToInt`
   * (lib/assistant-generator.ts), mesmo tratamento do assistente. */
  reps: string;
  /** Só pra exibição na prévia — `workout_day_exercises` não tem coluna de
   * descanso por exercício (só existe um descanso GLOBAL sugerido no
   * gerador do assistente, nunca gravado por exercício), então isso nunca
   * chega no banco. `null` se não detectado. */
  descansoSegundos: number | null;
};

export type ParsedDia = {
  nome: string;
  exercicios: ParsedExercicio[];
};

export type ParsedWorkout = {
  nomeSugerido: string;
  dias: ParsedDia[];
  totalExercicios: number;
  totalEncontrados: number;
};

// "4x10", "4 x 10", "4×10", "3x12-15" (faixa opcional no grupo 3).
const PADRAO_X = /(\d+)\s*[x×X]\s*(\d+)(?:\s*-\s*(\d+))?/;
// "4 séries de 10", "3 séries 8-10 reps".
const PADRAO_SERIES_DE = /(\d+)\s*s[ée]ries?\s*(?:de\s*)?(\d+)(?:\s*-\s*(\d+))?/i;

// Descanso — só usado na prévia (ver `descansoSegundos` acima). Cobre as 2
// ordens possíveis do pedido: palavra-chave antes do número ("descanso
// 60s", "rest 90 segundos") e número antes da palavra-chave ("1 min
// intervalo").
const UNIDADE = '(min(?:utos?)?|s(?:eg(?:undos?)?)?)';
const PADRAO_DESCANSO_DEPOIS = new RegExp(`(?:descanso|intervalo|rest)\\D{0,6}(\\d+)\\s*${UNIDADE}?`, 'i');
const PADRAO_DESCANSO_ANTES = new RegExp(`(\\d+)\\s*${UNIDADE}\\D{0,10}(?:descanso|intervalo|rest)`, 'i');

// Linha de dia/divisão: curta e sem padrão de séries/reps — "Push A", "Dia
// 1", "PEITO E TRÍCEPS". 40 chars é generoso o bastante pra nomes de divisão
// reais sem confundir com uma frase de instrução qualquer.
const TAMANHO_MAX_LINHA_DIA = 40;

function converterParaSegundos(valor: number, unidade?: string): number {
  return unidade && unidade.toLowerCase().startsWith('min') ? valor * 60 : valor;
}

function extrairDescanso(texto: string): number | null {
  const depois = texto.match(PADRAO_DESCANSO_DEPOIS);
  if (depois) return converterParaSegundos(Number(depois[1]), depois[2]);
  const antes = texto.match(PADRAO_DESCANSO_ANTES);
  if (antes) return converterParaSegundos(Number(antes[1]), antes[2]);
  return null;
}

type MatchExercicio = { series: number; reps: string; nomeTexto: string; restoLinha: string };

/** Tenta os 2 padrões de séries/reps na linha, na ordem — "4x10" é bem mais
 * comum que "4 séries de 10", então tentado primeiro. O nome do exercício é
 * tudo ANTES do padrão casado, com separadores soltos no fim ("-", "–",
 * ":", "•") removidos (ex: "Supino reto - 4x10" → "Supino reto"). */
function tentarParsearExercicio(linha: string): MatchExercicio | null {
  const match = linha.match(PADRAO_X) ?? linha.match(PADRAO_SERIES_DE);
  if (!match || match.index === undefined) return null;

  const [full, seriesText, repsMin, repsMax] = match;
  const nomeTexto = linha
    .slice(0, match.index)
    .replace(/[-–—:•*]+\s*$/, '')
    .trim();
  if (!nomeTexto) return null; // linha só com números/"x", sem nome nenhum — não é um exercício de verdade

  return {
    series: Number(seriesText),
    reps: repsMax ? `${repsMin}-${repsMax}` : repsMin,
    nomeTexto,
    restoLinha: linha.slice(match.index + full.length),
  };
}

function pareceLinhaDeDia(linha: string): boolean {
  if (!linha || linha.length >= TAMANHO_MAX_LINHA_DIA) return false;
  return !PADRAO_X.test(linha) && !PADRAO_SERIES_DE.test(linha);
}

/**
 * Interpreta um treino em texto livre (colado de WhatsApp/PDF/etc.) — 3
 * passadas por linha: (1) casa padrão de séries/reps → linha de exercício,
 * associada ao dia corrente; (2) senão, linha curta sem números → linha de
 * dia, abre um novo grupo; (3) senão (linha de descanso isolada, instrução
 * solta, linha em branco) → ignorada.
 *
 * Casamento contra o catálogo reusa `resolverExercicioPorNome` (lib/atlas.ts
 * — já usada por atlas-modal.tsx pra resolver nomes de treinos rápidos
 * contra o catálogo real do device) em vez de uma busca SQL `LIKE` própria:
 * ela já implementa exatamente o pedido (normaliza minúsculas/sem acento/sem
 * pontuação, tenta do nome mais específico ao mais genérico) e evita um bug
 * real que uma busca `LIKE` teria — SQLite `LIKE` não ignora acento, então
 * comparar um termo já normalizado (sem acento) contra `exercises.nome`
 * (que AINDA tem acento no banco) erraria qualquer nome acentuado.
 *
 * Assíncrona só por consistência com o resto de `db/*.ts` (a query em si é
 * síncrona, mesmo padrão de `resolverExerciciosDoTreino` em atlas-modal.tsx).
 */
export async function parseWorkoutText(texto: string): Promise<ParsedWorkout> {
  const catalogo: ExercicioCatalogoBasico[] = db
    .select({ id: exercises.id, wgerId: exercises.wgerId, nome: exercises.nome })
    .from(exercises)
    .all();

  const linhas = texto.split('\n').map((linha) => linha.trim());
  const dias: ParsedDia[] = [];
  let diaAtual: ParsedDia | null = null;

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];
    if (!linha) continue;

    const matchExercicio = tentarParsearExercicio(linha);
    if (matchExercicio) {
      if (!diaAtual) {
        diaAtual = { nome: `Dia ${dias.length + 1}`, exercicios: [] };
        dias.push(diaAtual);
      }
      const descansoSegundos = extrairDescanso(matchExercicio.restoLinha) ?? extrairDescanso(linhas[i + 1] ?? '');
      const encontrado = resolverExercicioPorNome(matchExercicio.nomeTexto, catalogo);

      diaAtual.exercicios.push({
        nomeTexto: matchExercicio.nomeTexto,
        wgerId: encontrado?.wgerId ?? null,
        series: matchExercicio.series,
        reps: matchExercicio.reps,
        descansoSegundos,
      });
      continue;
    }

    if (pareceLinhaDeDia(linha)) {
      diaAtual = { nome: linha, exercicios: [] };
      dias.push(diaAtual);
    }
  }

  // Dia detectado sem nenhum exercício embaixo (ex: cabeçalho repetido, ou
  // última linha do texto) não vira grupo vazio na prévia/no plano salvo.
  const diasComExercicios = dias.filter((dia) => dia.exercicios.length > 0);
  const totalExercicios = diasComExercicios.reduce((soma, dia) => soma + dia.exercicios.length, 0);
  const totalEncontrados = diasComExercicios.reduce(
    (soma, dia) => soma + dia.exercicios.filter((ex) => ex.wgerId !== null).length,
    0
  );

  return {
    nomeSugerido: 'Treino do Professor',
    dias: diasComExercicios,
    totalExercicios,
    totalEncontrados,
  };
}
