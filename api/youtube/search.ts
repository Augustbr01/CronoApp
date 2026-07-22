import { createSearchEndpoint } from '../../server/youtube/search-endpoint.js'

/**
 * `GET /api/youtube/search` — o ponto de entrada da Vercel.
 *
 * Fino de propósito: toda a regra mora em
 * [`server/youtube/search-endpoint.ts`](../../server/youtube/search-endpoint.ts),
 * que é testável sem subir servidor. Aqui só se resolve **quem** é o handler.
 *
 * O endpoint é criado **uma vez, fora do handler**: cache, limite por IP e
 * contador de cota precisam sobreviver entre requisições da mesma instância —
 * criá-los por chamada zeraria os três a cada requisição, e o cache que não
 * lembra de nada não poupa cota nenhuma.
 */
export default createSearchEndpoint()
