# `features/backgrounds/` — biblioteca de fundos

Fundos musicais (RF-03): busca com filtro de vídeo longo, atalhos de categoria,
biblioteca persistente, seleção de faixa, "Mix agora" com crossfade.

| Arquivo                                        | O que faz                                                |
| ---------------------------------------------- | -------------------------------------------------------- |
| [BackgroundsTab.tsx](BackgroundsTab.tsx)       | A aba: busca `duration=long`, categorias e a biblioteca. |
| [AddBackgroundForm.tsx](AddBackgroundForm.tsx) | Cadastrar faixa colando o link, sem passar pela busca.   |
| [DeckPanel.tsx](DeckPanel.tsx)                 | Decks A/B, "Voltar fundo" e "Mix agora".                 |

Adicionar, escolher e remover faixa passam pelo `engine` de
[`features/mixer/`](../mixer/README.md), e não pelo store direto: a **primeira**
faixa da biblioteca vazia já entra tocando (RF-03.4), e isso é som, não só dado.

O formulário de link é o **único acréscimo ao protótipo** nesta pasta: lá a
busca era a única porta de entrada da biblioteca, o que deixava a aba
inutilizável enquanto o servidor de busca (Etapa 5) não existisse.

> Preenchido na **Etapa 4**.
