import roteiroDataRaw from '@/assets/data/roteiro_atlas.json';
import treinosDataRaw from '@/assets/data/treinos_rapidos.json';

// Os 2 JSONs (assets/data/roteiro_atlas.json, .../treinos_rapidos.json) são
// conteúdo curado externamente, não gerado por código deste repo — os tipos
// abaixo são a interpretação da estrutura REAL inspecionada nos arquivos
// (não a suposição inicial do pedido), com a maioria dos campos opcionais:
// só verifiquei 1 exercício de 872 em detalhe, então é mais seguro tratar
// campo ausente como `undefined` (e checar antes de usar) do que assumir
// presença garantida em todos os outros 871.
export type AtlasPerguntaComum = { pergunta: string; resposta: string };

export type AtlasExercicioConhecimento = {
  wgerId: number;
  nome: string;
  resumo_rapido?: string;
  como_sentir_musculo?: string;
  erros_comuns?: string[];
  dicas_execucao?: string[];
  se_doer?: string;
  alternativas_se_nao_conseguir?: string[];
  para_iniciantes?: string;
  para_avancados?: string;
  perguntas_comuns?: AtlasPerguntaComum[];
};

export type AtlasSubstituto = { wgerId: number; nome: string; porque: string; nivel: string };
type AtlasMapaSubstituicoesEntry = { descricao: string; substitutos: AtlasSubstituto[] };

export type AtlasTreinoExercicio = {
  nome: string;
  series: number;
  reps: string;
  descanso_s: number;
  dica?: string;
  superset_com?: string | null;
};
export type AtlasTreinoRapido = {
  id: string;
  nome: string;
  descricao?: string;
  duracao_min: number;
  nivel: string;
  objetivo?: string;
  dica_tempo?: string;
  exercicios: AtlasTreinoExercicio[];
};

// `as unknown as X`: os JSONs não têm índice genérico (TS infere um tipo com
// só as chaves literais que aparecem no arquivo), então indexar
// `conhecimento_por_exercicio[String(wgerId)]`/`mapa_substituicoes[musculo]`
// com uma `string` calculada em runtime não passaria no `tsc` sem isso —
// mesmo problema não existe em `treinos` (array), mas mantive o mesmo padrão
// nos 3 por uniformidade e clareza de intenção.
const conhecimentoPorExercicio = roteiroDataRaw.conhecimento_por_exercicio as unknown as Record<
  string,
  AtlasExercicioConhecimento
>;
const mapaSubstituicoes = roteiroDataRaw.mapa_substituicoes as unknown as Record<string, AtlasMapaSubstituicoesEntry>;
const treinosRapidos = treinosDataRaw.treinos as unknown as AtlasTreinoRapido[];

export type AtlasMessage = {
  id: string;
  role: 'atlas' | 'user';
  content: string;
};

/** minúsculas, sem acento, sem pontuação — base pra qualquer comparação de
 * texto do Atlas (pergunta do usuário vs. perguntas do roteiro). */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de acento (forma decomposta do NFD)
    .replace(/[^\w\s]/g, ' ') // pontuação -> espaço (não junta palavras vizinhas)
    .replace(/\s+/g, ' ')
    .trim();
}

// Palavras que carregam pouco ou nenhum significado discriminante numa
// pergunta de treino/exercício — sem filtrar isso, "qual", "como", "para"
// dominariam a contagem de palavras em comum entre praticamente QUALQUER par
// de perguntas, tornando o placar inútil pra distinguir um match bom de um
// ruim. Lista pequena e curada, não uma lib de stopwords genérica.
const PALAVRAS_IGNORADAS = new Set([
  'a', 'o', 'as', 'os', 'de', 'do', 'da', 'dos', 'das', 'que', 'com', 'para', 'pra', 'por',
  'um', 'uma', 'uns', 'umas', 'em', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'e', 'ou', 'se',
  'como', 'qual', 'quais', 'quando', 'onde', 'devo', 'deve', 'posso', 'pode', 'sao', 'ser',
  'meu', 'minha', 'meus', 'minhas', 'muito', 'mais', 'menos', 'bem', 'bom', 'boa', 'isso',
  'esse', 'essa', 'este', 'esta', 'tem', 'ter', 'vou', 'nao', 'sim', 'ha', 'eu', 'voce',
]);

function palavrasSignificativas(textoNormalizado: string): string[] {
  return textoNormalizado.split(' ').filter((palavra) => palavra.length >= 3 && !PALAVRAS_IGNORADAS.has(palavra));
}

