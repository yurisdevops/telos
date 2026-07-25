# Telos

App de gestão de treino de academia, **local-first e 100% offline** — sem backend, sem conta, sem sincronização. Todos os dados (catálogo de exercícios, planos de treino, sessões e histórico de cargas) vivem no SQLite do próprio dispositivo.

## Stack

- [Expo](https://expo.dev) (SDK 57) + React Native 0.86 + TypeScript
- [Expo Router](https://docs.expo.dev/router/introduction/) — navegação por arquivos
- [Drizzle ORM](https://orm.drizzle.team/) + [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/) — persistência local, com migrações versionadas via `drizzle-kit`
- [Nativewind](https://www.nativewind.dev/) — Tailwind CSS para React Native
- [react-native-gifted-charts](https://github.com/Abhinandan-Kushwaha/react-native-gifted-charts) (+ `react-native-svg`) — gráficos interativos da aba Progresso (toque numa barra mostra o detalhe daquele ponto)
- `expo-keep-awake` — mantém a tela acesa durante o timer de descanso
- `expo-notifications` — notificação local (agendada via trigger de tempo, dispara mesmo com o app minimizado) ao fim do descanso; exige config plugin em `app.json` e um development/preview build (mudança de dependência nativa não vai por OTA)
- Fontes [Barlow Condensed](https://fonts.google.com/specimen/Barlow+Condensed) e [Inter](https://fonts.google.com/specimen/Inter) via Google Fonts

Direção visual própria ("Chapa e Ferro"): fundo escuro, tipografia condensada pesada para títulos e números, uma única cor de destaque usada com parcimônia.

## Funcionalidades

- **Catálogo** — 839 exercícios com nome (PT/EN), categoria, equipamento, músculos primários e secundários, descrição, dica de execução técnica e nível de dificuldade (iniciante/intermediário/avançado). Busca por texto (tolerante a acentos), filtro por grupo muscular e por nível, favoritos e nota pessoal por exercício.
- **Detalhe do exercício** — informações completas, badge de nível, gráfico de evolução da carga máxima ao longo do tempo, um botão que abre uma busca no YouTube por vídeos de execução (link externo, nada embutido), e "Unir histórico" pra continuar o gráfico de evolução quando você troca de exercício (não altera nenhum plano nem sessão).
- **Planilhas** — criação e edição de planos de treino com dias de nome livre (ex: "Push", "Peito e Tríceps"), cada um com seus próprios exercícios, séries, repetições e carga alvo; duplicar plano/dia, compartilhar plano como texto, e agrupar exercícios em supersérie (individualmente ou em lote).
- **Hoje** — escolha do treino do dia, execução da sessão com registro de reps e carga reais por série, sugestão de carga e RPE por série, timer de descanso (tela acesa, notificação e vibração ao terminar, mesmo com o app minimizado), exercício avulso e pular exercício do plano, barra de progresso da sessão, conclusão do treino, e histórico das sessões concluídas — cada sessão do histórico pode ser reaberta pra editar reps/carga ou ser apagada por completo. Uma confirmação avisa se você tentar trocar de aba com o treino de hoje ainda em andamento.
- **Progresso** — frequência de treino (sequência de semanas seguidas + calendário do mês), séries por grupo muscular na semana, volume semanal (repetições × carga, com marcação manual de deload), volume por músculo e por padrão de movimento, densidade de treino, indicador automático de estagnação de carga, peso corporal, recordes pessoais e aderência ao plano — os gráficos de barra respondem a toque, mostrando o detalhe do ponto selecionado.
- **Ajuda** — tela de consulta rápida (acessível por Sobre) organizada por área do app, mais ícones de ajuda contextual (ⓘ) nos pontos de maior risco de confusão.
- **Backup** — exportar todos os dados de treino para um arquivo, e restaurar mesclando (nunca sobrescreve o que já existe) ou substituindo tudo.

## Decisões de arquitetura

**Local-first, sem backend.** É um app de uso *durante* o treino — precisa funcionar dentro da academia sem depender de conexão. Local-first também elimina toda a superfície de um backend (hospedagem, autenticação, sincronização) para o que é, na prática, um diário de treino pessoal.

**Drizzle ORM + Expo SQLite.** O schema TypeScript é a fonte da verdade — os tipos usados no app inteiro (`Exercise`, `WorkoutPlan`, `Session` etc.) são inferidos diretamente dele, sem duplicar definições. Migrações são geradas e versionadas com `drizzle-kit`, então o schema evolui de forma rastreável em vez de recriar o banco a cada mudança. A reatividade da UI (listas que atualizam sozinhas quando um exercício é registrado, por exemplo) vem do `useLiveQuery` do Drizzle, que escuta mudanças no SQLite diretamente — sem gerenciamento manual de estado global.

## Rodando localmente

```bash
npm install
```

Este projeto **não roda no Expo Go** — usa `expo-sqlite` com migrações do Drizzle, `react-native-svg` e outras dependências nativas que exigem um **development build** próprio.

**Caminho recomendado — EAS Build (não exige Android SDK local):**

```bash
npx eas build --profile development --platform android
```

Compila o development build na nuvem. Baixe o APK gerado, instale no dispositivo/emulador e rode `npx expo start` para conectar o Metro.

**Alternativa — build local (requer Android SDK configurado na máquina):**

```bash
npx expo prebuild
npx expo run:android
```

## Créditos

O catálogo de exercícios foi derivado da base de dados aberta da [wger](https://wger.de) (projeto open-source de gestão de treinos), publicada sob a licença [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).

Os dados originais foram traduzidos para português e enriquecidos com descrições e dicas de execução adicionais. Como obra derivada de conteúdo CC BY-SA, o conjunto de dados de exercícios (`assets/data/seed_final.json`) é distribuído sob a mesma licença CC BY-SA 4.0 — o restante do código do projeto está sob a licença MIT (veja `LICENSE`).
