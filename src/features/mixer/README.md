# `features/mixer/` — mixer, transporte e a costura com o motor

Além da UI do mixer (RF-05), esta pasta é o **ponto onde a interface encontra o
motor de áudio**. É a única que conhece `audio/`, `youtube/` e `store/` ao mesmo
tempo; o resto do app fala com ela.

## Mapa dos arquivos

| Arquivo                                            | O que faz                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| [engine.ts](engine.ts)                             | A costura: cada ação vira dado no store **e** som no mixer.                |
| [context.ts](context.ts)                           | `useCrono` (domínio), `useEngineValue` (instrumento), `useEngine` (ações). |
| [AudioEngineProvider.tsx](AudioEngineProvider.tsx) | Cria o motor uma vez e o entrega à árvore.                                 |
| [Topbar.tsx](Topbar.tsx)                           | NO AR / STANDBY, now playing, contagem e transporte (RF-05.4).             |
| [MixerPane.tsx](MixerPane.tsx)                     | A coluna dos dois faders.                                                  |
| [Fader.tsx](Fader.tsx)                             | Fader vertical: ponteiro (RF-05.6), teclado (RNF-05.2), MUTE (RF-05.3).    |
| [Meter.tsx](Meter.tsx)                             | VU-meter de 14 segmentos em três faixas (RF-05.2).                         |
| [PreviewDeck.tsx](PreviewDeck.tsx)                 | A pré-escuta, onde mora o player do louvor, e o erro visível.              |
| [FadeToasts.tsx](FadeToasts.tsx)                   | Aviso flutuante durante os fades, com contagem regressiva (RF-05.5).       |

## A regra que organiza tudo

O **store guarda intenção** (quem está no ar, onde o fader ficou), o **mixer
guarda som** (rampas, crossfade, volume por quadro) e o **engine traduz** de um
para o outro. Nenhum componente chama o player do YouTube diretamente.

Os valores que mudam a 60 fps — volume, tempo, fade em andamento — não passam
pelo store: vivem num observável próprio no `engine.ts`, lido por
`useEngineValue`. É o que permite o VU-meter repintar sem re-renderizar a fila
(RNF-04.3).

## Dois cuidados com o player

**O louvor carrega tocando; o fundo fica engatilhado.** Trocar o vídeo do louvor
é sempre o operador mandando tocar agora, e o mixer nem sempre manda um `play`
atrás (quando o canal já está no ar, o transporte não repete o comando) — então
ali vale o `load`, que já toca. No fundo, quem manda tocar é **sempre** o mixer,
pelo transporte: carregá-lo tocando fazia ele streamar calado por trás do louvor
inteiro (dois vídeos do YouTube ao mesmo tempo, no hotspot do celular do
RNF-03.4) e voltar no meio da faixa em vez do começo. A partida a frio que isso
reintroduz é coberta pelo fade, que entra subindo do zero.

Engatilhar é **anotação do motor, não comando ao YouTube** — e essa parte é
sangue. Mandar `cueVideoById` e, no mesmo tique, `playVideo` é uma corrida
perdida: os dois comandos viajam por `postMessage` até o iframe, e o play chega
enquanto o cue ainda está buscando o vídeo. O player fica sem vídeo registrado e
responde com o erro 2 — no culto isso apareceu como o "Mix agora" parando o deck
A sem iniciar o B, e o "voltar fundo" acusando link inválido. Quem resolve o
engatilhado é o `loadVideoById`, um comando só que carrega e toca. O dublê de
[fake-channel.ts](../../test/fake-channel.ts) reproduz a corrida de propósito,
para que ela não volte em silêncio.

**Player que não nasce não é definitivo.** Se a criação falhar — sem rede, API
fora do ar —, o `ref` do React não dispara de novo, e sem tratamento o canal
ficaria morto até alguém recarregar a página: a topbar anunciando NO AR e a
igreja em silêncio. O motor marca a queda (`playerDown`) e refaz o player em três
gatilhos: o botão **Tentar de novo** no aviso da pré-escuta, a rede voltando
(`Dashboard`) e a própria ação do operador — apertar play de novo é o pedido de
nova tentativa mais natural que existe. O vídeo pedido enquanto o canal estava
caído fica guardado e entra assim que o player chega.

> Preenchido na **Etapa 4**.
