export type HelpItem = {
  title: string;
  body: string;
  /** Comportamento que diverge do que o nome/senso comum sugeriria — descrito sem suavizar. */
  warning?: string;
};

export type HelpSection = {
  area: string;
  items: HelpItem[];
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    area: 'Catálogo',
    items: [
      {
        title: 'Busca e filtros',
        body: 'Digite pra buscar por nome (ignora acento). Os chips de categoria filtram por grupo muscular; logo abaixo, os chips de nível ("Iniciante"/"Intermediário"/"Avançado") filtram pela dificuldade do exercício. Os dois filtros podem ser combinados.',
        warning:
          'O nível é uma classificação aproximada (máquinas guiadas e isoladores = iniciante; livres compostos = intermediário; olímpicos e calistenia de força = avançado) — pode ter casos discutíveis em exercícios de nome ambíguo.',
      },
      {
        title: 'Favoritos (★)',
        body: 'Toque na estrela em qualquer card de exercício — no Catálogo, na seleção de exercício de um dia, no exercício avulso, ou na ficha do exercício. Favoritos vão sempre pro topo de qualquer lista, mesmo com o filtro "★ Favoritos" desligado; o filtro só esconde o resto. Use pros exercícios que você repete toda semana.',
      },
      {
        title: 'Ficha do exercício',
        body: 'Toque em qualquer exercício (ou no ⓘ ao lado dele durante a montagem de um dia) pra ver categoria, nível de dificuldade, descrição, dica de execução, músculos primário/secundários, equipamento, um link de busca no YouTube, gráfico de evolução de carga e o histórico completo de séries.',
      },
      {
        title: 'Nota pessoal',
        body: 'Um campo de texto livre por exercício, editável na ficha do exercício (ex: "pegada mais aberta"). Também aparece durante o treino, embaixo do nome do exercício.',
      },
      {
        title: 'Unir histórico',
        body: 'Na ficha do exercício, marque qual exercício este substituiu (ex: você trocou hack squat por leg press) pra unir os dois num só gráfico de evolução e histórico. Use quando trocar de exercício por lesão, equipamento ou preferência, mas quiser manter a continuidade visual da carga.',
        warning:
          'Não troca o exercício em nenhum plano nem numa sessão de treino — é só um vínculo histórico entre duas fichas, pra fins de gráfico.',
      },
    ],
  },
  {
    area: 'Planilhas',
    items: [
      {
        title: 'Criar plano, dia e exercício',
        body: '"+ Novo plano" na aba Planilhas; dentro do plano, "+ Adicionar dia"; dentro do dia, "+ Adicionar exercício" (define séries/reps/carga alvo). É assim que você monta a estrutura da sua rotina.',
      },
      {
        title: 'Editar e remover',
        body: 'Toque no ícone de lápis pra renomear plano ou dia. Toque num exercício já adicionado ao dia pra ajustar séries/reps/carga ou removê-lo (pede confirmação antes de remover).',
      },
      {
        title: 'Duplicar plano',
        body: 'Ícone de cópia no topo do plano — cria uma cópia completa (todos os dias e exercícios) com um novo nome. Use pra começar um mesociclo novo sem perder o original.',
      },
      {
        title: 'Duplicar dia',
        body: 'Botão "Duplicar" em cada dia — copia esse dia inteiro pro plano que você escolher, podendo ser o mesmo plano ou outro. Use pra reaproveitar um dia de treino em outro lugar.',
      },
      {
        title: 'Compartilhar plano',
        body: 'Ícone de compartilhar no topo do plano — gera um texto simples com os dias e exercícios e abre o menu de compartilhar do celular (WhatsApp etc). Use pra mandar seu treino pra alguém.',
        warning:
          'Isso não é o mesmo que o backup: é só texto pra ler, não dá pra importar de volta no Telos.',
      },
      {
        title: 'Supersérie',
        body: 'Toque em "Agrupar em supersérie" na lista do dia, selecione dois ou mais exercícios e escolha a letra do grupo (A/B/C/D) — todos ganham a mesma marcação de uma vez. Na aba Hoje os exercícios do grupo aparecem conectados por uma barra visual, e o botão de descanso só aparece depois do último exercício do grupo — não entre eles. Isso já é assim hoje, mesmo que não pareça óbvio olhando a tela.',
        warning:
          'Nada força você a alternar entre os exercícios do grupo — a ordem de preenchimento continua livre. O app guia visualmente (conecta os cards, adia o descanso), mas nunca bloqueia o treino fora de ordem.',
      },
    ],
  },
  {
    area: 'Hoje',
    items: [
      {
        title: 'Escolher dia de treino',
        body: 'Quando não há sessão aberta hoje, a lista mostra todos os dias de todos os planos e há quantos dias você treinou cada um. Toque num deles pra iniciar a sessão.',
      },
      {
        title: 'Registrar série',
        body: 'Preencha reps e carga de cada série. Só salva quando os dois campos estão preenchidos, pra evitar salvar uma série "zerada" por engano.',
      },
      {
        title: 'RPE',
        body: 'Chips "Fácil / Difícil / Falha" abaixo de cada série já preenchida. Tocar de novo no mesmo chip desmarca. Aparece no histórico da ficha do exercício.',
        warning:
          'Não é uma nota livre de 1 a 10 — são só essas 3 categorias fixas. Não é usado em nenhum cálculo: não influencia a sugestão de carga nem aparece em nenhum gráfico do Progresso.',
      },
      {
        title: 'Sugestão de carga',
        body: 'Label "Sugerido: Xkg" ou "Manter: Xkg" acima dos campos. Compara com sua última sessão feita naquele exercício: se todas as séries bateram a meta de reps, sugere subir (pelo incremento típico do equipamento); senão, sugere manter.',
        warning:
          'Nunca preenche o campo sozinho, é só texto informativo. Não aparece sem sessão anterior, e não aparece pra exercícios sem equipamento com incremento configurado (ex: peso corporal).',
      },
      {
        title: 'Timer de descanso',
        body: 'Botão "Iniciar descanso" aparece depois de preencher reps e carga de uma série. A duração sugerida varia pelo tipo de movimento do exercício (agachamento/dobradiça = mais longo, isolado = mais curto) e dá pra ajustar em ±30s durante a contagem. Continua contando mesmo se você sair do app.',
        warning:
          'Ao terminar, só vibra e mostra uma tela de "descanso concluído" — sem som, sem notificação. Com o celular no silencioso ou fora do bolso, você pode não perceber.',
      },
      {
        title: 'Pular exercício',
        body: 'Botão "Pular" no card de um exercício do plano, na sessão ativa. Marca esse exercício como pulado só nesta sessão — o plano não muda, e ele volta a aparecer normalmente da próxima vez. Dá pra desfazer enquanto a sessão estiver aberta.',
        warning: 'Só funciona antes de registrar qualquer série do exercício — depois da primeira série logada, a opção some.',
      },
      {
        title: 'Exercício avulso',
        body: 'Botão "+ Adicionar exercício" na sessão ativa. Adiciona um exercício fora do plano, só pra esta sessão, com séries/reps/carga próprias. Removê-lo depois não apaga as séries já registradas, só tira o card da tela.',
      },
      {
        title: 'Concluir ou cancelar sessão',
        body: '"Concluir treino" fecha a sessão como feita. "Cancelar sessão de hoje" (com confirmação) apaga a sessão inteira e tudo que foi registrado nela — use se abriu a sessão errada.',
      },
      {
        title: 'Histórico',
        body: 'Lista abaixo da sessão do dia, com as últimas 10 sessões concluídas.',
      },
    ],
  },
  {
    area: 'Progresso',
    items: [
      {
        title: 'Frequência',
        body: 'Sequência de semanas seguidas treinando, mais um calendário do mês com os dias treinados marcados.',
      },
      {
        title: 'Séries por grupo muscular',
        body: 'Total de séries por músculo nesta semana, com uma faixa de referência de 10 a 20 séries — a barra fica verde quando está dentro da faixa.',
      },
      {
        title: 'Volume por semana e Deload',
        body: 'Volume (reps × carga) por semana, últimas 10 semanas. Toque no chip de uma semana pra marcá-la como deload — ela aparece em âmbar no gráfico.',
        warning:
          'A marcação de deload é 100% manual, feita por você. Não existe nenhuma detecção automática de quando você precisa de um deload.',
      },
      {
        title: 'Volume por músculo',
        body: 'Os 8 músculos com mais volume acumulado nas últimas ~8 semanas.',
      },
      {
        title: 'Padrão de movimento',
        body: 'O mesmo volume de 8 semanas, agrupado por empurrar/puxar/agachar/dobradiça/isolado/etc — ajuda a notar desequilíbrio entre padrões de movimento.',
      },
      {
        title: 'Densidade',
        body: 'Volume por minuto de treino (kg/min), média semanal. Só calcula pra sessões com hora de início e fim registradas.',
      },
      {
        title: 'Estagnação de carga',
        body: 'Sinaliza um exercício quando você ainda o treina (treinado nos últimos 21 dias) mas a carga máxima não sobe há 28 dias ou mais. Só mostra o dado, sem julgar nem sugerir nada.',
      },
      {
        title: 'Peso corporal',
        body: 'Registro manual de peso (um valor por dia — registrar de novo hoje sobrescreve) e gráfico das últimas 20 entradas.',
      },
      {
        title: 'Recordes pessoais',
        body: 'Carga máxima histórica por exercício, com data, e quantas vezes o seu peso corporal ela representa.',
      },
      {
        title: 'Aderência',
        body: '% de sessões concluídas do plano mais treinado nas últimas 10 semanas, comparação de volume deste mês com o anterior, e duração média de sessão por dia de treino.',
      },
    ],
  },
  {
    area: 'Backup',
    items: [
      {
        title: 'Exportar backup',
        body: 'Em Sobre → Dados e backup: gera um arquivo com todos os seus planos, dias, sessões e séries, e abre o menu de compartilhar pra você salvar onde quiser. O catálogo de exercícios não entra — ele já vem com o app.',
      },
      {
        title: 'Restaurar — Mesclar vs Substituir tudo',
        body: '"Mesclar" adiciona só o que ainda não existe no aparelho (compara plano por nome, dia por nome dentro do plano, sessão por data, etc.) sem apagar nada — favoritos e notas já existentes nunca são sobrescritos pelo backup. "Substituir tudo" apaga TODOS os planos, sessões e histórico atuais antes de importar. Use mesclar ao trocar de aparelho mantendo o que já existe; substituir só se quiser voltar a um estado anterior por completo.',
        warning:
          'Substituir tudo é irreversível. Se o backup referenciar um exercício que não existe mais no catálogo do app, aquela linha é ignorada (não trava a importação) e informada no resumo ao final.',
      },
    ],
  },
];
