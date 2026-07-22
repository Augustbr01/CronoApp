import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Todo import relativo do código que vai ao ar precisa de extensão explícita.
 *
 * O `package.json` declara `"type": "module"`, então as funções publicadas são
 * ESM de verdade — e o carregador de ESM do Node **não** adivinha extensão:
 * `from './cache'` vira `ERR_MODULE_NOT_FOUND` no arranque da função.
 *
 * Este check existe porque esse erro é invisível de todas as outras formas. Ele
 * passou pelo `typecheck` (o TypeScript resolve `./cache` sozinho), passou pelos
 * testes (o Vitest também), passou pelo `npm run dev` (o Vite também) — e
 * derrubou a busca em produção, com um 500 opaco que não dizia nada. Custou uma
 * tarde para achar.
 *
 * Roda no CI, antes de qualquer deploy.
 */

/** Onde mora o código que a Vercel publica. */
const PASTAS = ['api', 'server']

/** `from '…'` e `import('…')`, que é tudo o que o carregador precisa resolver. */
const IMPORTES = /(?:from|import)\s*\(?\s*'(\.[^']*)'/g

/** Os testes e os dublês não sobem — quem os resolve é o Vitest. */
function ehDeTeste(caminho) {
  return caminho.includes('.test.') || caminho.includes(`test${sep()}`)
}

function sep() {
  return process.platform === 'win32' ? '\\' : '/'
}

async function arquivosTs(dir) {
  const achados = []
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) achados.push(...(await arquivosTs(caminho)))
    else if (entrada.name.endsWith('.ts')) achados.push(caminho)
  }
  return achados
}

const problemas = []
let conferidos = 0

for (const pasta of PASTAS) {
  for (const arquivo of await arquivosTs(pasta)) {
    if (ehDeTeste(arquivo)) continue
    conferidos += 1

    const conteudo = await readFile(arquivo, 'utf8')
    for (const [, alvo] of conteudo.matchAll(IMPORTES)) {
      if (alvo.endsWith('.js') || alvo.endsWith('.json')) continue
      problemas.push(`${arquivo}: import de '${alvo}' está sem a extensão .js`)
    }
  }
}

if (problemas.length > 0) {
  console.error(
    `\n✗ imports que o Node não vai resolver em produção:\n  ${problemas.join('\n  ')}\n\n  Use o caminho com \`.js\` — o TypeScript entende que o arquivo é \`.ts\`.\n`,
  )
  process.exitCode = 1
} else {
  console.log(
    `✓ ${conferidos} arquivos de api/ e server/, todos com import resolvível como ESM.`,
  )
}
