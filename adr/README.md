# Architecture Decision Records

Registro das decisões de arquitetura do CronoApp (RNF-07.3). Cada ADR captura
uma decisão, seu contexto e suas consequências. Novos ADRs são numerados em
sequência e nunca reescritos — para reverter uma decisão, adiciona-se um novo
ADR que supersede o anterior.

| #                                      | Decisão                                       | Status |
| -------------------------------------- | --------------------------------------------- | ------ |
| [0001](0001-pwa-no-chrome.md)          | PWA no Chrome, não Electron/Tauri             | Aceito |
| [0002](0002-youtube-iframe-api.md)     | YouTube IFrame API no lugar do `react-player` | Aceito |
| [0003](0003-persistencia-indexeddb.md) | Persistência local em IndexedDB               | Aceito |
| [0004](0004-alvo-e-implantacao.md)     | Alvo desktop-first e implantação na Vercel    | Aceito |
| [0005](0005-sem-service-worker.md)     | PWA instalável, mas sem service worker        | Aceito |

Modelo para novos ADRs: [`_template.md`](_template.md).
