# 0005 — PWA instalável, mas sem service worker

- **Status:** Aceito
- **Data:** 2026-07-22

## Contexto

A [0001](0001-pwa-no-chrome.md) fechou a distribuição como PWA instalável pelo
Chrome, e a Etapa 6 entrega o manifesto e os ícones que faltavam para isso.

Manifesto costuma vir acompanhado de service worker — é o par que a maioria dos
guias apresenta como indivisível, e o que os avaliadores de PWA cobram. Mas o
CronoApp não é um app de conteúdo próprio: ele é uma **casca em volta do iframe
do YouTube**. Nada do que importa durante o culto — os vídeos — pode ser
guardado localmente; é streaming, e é assim que o produto funciona.

Um service worker de app shell entregaria, então, exatamente isto: com a
internet caída, o painel **abre**, a fila aparece (ela vem do IndexedDB), os
botões respondem, a topbar anuncia NO AR — e não sai som nenhum.

Esse é o cenário que o projeto inteiro foi escrito para evitar. É o mesmo erro
que o cronômetro de silêncio do player caça (RNF-03.3) e que o aviso de rede
caída comunica (RNF-03.4): a tela contando uma coisa e a caixa de som contando
outra.

O Chrome desktop instala o app com janela própria a partir do manifesto; o
service worker não é requisito para isso.

## Decisão

Publicar o manifesto e os ícones, **sem** registrar service worker. Se um dia
houver cache de casca, ele terá que provar que não deixa o app abrir sem poder
tocar.

## Consequências

- O app instala com janela própria e ícone na barra de tarefas, que é o que a
  [0001](0001-pwa-no-chrome.md) pedia.
- Não abre offline — e isso é a decisão, não uma pendência. A limitação "depende
  de internet" no [CLAUDE.md](../CLAUDE.md) continua valendo literalmente.
- Sem cache de casca, o arranque depende da rede. O bundle de ~85 KB
  comprimidos (RNF-04.1, verificado por `npm run check:bundle`) é o que mantém
  esse arranque curto.
- Nenhuma invalidação de cache para dar errado no meio de um domingo: o que o
  servidor entregar é o que roda.
- Fica em aberto para o pós-v1, junto com o fundo por MP3 local — aí sim haveria
  áudio de verdade para tocar sem internet, e o cache passaria a fazer sentido.
