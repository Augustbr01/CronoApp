import { BLOB_STORE_NAME, getDb } from './idb-storage'

/**
 * Os bytes dos áudios locais (RF-11), guardados no IndexedDB **fora** do JSON do
 * `persist`.
 *
 * A razão é uma só: o `persist` serializa o estado inteiro num único texto,
 * reescrito a cada mexida de fader. Um MP3 tem megabytes de binário — enfiá-lo
 * nesse texto faria cada ajuste de volume reserializar a coletânea inteira. Por
 * isso o estado guarda só a **referência** (`blobId` + nome do arquivo), e os
 * bytes vivem aqui, num store próprio, endereçados pelo `blobId`.
 *
 * **Guardamos os bytes crus (`ArrayBuffer`) + o tipo, não o `Blob` inteiro.** Um
 * `Blob` não atravessa de forma confiável o structured-clone do IndexedDB em
 * todo ambiente — o dublê dos testes (`fake-indexeddb` sobre jsdom) o perde por
 * completo. `ArrayBuffer` sobrevive em qualquer lugar; reconstruímos o `Blob` na
 * leitura, preservando o MIME. O custo é uma cópia em memória na importação, que
 * é operação pontual e o arquivo já está na memória de qualquer forma.
 *
 * A filosofia de erro segue a de `idb-storage.ts`: leitura que não acha devolve
 * `null` (o app segue, o item é que vai falhar ao tocar), mas **escrita falha em
 * voz alta** — um `QuotaExceededError` não pode ser engolido, senão o operador
 * importaria um áudio achando que salvou e o perderia no domingo (RNF-03.3).
 */

/** O que de fato fica gravado: bytes crus mais o MIME, para remontar o Blob. */
interface StoredAudio {
  type: string
  bytes: ArrayBuffer
}

/** Grava (ou substitui) os bytes de um áudio. Erros de escrita sobem — inclusive quota. */
export async function putBlob(id: string, blob: Blob): Promise<void> {
  const db = await getDb()
  const record: StoredAudio = {
    type: blob.type,
    bytes: await blob.arrayBuffer(),
  }
  await db.put(BLOB_STORE_NAME, record, id)
}

/** Lê os bytes de um áudio já remontados em `Blob`, ou `null` se não houver — nunca lança. */
export async function getBlob(id: string): Promise<Blob | null> {
  try {
    const db = await getDb()
    const value = (await db.get(BLOB_STORE_NAME, id)) as StoredAudio | undefined
    if (value && value.bytes) {
      return new Blob([value.bytes], { type: value.type })
    }
    return null
  } catch {
    return null
  }
}

/** Apaga os bytes de um áudio. É o que evita blob órfão quando o item sai (RF-11.5). */
export async function deleteBlob(id: string): Promise<void> {
  const db = await getDb()
  await db.delete(BLOB_STORE_NAME, id)
}

/**
 * Todos os `blobId` guardados. Serve à varredura de órfãos: o que está aqui e
 * ninguém referencia na fila nem nos fundos pode ser descartado (RF-11.5).
 */
export async function listBlobIds(): Promise<string[]> {
  const db = await getDb()
  const keys = await db.getAllKeys(BLOB_STORE_NAME)
  return keys.map(String)
}

/**
 * As quatro operações acima vistas como **uma dependência só**.
 *
 * Existe para o motor poder receber o cofre por injeção, do mesmo jeito que já
 * recebe o relógio e a fábrica de players: nos testes entra um cofre de memória
 * e nenhum teste de costura precisa de IndexedDB. Sem isto, o único caminho
 * seria interceptar o módulo — que é o tipo de dublê que passa a mentir assim
 * que a implementação muda de forma.
 */
export interface BlobVault {
  put(id: string, blob: Blob): Promise<void>
  get(id: string): Promise<Blob | null>
  delete(id: string): Promise<void>
  list(): Promise<string[]>
}

/** O cofre de verdade — o IndexedDB deste arquivo. */
export const blobVault: BlobVault = {
  put: putBlob,
  get: getBlob,
  delete: deleteBlob,
  list: listBlobIds,
}
