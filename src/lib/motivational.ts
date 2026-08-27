import frasesData from '@/assets/data/frases_motivacionais.json';

type FrasesMotivacionais = { versao: string; total: number; frases: string[] };

// Mesmo motivo do `as unknown as X` em lib/atlas.ts: o JSON é conteúdo
// curado externamente, o import padrão já basta pra tipar aqui (sem índice
// dinâmico por string precisando de `Record`), mas o `frases: string[]`
// explícito documenta o formato esperado.
const frases = frasesData as FrasesMotivacionais;

/**
 * Frase motivacional do dia — determinística por dia-do-ano (mesmo texto o
 * dia inteiro, muda à meia-noite local), não aleatória a cada abertura do
 * app. `dayOfYear % frases.length` cicla o roteiro inteiro (60 frases) a
 * cada ~2 meses; `new Date(ano, 0, 0)` é 31/dez do ano anterior (dia 0 de
 * janeiro), então a diferença já nasce em 1 pro dia 1º de janeiro.
 */
export function getFraseDoDia(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
  return frases.frases[dayOfYear % frases.frases.length];
}
