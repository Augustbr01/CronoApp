# 0002 — YouTube IFrame API no lugar do `react-player`

- **Status:** Aceito
- **Data:** 2026-07-20

## Contexto

O protótipo usa `react-player` v3, que arrasta suporte a HLS e DASH que o app
nunca exerce — o build gera `hls-*.js` (524 KB) e `dash.all.min-*.js` (857 KB),
~1,4 MB de JavaScript morto. O app só toca YouTube. Além do peso, a lib medeia
`setVolume`/`playVideo`/`getPlayerState` e não expõe os códigos de erro de embed
bloqueado de forma confiável — que é justamente um requisito de MVP (RF-01.3).

## Decisão

Usar a **YouTube IFrame Player API** diretamente, com um wrapper próprio em
`src/youtube/`, e remover o `react-player`.

## Consequências

- −1,4 MB no bundle: nenhum chunk de HLS ou DASH pode aparecer em `dist/assets`
  (RNF-04.1, verificado na Etapa 6).
- Controle direto de volume, play/pause e estado do player.
- Códigos de erro de embed bloqueado ficam acessíveis, viabilizando o aviso no
  momento de adicionar (RF-01.3) e erros de player visíveis (RNF-03.3).
- Passa a ser responsabilidade nossa carregar o script da IFrame API e lidar com
  seu ciclo de vida assíncrono — encapsulado no wrapper.
