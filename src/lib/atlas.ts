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

export type ExercicioCatalogoBasico = { id: number; wgerId: number; nome: string };

// Mais alta que PONTUACAO_MINIMA (perguntas em linguagem natural, mais
// abaixo) — aqui o objetivo é achar o MESMO exercício, não uma resposta
// relacionada; um match fraco erra o exercício errado, não só dá uma
// resposta genérica. Verificado contra os 42 exercícios reais de
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
 * `pontuarMatch`, usado em `buscarResposta`). `null` se nada bater com
 * confiança suficiente — quem chama decide (pular o exercício, avisar).
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
    // 'como'/'fazer' entram aqui (além de 'execucao'/'executar'/'tecnica')
    // porque é assim que alguém pergunta técnica na prática ("como fazer
    // supino inclinado com halteres") — sem isso, essa pergunta muito comum
    // não batia com nenhum gatilho, só com `perguntas_comuns` (nem sempre
    // cobre "como fazer" literalmente). Cai pra `resumo_rapido` se o
    // exercício não tiver `dicas_execucao` (nunca retorna string vazia).
    {
      palavras: ['execucao', 'executar', 'tecnica', 'como', 'fazer'],
      resposta: info.dicas_execucao?.length ? info.dicas_execucao.join('\n\n') : info.resumo_rapido,
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

function candidatosDoExercicio(perguntaNormalizada: string, info: AtlasExercicioConhecimento): Candidato[] {
  const candidatos: Candidato[] = [];
  for (const item of info.perguntas_comuns ?? []) {
    const score = pontuarMatch(perguntaNormalizada, normalizar(item.pergunta));
    if (score > 0) candidatos.push({ resposta: item.resposta, score });
  }
  candidatos.push(...candidatosPorGatilho(perguntaNormalizada, info));
  return candidatos;
}

// Comprimento mínimo pro nome de um exercício contar como match dentro de
// uma pergunta livre — nomes muito curtos ("Remo", "Voador") poderiam bater
// por acidente dentro de frases sem relação nenhuma com o exercício.
const NOME_EXERCICIO_MIN_LENGTH = 6;

/**
 * Acha um exercício PELO NOME (não pelo wgerId) dentro da própria pergunta —
 * usado quando não há contexto de tela (pergunta livre no chat geral, sem
 * `wgerId`) mas o texto ainda assim menciona um exercício específico por
 * nome (ex: "como fazer supino inclinado com halteres"). Sem isso, qualquer
 * dúvida sobre um exercício feita fora da tela dele só batia contra
 * `categorias_gerais` (frequência, nutrição, volume...) — que não tem nada
 * sobre técnica de exercícios individuais — e caía sempre no fallback,
 * mesmo quando o roteiro tinha a resposta certa esperando em
 * `conhecimento_por_exercicio`.
 */
function encontrarExercicioPorNome(perguntaNormalizada: string): AtlasExercicioConhecimento | null {
  for (const info of Object.values(conhecimentoPorExercicio)) {
    const nomeNormalizado = normalizar(info.nome);
    if (nomeNormalizado.length >= NOME_EXERCICIO_MIN_LENGTH && perguntaNormalizada.includes(nomeNormalizado)) {
      return info;
    }
  }
  return null;
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
  'Não encontrei uma resposta específica para isso. Tente perguntar de outra forma — por exemplo: ' +
  '"como fazer agachamento", "quantas séries por semana", "o que fazer se meu joelho dói".';

/**
 * Busca offline (sem rede, sem IA de verdade — casamento de palavras-chave
 * sobre o roteiro curado) por uma resposta pra `pergunta`. Contexto de
 * exercício vem do `wgerId` explícito (pergunta feita a partir da tela de um
 * exercício) OU, na falta dele, de um nome de exercício reconhecido DENTRO
 * da própria pergunta (`encontrarExercicioPorNome`) — sem essa segunda via,
 * uma pergunta livre no chat geral sobre um exercício específico (ex: "como
 * fazer supino inclinado com halteres", sem vir da tela desse exercício)
 * nunca chegava a consultar `conhecimento_por_exercicio`, só
 * `categorias_gerais` (que não cobre técnica de exercícios individuais) —
 * caindo sempre no fallback mesmo quando o roteiro tinha a resposta certa.
 * Com contexto resolvido (de qualquer uma das 2 vias), prioriza o
 * conhecimento daquele exercício, mas o melhor candidato entre os dois
 * grupos vence, não uma prioridade rígida (uma pergunta genérica de
 * nutrição feita na tela de um exercício ainda deve achar a resposta certa
 * em categorias_gerais, não forçar algo do exercício).
 */
export function buscarResposta(pergunta: string, wgerId?: number): string {
  const perguntaNormalizada = normalizar(pergunta);
  const infoExercicio =
    (wgerId != null ? getExercicioInfo(wgerId) : null) ?? encontrarExercicioPorNome(perguntaNormalizada);

  const candidatos: Candidato[] = [
    ...(infoExercicio ? candidatosDoExercicio(perguntaNormalizada, infoExercicio) : []),
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
