export type ChangelogEntry = {
  version: number;
  title: string;
  items: { titulo: string; descricao: string }[];
};

// Versão mais recente definida abaixo — o que o usuário já viu (persistido em
// user_profile.lastSeenChangelogVersion) é comparado contra o `version` de
// cada entrada, não contra essa constante diretamente (getUnseenChangelog).
export const CURRENT_CHANGELOG_VERSION = 4;

// Lista crescente de levas — nunca editar uma entrada já publicada (quem já
// viu não deve ver de novo com conteúdo diferente); só adicionar novas com
// `version` maior que a anterior.
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: 1,
    title: 'Novidades',
    items: [
      {
        titulo: 'Reabra um treino concluído',
        descricao:
          'Terminou o treino mas errou uma carga ou esqueceu uma série? Agora dá pra reabrir, corrigir e concluir de novo.',
      },
      {
        titulo: 'Exercícios de peso corporal',
        descricao: 'Barra fixa, paralela, flexão: registre a série sem precisar inventar um número de carga.',
      },
      {
        titulo: 'Dica do exercício durante o treino',
        descricao: 'A orientação técnica de cada exercício agora aparece na hora, sem sair pro catálogo.',
      },
      {
        titulo: 'Exercício concluído se recolhe',
        descricao: 'Quando você preenche todas as séries, o exercício minimiza e deixa a tela limpa pro próximo.',
      },
      {
        titulo: 'Nova aba Perfil',
        descricao: 'Sua foto, seus dados, seu histórico e o backup, tudo num lugar só.',
      },
      {
        titulo: 'Análise de volume por músculo',
        descricao:
          'Veja quantas séries por semana cada grupo muscular recebe, com avisos quando algo está desequilibrado.',
      },
      {
        titulo: 'Aviso de descanso mais visível',
        descricao: 'Quando o descanso acaba, a tela toda avisa — impossível não ver, mesmo de longe.',
      },
    ],
  },
  {
    version: 2,
    title: 'Novidades',
    items: [
      {
        titulo: 'Treinos prontos pra começar na hora',
        descricao:
          'Escolha um treino montado ("Quadríceps Monstro", "Peitoral & Tríceps" e mais) e comece a treinar num toque, sem configurar nada.',
      },
      {
        titulo: 'Assistente mais inteligente',
        descricao:
          'Agora o objetivo que você escolhe muda o treino de verdade: força, hipertrofia, emagrecimento e condicionamento geram séries, repetições e descanso diferentes.',
      },
      {
        titulo: 'Fim do descanso impossível de ignorar',
        descricao: 'Quando o descanso acaba, a tela toda avisa em destaque, visível mesmo de longe na academia.',
      },
      {
        titulo: 'Registro de série mais guiado',
        descricao:
          'Ao terminar uma série, o nível de esforço e o descanso ganham destaque, conduzindo você pelo treino.',
      },
    ],
  },
  {
    version: 3,
    title: 'Novidades',
    items: [
      {
        titulo: 'Compartilhe seu treino',
        descricao:
          'Ao concluir, gere um card com suas métricas, grupos treinados e recordes pra postar onde quiser.',
      },
      {
        titulo: 'Comemore seus recordes',
        descricao: 'Bateu um novo recorde? O app te avisa com destaque ao terminar o treino.',
      },
      {
        titulo: 'Treinos prontos',
        descricao: 'Escolha um treino montado e comece na hora, sem configurar nada.',
      },
      {
        titulo: 'Assistente mais inteligente',
        descricao: 'O objetivo escolhido agora muda o treino de verdade: séries, repetições e descanso.',
      },
      {
        titulo: 'Foto de perfil',
        descricao: 'Escolha da galeria ou tire na hora pela câmera.',
      },
      {
        titulo: 'Treino fora da sua academia',
        descricao:
          'Marque quando treinar em outro lugar, e as cargas diferentes não bagunçam seus recordes e sugestões.',
      },
      {
        titulo: 'Resetar histórico',
        descricao: 'Zere seus treinos com proteção por PIN, mantendo seus planos e perfil.',
      },
    ],
  },
  {
    version: 4,
    title: 'Novidades',
    items: [
      {
        titulo: 'Medidas corporais',
        descricao:
          'Acompanhe a evolução das suas medidas (ombros, peito, cintura, braços, pernas e mais) ao longo do tempo, no Perfil.',
      },
    ],
  },
];

/**
 * Entradas com `version` maior que `lastSeen`, ordenadas da mais antiga pra
 * mais nova (ordem de leitura natural quando várias levas se acumularam).
 * `lastSeen === null` (usuário existente de antes desse campo existir, ou
 * instalação em que a migração ainda não rodou) é tratado como `0` — ou
 * seja, vê tudo que já foi publicado até agora, uma vez.
 */
export function getUnseenChangelog(lastSeen: number | null): ChangelogEntry[] {
  const baseline = lastSeen ?? 0;
  return CHANGELOG_ENTRIES.filter((entry) => entry.version > baseline).sort((a, b) => a.version - b.version);
}
