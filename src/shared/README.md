# `shared/` — UI, hooks e utilitários

Componentes de UI reutilizáveis, hooks e utilitários transversais.

| Arquivo                                            | O que faz                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| [ErrorBoundary.tsx](ErrorBoundary.tsx)             | A rede de proteção da aplicação inteira (RNF-03.1).                |
| [SettingsModal.tsx](SettingsModal.tsx)             | Configurações (RF-08.1), foco gerenciado (RNF-05.1) e backup JSON. |
| [ResultList.tsx](ResultList.tsx)                   | Lista de resultados do YouTube, compartilhada por Buscar e Fundos. |
| [Clock.tsx](Clock.tsx)                             | O relógio "AGORA" da topbar.                                       |
| [hooks.ts](hooks.ts)                               | `useInterval`, `useOnlineStatus` (RNF-03.4), `useFocusTrap`.       |
| [useKeyboardShortcuts.ts](useKeyboardShortcuts.ts) | Os atalhos do RF-07, na mesma lista do rodapé.                     |
| [format.ts](format.ts)                             | Tempo, relógio e a borda entre milissegundos e segundos.           |
| [tabs.ts](tabs.ts)                                 | O tipo das três abas.                                              |

> Preenchido ao longo das **Etapas 4–6**.
