import roteiroAtlas from '@/assets/data/roteiro_atlas.json';
import { getLastCelebrationMonth, setLastCelebrationMonth } from '@/db/user-profile';

/** "YYYY-MM" do mês atual — mesma chave usada em user_profile.last_celebration_month. */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * `true` quando o app ainda não mostrou a celebração NESTE mês (comparando
 * `currentMonthKey()` contra o que está salvo em user_profile). Cobre tanto
 * "nunca mostrou" (coluna `null`) quanto "mostrou num mês anterior, mudou de
 * mês desde então" — os dois casos viram `true` porque a chave salva é
 * diferente da atual.
 */
export async function shouldShowCelebration(): Promise<boolean> {
  const last = await getLastCelebrationMonth();
  return last !== currentMonthKey();
}

/** Marca a celebração como já mostrada NESTE mês — chamado tanto quando o
 * modal é exibido de verdade quanto quando é pulado por não haver nada pra
 * celebrar (mês anterior com 0 treinos), pra não checar de novo a cada
 * abertura do app dentro do mesmo mês. */
export async function markCelebrationShown(): Promise<void> {
  await setLastCelebrationMonth(currentMonthKey());
}

/** Só pra teste manual (Passo debug do pedido) — limpa o registro, fazendo
 * `shouldShowCelebration` voltar a `true` sem precisar esperar o mês virar.
 * Não é chamada em nenhum fluxo de produção; ver o botão de debug (só em
 * `__DEV__`) no dashboard. */
export async function clearCelebrationRecord(): Promise<void> {
  await setLastCelebrationMonth(null);
}

type ClassificacaoMensal = { dias_min: number; classificacao: string; adjetivo: string };

const CELEBRACAO_MENSAL = roteiroAtlas.regras_coach.celebracao_mensal as {
  mensagens: string[];
  classificacoes: ClassificacaoMensal[];
};

// Já vem ordenado do JSON (20, 15, 10, 5, 1), mas ordenar de novo aqui não
// custa nada e blinda contra o arquivo curado mudar de ordem no futuro —
// `resolveClassificacao` depende de "maior dias_min que `treinos` ainda
// alcança" vencer primeiro.
const CLASSIFICACOES_DESC = [...CELEBRACAO_MENSAL.classificacoes].sort((a, b) => b.dias_min - a.dias_min);

/** Classificação (roteiro_atlas.json regras_coach.celebracao_mensal) pro
 * número de dias treinados — `null` só quando `treinos` é menor que o menor
 * `dias_min` do roteiro (hoje, 1 — ou seja, só quando `treinos === 0`, caso
 * em que não há nada pra celebrar). */
export function resolveClassificacao(treinos: number): ClassificacaoMensal | null {
  return CLASSIFICACOES_DESC.find((c) => treinos >= c.dias_min) ?? null;
}

// Ícone por classificação — o pedido deu 3 mapeamentos explícitos (excelente
// → 🏆, bom → 🔥, razoável → 💪) pra 5 classificações reais do roteiro
// (excelente/ótimo/bom/razoável/modesto); estendi "ótimo" pro mesmo 🏆 de
// "excelente" (ainda nível troféu) e "modesto" pro mesmo 💪 de "razoável"
// (ainda tom de incentivo) — o par mais próximo em espírito de cada um.
const ICONE_POR_ADJETIVO: Record<string, string> = {
  excelente: '🏆',
  ótimo: '🏆',
  bom: '🔥',
  razoável: '💪',
  modesto: '💪',
};
const ICONE_PADRAO = '💪';

/** Ícone do modal de celebração pro número de dias treinados. */
export function getCelebrationIcon(treinos: number): string {
  const classificacao = resolveClassificacao(treinos);
  return classificacao ? (ICONE_POR_ADJETIVO[classificacao.adjetivo] ?? ICONE_PADRAO) : ICONE_PADRAO;
}

/** Mensagem final pro modal — usa o 1º template de `mensagens` ("Você
 * treinou {n} dias em {mes}. {classificacao}", exatamente o formato pedido)
 * com a classificação resolvida. Sem classificação (treinos === 0, não
 * deveria chegar a mostrar o modal nesse caso — ver index.tsx), cai num
 * texto neutro em vez de quebrar. */
export function buildCelebrationMessage(treinos: number, mesAnteriorNome: string): string {
  const classificacao = resolveClassificacao(treinos);
  const template = CELEBRACAO_MENSAL.mensagens[0];
  return template
    .replace('{n}', String(treinos))
    .replace('{mes}', mesAnteriorNome)
    .replace('{classificacao}', classificacao?.classificacao ?? 'Continue treinando!');
}
