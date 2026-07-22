import { createOembedEndpoint } from '../../server/youtube/oembed-endpoint'

/**
 * `GET /api/youtube/oembed?id=` — o ponto de entrada da Vercel.
 *
 * Mesma divisão do `search.ts`: a regra mora em
 * [`server/youtube/oembed-endpoint.ts`](../../server/youtube/oembed-endpoint.ts)
 * e o estado (cache, limite) nasce uma vez por instância.
 */
export default createOembedEndpoint()