/** Placar de o quanto `candidatoNormalizado` (uma pergunta/tag do roteiro)
 * combina com `perguntaNormalizada` (o que o usuário digitou) — substring
 * inteira bate forte (+5); cada palavra significativa do candidato que
 * aparece na pergunta soma +1. `0` = nenhuma relação encontrada. */
function pontuarMatch(perguntaNormalizada: string, candidatoNormalizado: string): number {
  if (!candidatoNormalizado) return 0;
  let score = 0;
  if (
    perguntaNormalizada.includes(candidatoNormalizado) ||
    candidatoNormalizado.includes(perguntaNormalizada)
  ) {
    score += 5;
  }
  for (const palavra of palavrasSignificativas(candidatoNormalizado)) {
    if (perguntaNormalizada.includes(palavra)) score += 1;
  }
  return score;
}

export type ExercicioCatalogoBasico = { id: number; wgerId: number; nome: string };

// Placar exigente de propósito — aqui o objetivo é achar o MESMO exercício,
// não uma resposta relacionada; um match fraco erra o exercício errado, não
// só dá uma resposta genérica. Verificado contra os 42 exercícios reais de
// treinos_rapidos.json: resolve 41 corretamente ("Terra romeno" ->
// "Levantamento terra romeno", "Hack squat" (nome em inglês, sem
// equivalente direto) fica de fora — cai no `null` e quem chama pula.
const PONTUACAO_MINIMA_NOME_EXERCICIO = 2;

/**
 * Resolve o NOME de um exercício (como aparece em treinos_rapidos.json — às
 * vezes abreviado, ex: "Terra romeno", "Cadeira flexora") pro item mais
 * provável de `catalogo` (o catálogo real do device, com `id`/`wgerId`
 * locais). 3 camadas, na ordem: (1) igual exato normalizado; (2) substring —
 * catálogo contém o nome curto OU o nome curto contém o do catálogo,
 * preferindo o candidato de tamanho mais próximo quando há mais de um; (3)
 * pontuação por palavras significativas em comum (mesmo motor de
 * `pontuarMatch`). `null` se nada bater com confiança suficiente — quem
 * chama decide (pular o exercício, avisar).
 */
export function resolverExercicioPorNome(
  nome: string,
  catalogo: ExercicioCatalogoBasico[]
): ExercicioCatalogoBasico | null {
  const nomeNormalizado = normalizar(nome);

  for (const item of catalogo) {
    if (normalizar(item.nome) === nomeNormalizado) return item;
  }

  let melhorSubstring: { item: ExercicioCatalogoBasico; normalizado: string } | null = null;
  for (const item of catalogo) {
    const itemNormalizado = normalizar(item.nome);
    if (itemNormalizado.includes(nomeNormalizado) || nomeNormalizado.includes(itemNormalizado)) {
      const diferenca = Math.abs(itemNormalizado.length - nomeNormalizado.length);
      if (!melhorSubstring || diferenca < Math.abs(melhorSubstring.normalizado.length - nomeNormalizado.length)) {
        melhorSubstring = { item, normalizado: itemNormalizado };
      }
    }
  }
  if (melhorSubstring) return melhorSubstring.item;

  let melhorPontuado: { item: ExercicioCatalogoBasico; score: number } | null = null;
  for (const item of catalogo) {
    const score = pontuarMatch(nomeNormalizado, normalizar(item.nome));
    if (score > 0 && (!melhorPontuado || score > melhorPontuado.score)) {
      melhorPontuado = { item, score };
    }
  }
  return melhorPontuado && melhorPontuado.score >= PONTUACAO_MINIMA_NOME_EXERCICIO ? melhorPontuado.item : null;
}

/** Conhecimento curado de um exercício específico (dicas, erros comuns,
 * perguntas frequentes) — `null` se o wgerId não tiver entrada no roteiro
 * (roteiro cobre 872 exercícios; o catálogo pode ter outros sem cobertura). */
export function getExercicioInfo(wgerId: number): AtlasExercicioConhecimento | null {
  return conhecimentoPorExercicio[String(wgerId)] ?? null;
}

/** Substitutos sugeridos pro grupo muscular (chave em português, ex: "Peito",
 * "Dorsais" — mesmo vocabulário já usado em VolumeAnalysisSection/MovementPatternSection).
 * `[]` se o músculo não tiver mapa (não é erro — nem todo músculo do catálogo
 * tem substituições curadas). */
export function getSubstitutos(musculo: string): AtlasSubstituto[] {
  return mapaSubstituicoes[musculo]?.substitutos ?? [];
}

/** Treinos prontos (curados, com exercícios/séries/reps/descanso já
 * definidos) pra quando o tempo é curto — ver treinos_rapidos.json. */
export function getTreinosRapidos(): AtlasTreinoRapido[] {
  return treinosRapidos;
}
