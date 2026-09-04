import frasesData from '@/assets/data/frases_motivacionais.json';
import { getTodayDateString } from '@/lib/date';
import { sha256Hex } from '@/lib/sha256';

type FrasesMotivacionais = { versao: string; total: number; frases: string[] };

// Mesmo motivo do `as unknown as X` em lib/atlas.ts: o JSON é conteúdo
// curado externamente, o import padrão já basta pra tipar aqui (sem índice
// dinâmico por string precisando de `Record`), mas o `frases: string[]`
// explícito documenta o formato esperado. `total`/`frases.length` nunca são
// assumidos fixos em lugar nenhum deste arquivo (nem em quem chama) — o
// roteiro pode crescer (60 → 120 → o que for) sem precisar tocar em código,
// só trocar o JSON.
const frases = frasesData as FrasesMotivacionais;

/**
 * Frase motivacional do dia — determinística por (semente do device, data
 * local), não mais um índice cru de dia-do-ano igual pra todo mundo. A
 * MESMA semente + MESMA data sempre produz a MESMA frase (estável o dia
 * inteiro, só muda à meia-noite LOCAL — `getTodayDateString` usa
 * `new Date()` do device, nunca UTC, então não há salto de frase em fuso
 * nenhum); sementes DIFERENTES (um device por usuário, ver
 * ensureFraseSeed em db/user-profile.ts) produzem ORDENS diferentes, então
 * dois devices veem frases diferentes no mesmo dia.
 *
 * `sha256Hex` (lib/sha256.ts, já usado pra hash de PIN) mistura
 * `${seed}:${dataIso}` bem o suficiente pra distribuir por qualquer
 * `frases.length` sem viés perceptível — só os primeiros 8 hex chars (32
 * bits) do hash entram no `% length`, o resto do hash é descartado (não
 * precisamos dos 256 bits inteiros só pra escolher 1 de ~120 itens).
 */
export function getFraseDoDia(seed: number, dataIso: string = getTodayDateString()): string {
  const hashHex = sha256Hex(`${seed}:${dataIso}`);
  const hashInt = parseInt(hashHex.slice(0, 8), 16);
  return frases.frases[hashInt % frases.frases.length];
}
