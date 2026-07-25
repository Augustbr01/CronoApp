import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarPainel } from './test/painel'
import type { Painel } from './test/painel'

/**
 * O teste de aceitação do plano, feito pela tela.
 *
 * > Fundo tocando, adicionar alguém pela busca, tocar fora de ordem, crossfade
 * > suave, música termina, fundo retorna sozinho, desligar retorno automático
 * > para a oração, religar depois.
 *
 * É o roteiro de um culto de verdade, do jeito que o operador o executa —
 * clicando. Os testes de `engine.test.ts` provam cada peça isolada; este prova
 * que elas continuam encaixadas depois de passarem pela interface.
 */

const FADE_MS = 2000

let painel: Painel

function user() {
  return userEvent.setup()
}

/** Um resultado de busca do YouTube, como o backend da Etapa 5 devolverá. */
function resultado(id: string, title: string) {
  return { id, title, channel: 'Canal Gospel', duration: 240 }
}

beforeEach(async () => {
  painel = await montarPainel({ pollMs: 60_000 })
})

afterEach(() => {
  painel.unmount()
  vi.restoreAllMocks()
})

async function buscar(termo: string, itens: unknown[]): Promise<void> {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ items: itens }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
  const u = user()
  await u.type(screen.getByLabelText('Buscar música'), termo)
  await u.click(screen.getByRole('button', { name: 'Buscar' }))
  await screen.findByText(String((itens[0] as { title: string }).title))
}

describe('um culto do começo ao fim', () => {
  it('fundo → busca → toca fora de ordem → termina → fundo volta', async () => {
    const u = user()

    // 1. O operador monta a trilha de fundo. A primeira faixa já entra tocando.
    await u.keyboard('3')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ items: [resultado('bg-piano', 'Piano worship 3h')] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    await u.click(screen.getByRole('button', { name: 'Piano worship' }))
    await u.click(await screen.findByRole('button', { name: '+ Fundos' }))

    await painel.advance(FADE_MS)
    expect(painel.store.getState().mode).toBe('background')
    expect(painel.players.background().videos).toEqual(['bg-piano'])
    expect(painel.players.background().volume).toBeCloseTo(0.4, 2)

    // 2. Alguém aparece de última hora: entra pela busca.
    await u.keyboard('2')
    await buscar('porque ele vive', [resultado('v-ana', 'Porque Ele Vive')])
    await u.type(screen.getByLabelText('Nome de quem vai cantar'), 'Ana')
    await u.click(screen.getByRole('button', { name: '+ Fila' }))

    // Adicionar joga o operador de volta para a fila — é o próximo passo dele.
    expect(screen.getByText('Ana')).toBeInTheDocument()

    // 3. E outra pessoa entra depois, mas canta primeiro (RF-01.7).
    await u.keyboard('2')
    await buscar('grande é o senhor', [
      resultado('v-bruno', 'Grande é o Senhor'),
    ])
    await u.type(screen.getByLabelText('Nome de quem vai cantar'), 'Bruno')
    await u.click(screen.getByRole('button', { name: '+ Fila' }))

    await u.click(screen.getByRole('button', { name: 'Tocar Bruno' }))

    // 4. Crossfade: no meio da troca os dois estão soando.
    await painel.advance(FADE_MS / 2)
    expect(painel.players.main().volume).toBeGreaterThan(0)
    expect(painel.players.background().volume).toBeGreaterThan(0)
    expect(painel.players.background().volume).toBeLessThan(0.4)

    await painel.advance(FADE_MS / 2)
    expect(painel.players.main().loads).toEqual(['v-bruno'])
    expect(painel.players.background().volume).toBe(0)

    // 5. A música acaba sozinha: Bruno sai da fila e vai para o histórico.
    await painel.fora(() => painel.players.main().emitEnded())
    await painel.advance(FADE_MS)

    expect(screen.queryByText('Bruno')).not.toBeInTheDocument()
    expect(screen.getByText(/Bruno — Grande é o Senhor/)).toBeInTheDocument()
    // …e o fundo volta sozinho.
    expect(painel.store.getState().mode).toBe('background')
    expect(painel.players.background().volume).toBeCloseTo(0.4, 2)
  })

  it('o momento de oração: desligar o retorno automático e religar depois', async () => {
    const u = user()

    // Fundo tocando e alguém no ar.
    let ana = ''
    await painel.fora(() => {
      painel.store
        .getState()
        .addBackground({ kind: 'youtube', videoId: 'bg-1', title: 'Pads' })
      ana = painel.store.getState().addToQueue({
        kind: 'youtube',
        name: 'Ana',
        videoId: 'v-ana',
        title: 'Ana canta',
      })
    })
    await u.click(screen.getByRole('button', { name: 'Tocar Ana' }))
    await painel.advance(FADE_MS)
    expect(painel.store.getState().currentId).toBe(ana)

    // O pastor pede oração: nada pode entrar depois do louvor.
    await u.click(
      screen.getByRole('button', { name: 'Retorno automático ao fundo' }),
    )
    await u.keyboard('s')
    await painel.advance(FADE_MS * 3)

    expect(painel.store.getState().mode).toBe('silence')
    expect(painel.players.background().volume).toBe(0)

    // Terminada a oração, ele religa e o fundo volta.
    await u.click(
      screen.getByRole('button', { name: 'Retorno automático ao fundo' }),
    )
    await u.keyboard('b')
    await painel.advance(FADE_MS)

    expect(painel.store.getState().mode).toBe('background')
    expect(painel.players.background().volume).toBeCloseTo(0.4, 2)
  })
})

describe('a busca quando o backend ainda não existe (Etapa 5)', () => {
  it('mostra o recado certo em vez de um erro de JSON', async () => {
    // O SPA responde o index.html: HTML com 404.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<!doctype html>', { status: 404 }),
    )
    const u = user()

    await u.keyboard('2')
    await u.type(screen.getByLabelText('Buscar música'), 'louvor')
    await u.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Cole o link do YouTube na aba Fila/,
    )
  })
})
