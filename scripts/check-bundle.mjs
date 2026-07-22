import { gzipSync } from 'node:zlib'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * O orçamento de bundle, verificado (RNF-04.1).
 *
 * O protótipo carregava ~1,4 MB só de HLS e DASH que ele nunca usava — código
 * de streaming que vinha junto do `react-player` e que o CronoApp não precisa,
 * porque quem decodifica vídeo é o iframe do YouTube (ADR 0002).
 *
 * Trocar o `react-player` por um wrapper próprio resolveu isso uma vez. Este
 * script é o que impede o problema de voltar sem ninguém perceber: uma
 * dependência gorda entra num `npm install` distraído, o app continua
 * funcionando na máquina de quem instalou, e só a igreja com internet ruim
 * descobre — no domingo.
 *
 * Roda no CI depois do build.
 */

/** O teto do RNF-04.1, em bytes comprimidos. */
const ORCAMENTO_GZIP = 300 * 1024

/**
 * Marcas de biblioteca de streaming no código gerado.
 *
 * São procuradas no conteúdo, e não no nome do arquivo, porque o bundler junta
 * tudo num chunk só com nome de hash — procurar por "hls.js" na lista de
 * arquivos não acharia nada mesmo com a biblioteca lá dentro.
 */
const PROIBIDOS = [
  { marca: 'hls.js', o_que: 'HLS' },
  { marca: 'Hls.isSupported', o_que: 'HLS' },
  { marca: 'dashjs', o_que: 'DASH' },
  { marca: 'MediaPlayer().create', o_que: 'DASH' },
  { marca: 'video.js', o_que: 'Video.js' },
]

const DIST = 'dist'

async function main() {
  const assets = join(DIST, 'assets')
  let arquivos
  try {
    arquivos = await readdir(assets)
  } catch {
    falhar(`não encontrei ${assets}/. Rode \`npm run build\` antes.`)
    return
  }

  let totalCru = 0
  let totalGzip = 0
  const linhas = []
  const achados = []

  for (const nome of arquivos.sort()) {
    // Só o que o navegador baixa para abrir o painel. Os mapas de origem não
    // entram: eles não custam nada ao operador.
    if (nome.endsWith('.map')) continue

    const conteudo = await readFile(join(assets, nome))
    const gzip = gzipSync(conteudo).length
    totalCru += conteudo.length
    totalGzip += gzip
    linhas.push(
      `  ${nome.padEnd(34)} ${kb(conteudo.length)}  →  ${kb(gzip)} gz`,
    )

    const texto = conteudo.toString('utf8')
    for (const { marca, o_que } of PROIBIDOS) {
      if (texto.includes(marca)) achados.push(`${o_que} (${marca}) em ${nome}`)
    }
  }

  console.log(linhas.join('\n'))
  console.log(
    `  ${'total'.padEnd(34)} ${kb(totalCru)}  →  ${kb(totalGzip)} gz  (teto ${kb(ORCAMENTO_GZIP)})`,
  )

  const problemas = []
  if (totalGzip > ORCAMENTO_GZIP) {
    problemas.push(
      `bundle de ${kb(totalGzip)} comprimidos passa do teto de ${kb(ORCAMENTO_GZIP)} (RNF-04.1).`,
    )
  }
  for (const achado of achados) {
    problemas.push(`biblioteca de streaming no bundle: ${achado}.`)
  }

  if (problemas.length > 0) {
    falhar(problemas.join('\n  '))
    return
  }

  const folga = ORCAMENTO_GZIP - totalGzip
  console.log(`\n✓ dentro do orçamento, com ${kb(folga)} de folga.`)
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1).padStart(6)} KB`
}

function falhar(mensagem) {
  console.error(`\n✗ ${mensagem}`)
  process.exitCode = 1
}

await main()
