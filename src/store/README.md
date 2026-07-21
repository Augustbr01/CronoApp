# `store/` — domínio e persistência

Slices Zustand espelhando o modelo de domínio: `PlayerMode`, fila, histórico,
fundos, volumes, preferências — com `partialize`.

- Persistência em **IndexedDB** via `idb` (RF-09.1).
- Migração de schema versionada (RF-09.2).
- Migração automática de `localStorage` (`cronoapp-sound-panel`) → IndexedDB na
  primeira execução (RF-09.3).
- Export/import JSON (RF-09.4).

> Preenchido na **Etapa 3**.
