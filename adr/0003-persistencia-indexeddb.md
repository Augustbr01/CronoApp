# 0003 — Persistência local em IndexedDB

- **Status:** Aceito
- **Data:** 2026-07-20

## Contexto

O protótipo persiste em `localStorage` (chave `cronoapp-sound-panel`), com
migração de schema versionada (hoje na v4) via Zustand `persist`. `localStorage`
é síncrono, limitado (~5 MB) e mal comporta histórico longo — e inviabiliza um
futuro fundo por MP3 local. O produto não tem contas nem nuvem, e isso não vai
mudar na v1.

## Decisão

Persistir em **IndexedDB** (via `idb`), mantendo o esquema de versionamento e
`partialize` do store. Continuar **local, sem contas e sem nuvem**.

## Consequências

- Comporta histórico ampliado e, no futuro, blobs de áudio (MP3 local, roadmap).
- É preciso **migrar os dados existentes** de `localStorage` → IndexedDB na
  primeira execução, para não perder fila e biblioteca de fundos dos usuários do
  protótipo (RF-09.3).
- Backup e portabilidade entre notebooks passam por **export/import JSON**
  (RF-09.4), já que não há nuvem.
- Estado corrompido não pode impedir o app de abrir — precisa de recuperação com
  aviso (RNF-03.2).
