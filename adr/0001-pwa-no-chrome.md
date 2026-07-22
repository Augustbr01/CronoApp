# 0001 — PWA no Chrome, não Electron/Tauri

- **Status:** Aceito
- **Data:** 2026-07-20

## Contexto

O app precisa tocar YouTube sem anúncios no meio do culto. A única forma
confiável de garantir isso é rodar dentro do perfil do Chrome onde o **YouTube
Premium já está logado**. Electron e Tauri empacotam um runtime próprio, com seu
próprio armazenamento de sessão, e perderiam esse login — trazendo os anúncios
de volta. Um desktop nativo também não agregaria nada: o app é uma SPA de tela
única sem roteamento.

## Decisão

Distribuir o CronoApp como **PWA instalável pelo Chrome**, com janela própria.
Não migrar para desktop nativo.

## Consequências

- A ausência de anúncios depende do login do YouTube Premium no perfil do
  Chrome do operador — é uma restrição de operação, não do código.
- Nada de APIs exclusivas de runtime nativo (ex.: seleção de saída de áudio via
  `setSinkId` no iframe do YouTube — ver limitações no [CLAUDE.md](../CLAUDE.md)).
- É preciso um manifesto PWA e ícones para instalação (Etapa 6).
- Amarra as demais decisões: sem runtime nativo, a persistência é do navegador
  (ver [0003](0003-persistencia-indexeddb.md)).
