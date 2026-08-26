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

type AtlasCategoriaGeralPar = {
  perguntas: string[];
  resposta: string;
  dica_pratica?: string;
  tags?: string[];
};
type AtlasCategoriaGeral = { categoria: string; pares: AtlasCategoriaGeralPar[] };

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
// mesmo problema não existe em `categorias_gerais`/`treinos` (arrays), mas
// mantive o mesmo padrão nos 4 por uniformidade e clareza de intenção.
const conhecimentoPorExercicio = roteiroDataRaw.conhecimento_por_exercicio as unknown as Record<
  string,
  AtlasExercicioConhecimento
>;
const mapaSubstituicoes = roteiroDataRaw.mapa_substituicoes as unknown as Record<string, AtlasMapaSubstituicoesEntry>;
const categoriasGerais = roteiroDataRaw.categorias_gerais as unknown as AtlasCategoriaGeral[];
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

type Candidato = { resposta: string; score: number };

// Gatilhos por palavra-chave pros campos do exercício que NÃO são, em si,
// uma pergunta com resposta pronta (`como_sentir_musculo`, `erros_comuns`
// etc. são texto/lista solta) — cobre perguntas que não batem literalmente
// com nenhum item de `perguntas_comuns`, mas claramente pedem um desses
// campos (ex: "onde eu devo sentir isso?" não está em perguntas_comuns, mas
// "sentir" aponta direto pra `como_sentir_musculo`).
function candidatosPorGatilho(perguntaNormalizada: string, info: AtlasExercicioConhecimento): Candidato[] {
  const gatilhos: { palavras: string[]; resposta: string | undefined }[] = [
    { palavras: ['sentir', 'senti', 'ativar'], resposta: info.como_sentir_musculo },
    {
      palavras: ['erro', 'errado', 'cuidado', 'evitar'],
      resposta: info.erros_comuns?.length ? info.erros_comuns.join('\n\n') : undefined,
    },
    {
      palavras: ['execucao', 'executar', 'tecnica'],
      resposta: info.dicas_execucao?.length ? info.dicas_execucao.join('\n\n') : undefined,
    },
    { palavras: ['doer', 'dor', 'machucar', 'lesao'], resposta: info.se_doer },
    { palavras: ['iniciante', 'comecando', 'comecar'], resposta: info.para_iniciantes },
    { palavras: ['avancado', 'evoluir', 'progredir'], resposta: info.para_avancados },
    {
      palavras: ['alternativa', 'substituir', 'nao consigo'],
      resposta: info.alternativas_se_nao_conseguir?.length ? info.alternativas_se_nao_conseguir.join('\n\n') : undefined,
    },
  ];

  const candidatos: Candidato[] = [];
  for (const gatilho of gatilhos) {
    if (!gatilho.resposta) continue;
    if (gatilho.palavras.some((palavra) => perguntaNormalizada.includes(palavra))) {
      candidatos.push({ resposta: gatilho.resposta, score: 4 });
    }
  }
  return candidatos;
}

function candidatosDoExercicio(perguntaNormalizada: string, wgerId: number): Candidato[] {
  const info = getExercicioInfo(wgerId);
  if (!info) return [];

  const candidatos: Candidato[] = [];
  for (const item of info.perguntas_comuns ?? []) {
    const score = pontuarMatch(perguntaNormalizada, normalizar(item.pergunta));
    if (score > 0) candidatos.push({ resposta: item.resposta, score });
  }
  candidatos.push(...candidatosPorGatilho(perguntaNormalizada, info));
  return candidatos;
}

function candidatosGerais(perguntaNormalizada: string): Candidato[] {
  const candidatos: Candidato[] = [];
  for (const categoria of categoriasGerais) {
    for (const par of categoria.pares) {
      let score = 0;
      for (const pergunta of par.perguntas) {
        score = Math.max(score, pontuarMatch(perguntaNormalizada, normalizar(pergunta)));
      }
      for (const tag of par.tags ?? []) {
        if (perguntaNormalizada.includes(normalizar(tag))) score += 2;
      }
      if (score > 0) {
        const resposta = par.dica_pratica ? `${par.resposta}\n\n${par.dica_pratica}` : par.resposta;
        candidatos.push({ resposta, score });
      }
    }
  }
  return candidatos;
}

// Abaixo desse placar, o "melhor" candidato ainda é fraco demais pra confiar
// (ex: só 1 palavra genérica em comum) — melhor admitir que não achou do que
// devolver uma resposta que não tem nada a ver com a pergunta.
const PONTUACAO_MINIMA = 2;

const RESPOSTA_PADRAO =
  'Não encontrei uma resposta específica. Tente perguntar de outra forma, ou procure um profissional de educação física para orientação personalizada.';

/**
 * Busca offline (sem rede, sem IA de verdade — casamento de palavras-chave
 * sobre o roteiro curado) por uma resposta pra `pergunta`. Com `wgerId`,
 * prioriza o conhecimento específico daquele exercício (perguntas_comuns +
 * gatilhos por campo) antes de cair nas categorias gerais — mas o melhor
 * candidato entre os dois grupos vence, não uma prioridade rígida (uma
 * pergunta genérica de nutrição feita na tela de um exercício ainda deve
 * achar a resposta certa em categorias_gerais, não forçar algo do exercício).
 */
export function buscarResposta(pergunta: string, wgerId?: number): string {
  const perguntaNormalizada = normalizar(pergunta);
  const candidatos: Candidato[] = [
    ...(wgerId != null ? candidatosDoExercicio(perguntaNormalizada, wgerId) : []),
    ...candidatosGerais(perguntaNormalizada),
  ];

  const melhor = candidatos.reduce<Candidato | null>(
    (atual, candidato) => (!atual || candidato.score > atual.score ? candidato : atual),
    null
  );

  return melhor && melhor.score >= PONTUACAO_MINIMA ? melhor.resposta : RESPOSTA_PADRAO;
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
