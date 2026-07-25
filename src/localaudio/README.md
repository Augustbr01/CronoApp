# `localaudio/` — áudio do arquivo local

Segunda implementação do `MediaChannel`, ao lado do wrapper do YouTube (RF-11). O
operador importa um áudio do PC e ele toca, faz fade e crossfade **igual** a um
vídeo — inclusive misturado com um.

| Arquivo                | O que faz                                                                         |
| ---------------------- | --------------------------------------------------------------------------------- |
| [player.ts](player.ts) | `createLocalAudioChannel` sobre um `HTMLAudioElement` — o `id` do load é uma URL. |
| [errors.ts](errors.ts) | `MediaError` do navegador → frases acionáveis em pt-BR (RNF-03.3).                |

O motor (`engine.ts`) fala com este canal pela **mesma** interface do YouTube, sem
saber que por baixo há um `<audio>`. Duas fronteiras se mantêm:

- **Quem cria e revoga a object URL é a costura, não este player** (RNF-04.2). O
  `load`/`cue` recebe uma URL já pronta; ao trocar de faixa ou destruir, o motor é
  que revoga. Assim `localaudio/` fica sem dependência do `store` — o mesmo
  isolamento de [`youtube/`](../youtube/README.md).
- **`localaudio/` reusa de `youtube/` só o que é neutro:** o contrato
  `MediaChannel`, o `PLAYER_STATE` e o formato `PlayerErrorInfo`. Não há dependência
  na outra direção.

O que **não** existe aqui, e existe no YouTube, é de propósito: sem cronômetro de
5 s (o `play()` do arquivo rejeita na hora se o som não vai sair — o navegador não
fica bufferizando calado), sem corrida cue/load (as chamadas são locais, não
`postMessage`) e sem embed bloqueado (ninguém proíbe tocar o próprio arquivo). São
modos de falha que só existem no streaming.

> Roteamento pelo `kind` do item — os dois backends coexistindo por canal — é da
> **Etapa 4**; a importação e a UI, da **Etapa 5**.
