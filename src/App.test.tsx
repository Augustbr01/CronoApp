import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { montarPainel } from './test/painel'
import type { Painel } from './test/painel'

/**
 * O painel inteiro, montado sobre dublês.
 *
 * O que estes testes cobrem é o caminho que o operador percorre de verdade:
 * digita, clica, aperta tecla — e o áudio responde. É o teste que faltava no
 * protótipo, onde a única forma de saber se o crossfade funcionava era abrir o
 * app no domingo.
 *
 * O relógio **do áudio** é falso (`painel.advance`), então dois segundos de fade
 * passam num piscar. Os timers do navegador continuam reais, porque o
 * `user-event` depende deles para simular digitação — por isso a leitura de
 * tempo do player é desligada aqui (`pollMs` alto): nenhum teste depende dela, e
 * um timer disparando fora do controle do teste é fonte de instabilidade.
 */

const FADE_MS = 2000

let painel: Painel

function user() {
  return userEvent.setup()
}

beforeEach(async () => {
  painel = await montarPainel({ pollMs: 60_000 })
})

afterEach(() => {
  painel.unmount()
})

/**
 * O bloco NO AR da topbar. Vai direto ao elemento porque "NO AR" também
 * aparece na tarja do card da fila — e é o da topbar que responde "o que está
 * tocando agora".
 */
function noAr(): string {
  return painel.container.querySelector('.on-air')?.textContent ?? ''
}

/** Enfileira alguém pelo formulário, como o operador faz. */
async function enfileirar(nome: string, url: string): Promise<void> {
  const u = user()
  await u.type(screen.getByLabelText('Nome da pessoa'), nome)
  await u.type(screen.getByLabelText('Link do YouTube'), url)
  await u.click(screen.getByRole('button', { name: /Adicionar/ }))
}

describe('a tela em standby', () => {
  it('abre em STANDBY, sem áudio e sem fila', () => {
    expect(noAr()).toContain('STANDBY')
    expect(noAr()).toContain('SILÊNCIO')
    expect(screen.getByText('Nenhuma música aguardando')).toBeInTheDocument()
    expect(screen.getByText('0 na fila')).toBeInTheDocument()
  })

  it('os dois faders começam onde o protótipo deixava: 80 e 40', () => {
    expect(
      screen.getByRole('slider', { name: 'Volume MASTER' }),
    ).toHaveAttribute('aria-valuenow', '80')
    expect(
      screen.getByRole('slider', { name: 'Volume FUNDO' }),
    ).toHaveAttribute('aria-valuenow', '40')
  })

  it('sem canal no ar, os dois medidores dizem MUTE (RF-05.3)', () => {
    expect(screen.getAllByText('MUTE')).toHaveLength(2)
  })
})

describe('adicionar à fila (RF-01.1)', () => {
  it('aceita o link colado e extrai o id do vídeo', async () => {
    await enfileirar('Ana', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')

    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('1 na fila')).toBeInTheDocument()
    expect(painel.store.getState().queue[0]?.videoId).toBe('dQw4w9WgXcQ')
  })

  it('recusa o que não é link de vídeo, com a frase na tela', async () => {
    await enfileirar('Ana', 'meu link favorito')

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Não reconheci esse link/,
    )
    expect(painel.store.getState().queue).toHaveLength(0)
  })

  it('nome vazio vira Convidado (RF-02.3)', async () => {
    const u = user()
    await u.type(
      screen.getByLabelText('Link do YouTube'),
      'https://youtu.be/dQw4w9WgXcQ',
    )
    await u.click(screen.getByRole('button', { name: /Adicionar/ }))

    expect(screen.getByText('Convidado')).toBeInTheDocument()
  })
})

describe('tocar (RF-01.7)', () => {
  it('põe o item no ar, carrega o vídeo e sobe com fade', async () => {
    await enfileirar('Ana', 'https://youtu.be/dQw4w9WgXcQ')

    await user().click(screen.getByRole('button', { name: 'Tocar Ana' }))

    expect(noAr()).toContain('NO AR')
    expect(noAr()).toContain('LOUVOR')
    expect(painel.players.main().loads).toEqual(['dQw4w9WgXcQ'])
    // Parte do zero e sobe: nunca estoura no volume anterior (RF-04.3).
    expect(painel.players.main().volume).toBe(0)

    await painel.advance(FADE_MS)
    expect(painel.players.main().volume).toBeCloseTo(0.8, 2)
  })

  it('o card do que está no ar ganha a tarja NO AR', async () => {
    await enfileirar('Ana', 'https://youtu.be/dQw4w9WgXcQ')
    await user().click(screen.getByRole('button', { name: 'Tocar Ana' }))

    const card = screen.getByText('Ana').closest('article')
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByText('NO AR')).toBeInTheDocument()
  })

  it('renomear no lugar confirma com Enter (RF-01.5)', async () => {
    await enfileirar('Ana', 'https://youtu.be/dQw4w9WgXcQ')
    const u = user()

    await u.click(screen.getByRole('button', { name: /Editar nome/ }))
    const campo = screen.getByLabelText('Renomear Ana')
    await u.clear(campo)
    await u.type(campo, 'Ana Paula{Enter}')

    expect(screen.getByText('Ana Paula')).toBeInTheDocument()
  })

  it('remover quem está no ar tira do ar também', async () => {
    await enfileirar('Ana', 'https://youtu.be/dQw4w9WgXcQ')
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Tocar Ana' }))

    await u.click(screen.getByRole('button', { name: /Remover Ana/ }))

    expect(noAr()).toContain('STANDBY')
    expect(screen.getByText('Nenhuma música aguardando')).toBeInTheDocument()
  })
})

describe('atalhos de teclado (RF-07)', () => {
  it('Espaço pausa e continua', async () => {
    await enfileirar('Ana', 'https://youtu.be/dQw4w9WgXcQ')
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Tocar Ana' }))
    await painel.advance(FADE_MS)

    await u.keyboard(' ')
    await painel.advance(FADE_MS)
    expect(noAr()).toContain('STANDBY')
    expect(painel.players.main().volume).toBe(0)

    await u.keyboard(' ')
    await painel.advance(FADE_MS)
    expect(noAr()).toContain('NO AR')
  })

  it('as setas mexem o fader do fundo de 5 em 5', async () => {
    const u = user()

    await u.keyboard('{ArrowUp}{ArrowUp}')

    expect(
      screen.getByRole('slider', { name: 'Volume FUNDO' }),
    ).toHaveAttribute('aria-valuenow', '50')
  })

  it('1, 2 e 3 trocam de aba', async () => {
    const u = user()

    await u.keyboard('2')
    expect(screen.getByLabelText('Buscar música')).toBeInTheDocument()

    await u.keyboard('3')
    expect(screen.getByLabelText('Buscar fundo musical')).toBeInTheDocument()

    await u.keyboard('1')
    expect(screen.getByLabelText('Link do YouTube')).toBeInTheDocument()
  })

  it('digitando num campo, as teclas são texto e não comando (RF-07.2)', async () => {
    await enfileirar('Ana', 'https://youtu.be/dQw4w9WgXcQ')
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Tocar Ana' }))
    await painel.advance(FADE_MS)

    // "s" pararia o louvor se fosse tratado como atalho.
    await u.type(screen.getByLabelText('Nome da pessoa'), 'moises')

    expect(noAr()).toContain('NO AR')
    expect(screen.getByLabelText('Nome da pessoa')).toHaveValue('moises')
  })

  it('S para o louvor', async () => {
    await enfileirar('Ana', 'https://youtu.be/dQw4w9WgXcQ')
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Tocar Ana' }))
    await painel.advance(FADE_MS)

    await u.keyboard('s')
    await painel.advance(FADE_MS * 2)

    expect(noAr()).toContain('STANDBY')
    expect(painel.store.getState().currentId).toBeNull()
    // Parar não é terminar: a pessoa continua na fila para cantar de novo.
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })
})

describe('o modal de configurações (RF-08.1 e RNF-05.1)', () => {
  it('abre com o foco dentro dele e fecha no Escape', async () => {
    const u = user()
    const abrir = screen.getByRole('button', { name: 'Configurações' })

    await u.click(abrir)
    const dialogo = screen.getByRole('dialog', { name: 'Configurações' })
    expect(dialogo).toContainElement(document.activeElement as HTMLElement)

    await u.keyboard('{Escape}')
    expect(
      screen.queryByRole('dialog', { name: 'Configurações' }),
    ).not.toBeInTheDocument()
    // E o foco volta para quem abriu.
    expect(document.activeElement).toBe(abrir)
  })

  it('mostra o fade em segundos e guarda em milissegundos', async () => {
    await user().click(screen.getByRole('button', { name: 'Configurações' }))

    const controle = screen.getByLabelText(/Fade do louvor principal/)
    expect(controle).toHaveValue('2')
    expect(controle).toHaveAttribute('step', '0.5')
    expect(controle).toHaveAttribute('max', '8')
    expect(painel.store.getState().preferences.mainFadeMs).toBe(2000)
  })

  it('as quatro cores de destaque são as do protótipo, em hexadecimal', async () => {
    await user().click(screen.getByRole('button', { name: 'Configurações' }))

    for (const cor of ['#e8b64c', '#1fce6d', '#4f8df7', '#c084fc']) {
      expect(
        screen.getByRole('button', { name: `Cor de destaque ${cor}` }),
      ).toBeInTheDocument()
    }
  })

  it('com o modal aberto, os atalhos do painel ficam quietos (RF-07.2)', async () => {
    await enfileirar('Ana', 'https://youtu.be/dQw4w9WgXcQ')
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Tocar Ana' }))
    await painel.advance(FADE_MS)

    await u.click(screen.getByRole('button', { name: 'Configurações' }))
    await u.keyboard('s')

    expect(painel.store.getState().mode).toBe('main')
  })
})

describe('o rodapé de atalhos (RF-07.3)', () => {
  it('lista exatamente as teclas que funcionam', () => {
    const rodape = screen.getByText('ATALHOS').parentElement as HTMLElement

    for (const tecla of ['Espaço', 'B', 'S', 'N', 'M', '1', '2', '3']) {
      expect(within(rodape).getByText(tecla)).toBeInTheDocument()
    }
  })
})

describe('o painel sob StrictMode (como o main.tsx monta)', () => {
  it('continua tocando depois da remontagem que o StrictMode força', async () => {
    // O StrictMode monta, desmonta e monta de novo de propósito. Um motor de
    // áudio que não sobrevive a isso deixa o `npm run dev` **mudo** — com todos
    // os outros testes passando, porque a Testing Library não usa StrictMode.
    painel.unmount()
    painel = await montarPainel({ pollMs: 60_000, strict: true })
    const u = user()

    await u.type(screen.getByLabelText('Nome da pessoa'), 'Ana')
    await u.type(
      screen.getByLabelText('Link do YouTube'),
      'https://youtu.be/dQw4w9WgXcQ',
    )
    await u.click(screen.getByRole('button', { name: /Adicionar/ }))
    await u.click(screen.getByRole('button', { name: 'Tocar Ana' }))

    expect(painel.players.main().loads).toEqual(['dQw4w9WgXcQ'])
    await painel.advance(FADE_MS)
    expect(painel.players.main().volume).toBeCloseTo(0.8, 2)
  })
})

describe('a topbar acompanha o som, não o clique', () => {
  it('continua anunciando o louvor enquanto o volume desce', async () => {
    await enfileirar('Ana', 'https://youtu.be/dQw4w9WgXcQ')
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Tocar Ana' }))
    await painel.advance(FADE_MS)

    await u.keyboard('s')

    // Metade da descida: o som já caiu pela metade, a tela ainda diz LOUVOR.
    await painel.advance(FADE_MS / 2)
    expect(noAr()).toContain('NO AR')
    expect(noAr()).toContain('LOUVOR')

    await painel.advance(FADE_MS / 2)
    expect(noAr()).toContain('STANDBY')
  })
})

describe('cadastrar fundo colando o link (sem depender da busca)', () => {
  /** A lista da biblioteca. O nome da faixa também aparece na topbar e no deck
      A, então a busca por texto precisa ser feita dentro dela. */
  function biblioteca(): HTMLElement {
    return painel.container.querySelector('.background-list') as HTMLElement
  }

  /** Vai para a aba Fundos e cadastra uma faixa pelo link. */
  async function cadastrarFundo(nome: string, url: string): Promise<void> {
    const u = user()
    await u.keyboard('3')
    await u.type(screen.getByLabelText('Nome do fundo'), nome)
    await u.type(screen.getByLabelText('Link do fundo no YouTube'), url)
    await u.click(screen.getByRole('button', { name: /Adicionar/ }))
  }

  it('a primeira faixa entra na biblioteca e já começa a tocar (RF-03.4)', async () => {
    await cadastrarFundo('Piano do culto', 'https://youtu.be/M7lc1UVf-VE')

    expect(within(biblioteca()).getByText('Piano do culto')).toBeInTheDocument()
    expect(painel.players.background().videos).toEqual(['M7lc1UVf-VE'])

    await painel.advance(FADE_MS)
    expect(noAr()).toContain('FUNDO')
    expect(painel.players.background().volume).toBeCloseTo(0.4, 2)
  })

  it('recusa link que não é do YouTube', async () => {
    await cadastrarFundo('Qualquer coisa', 'meu fundo favorito')

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Não reconheci esse link/,
    )
    expect(painel.store.getState().backgrounds).toHaveLength(0)
  })

  it('sem nome, a faixa entra como "Fundo musical"', async () => {
    const u = user()
    await u.keyboard('3')
    await u.type(
      screen.getByLabelText('Link do fundo no YouTube'),
      'https://youtu.be/M7lc1UVf-VE',
    )
    await u.click(screen.getByRole('button', { name: /Adicionar/ }))

    expect(within(biblioteca()).getByText('Fundo musical')).toBeInTheDocument()
  })

  it('destrava o resto da aba: tecla B desliga e religa o fundo', async () => {
    await cadastrarFundo('Piano do culto', 'https://youtu.be/M7lc1UVf-VE')
    await painel.advance(FADE_MS)
    const u = user()

    await u.keyboard('b')
    await painel.advance(FADE_MS)
    expect(noAr()).toContain('STANDBY')
    expect(painel.players.background().volume).toBe(0)

    await u.keyboard('b')
    await painel.advance(FADE_MS)
    expect(noAr()).toContain('FUNDO')
    expect(painel.players.background().volume).toBeCloseTo(0.4, 2)
  })

  it('com duas faixas, a tecla M mixa para a seguinte (RF-03.5)', async () => {
    await cadastrarFundo('Piano do culto', 'https://youtu.be/M7lc1UVf-VE')
    await cadastrarFundo('Pads de oração', 'https://youtu.be/9bZkp7q19f0')
    await painel.advance(FADE_MS)

    await user().keyboard('m')
    await painel.advance(FADE_MS * 2)

    expect(painel.players.background().videos.at(-1)).toBe('9bZkp7q19f0')
  })
})

describe('o player que não conseguiu nascer (RNF-03.4)', () => {
  /** O aviso vermelho embaixo da pré-escuta. */
  function aviso(): HTMLElement | null {
    return painel.container.querySelector('.player-error')
  }

  it('avisa o operador e oferece uma nova tentativa — sem recarregar a página', async () => {
    painel.unmount()
    // Dois: um para cada canal. É o painel que abre sem rede nenhuma.
    painel = await montarPainel({ pollMs: 60_000, falharProximas: 2 })

    expect(aviso()).toHaveTextContent(/Verifique a conexão com a internet/i)

    // O operador liga o hotspot do celular e aperta o botão.
    await user().click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await painel.flush()

    expect(aviso()).toBeNull()

    // E o painel volta a funcionar de verdade, não só a parecer curado.
    await enfileirar('Ana', 'https://youtu.be/dQw4w9WgXcQ')
    await user().click(screen.getByRole('button', { name: 'Tocar Ana' }))
    await painel.advance(FADE_MS)

    expect(painel.players.main().loads).toEqual(['dQw4w9WgXcQ'])
    expect(painel.players.main().volume).toBeCloseTo(0.8, 2)
  })

  it('não oferece nova tentativa para erro que insistir não conserta', async () => {
    await enfileirar('Ana', 'https://youtu.be/dQw4w9WgXcQ')
    await user().click(screen.getByRole('button', { name: 'Tocar Ana' }))

    // 101: o dono não permite reprodução fora do YouTube. A saída é trocar de
    // vídeo — um botão de "tentar de novo" aqui só faria o operador perder
    // tempo no meio do culto.
    await painel.fora(() => {
      painel.players.main().emitError(101, 'O dono não permite reprodução.')
    })

    expect(aviso()).toHaveTextContent('O dono não permite reprodução.')
    expect(
      screen.queryByRole('button', { name: 'Tentar de novo' }),
    ).not.toBeInTheDocument()
  })
})

describe('colar link preenche o título pelo oEmbed (RF-01.2)', () => {
  const INFO = {
    id: 'dQw4w9WgXcQ',
    title: 'Porque Ele Vive - Harpa Cristã',
    channel: 'Canal do Louvor',
    duration: 253,
    embeddable: true,
  }

  function servidorResponde(body: unknown, status = 200) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('o item entra na hora e o título desce por cima quando a rede responde', async () => {
    servidorResponde(INFO)

    await enfileirar('Ana', 'https://youtu.be/dQw4w9WgXcQ')

    // Não espera a rede: a linha já está lá com o rótulo genérico.
    expect(screen.getByText('Ana')).toBeInTheDocument()

    await painel.flush()
    expect(
      await screen.findByText('Porque Ele Vive - Harpa Cristã'),
    ).toBeInTheDocument()
    // E a duração vem junto, sem precisar tocar o vídeo primeiro.
    expect(painel.store.getState().queue[0]?.durationSec).toBe(253)
  })

  it('avisa que o vídeo não toca fora do YouTube antes do culto (RF-01.3)', async () => {
    servidorResponde({ ...INFO, embeddable: false })

    await enfileirar('Ana', 'https://youtu.be/dQw4w9WgXcQ')
    await painel.flush()

    expect(
      await screen.findByTitle('Este vídeo não toca fora do YouTube'),
    ).toBeInTheDocument()
  })

  it('sem o endpoint no servidor, o item continua na fila e tocável', async () => {
    servidorResponde({ error: 'não existe' }, 404)

    await enfileirar('Ana', 'https://youtu.be/dQw4w9WgXcQ')
    await painel.flush()

    // Rótulo genérico, mas o culto não depende disso.
    expect(screen.getByText('Vídeo do YouTube')).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Tocar Ana' }))
    expect(painel.players.main().loads).toEqual(['dQw4w9WgXcQ'])
  })
})

describe('os faders (RF-05.1, RF-05.6)', () => {
  it('Shift + setas mexem o master, setas secas mexem o fundo', async () => {
    const u = user()

    await u.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}')

    expect(
      screen.getByRole('slider', { name: 'Volume MASTER' }),
    ).toHaveAttribute('aria-valuenow', '70')
    // E o fundo não se mexeu junto.
    expect(
      screen.getByRole('slider', { name: 'Volume FUNDO' }),
    ).toHaveAttribute('aria-valuenow', '40')

    await u.keyboard('{ArrowUp}')
    expect(
      screen.getByRole('slider', { name: 'Volume MASTER' }),
    ).toHaveAttribute('aria-valuenow', '70')
    expect(
      screen.getByRole('slider', { name: 'Volume FUNDO' }),
    ).toHaveAttribute('aria-valuenow', '45')
  })

  it('o master também vai ao som, não só ao número', async () => {
    await enfileirar('Ana', 'https://youtu.be/dQw4w9WgXcQ')
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Tocar Ana' }))
    await painel.advance(FADE_MS)
    expect(painel.players.main().volume).toBeCloseTo(0.8, 2)

    await u.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}')
    await painel.advance(FADE_MS)

    expect(painel.players.main().volume).toBeCloseTo(0.7, 2)
  })
})

describe('foco no fader não duplica o passo da seta', () => {
  it('com o fader focado, a seta anda 5 — não 10', async () => {
    const u = user()
    const fundo = screen.getByRole('slider', { name: 'Volume FUNDO' })
    fundo.focus()

    await u.keyboard('{ArrowUp}')

    // O onKeyDown do fader e o atalho global respondem à mesma tecla; sem a
    // guarda, os dois somavam e o volume pulava o dobro.
    expect(fundo).toHaveAttribute('aria-valuenow', '45')
  })

  it('e o master focado também anda 5', async () => {
    const u = user()
    const master = screen.getByRole('slider', { name: 'Volume MASTER' })
    master.focus()

    await u.keyboard('{ArrowDown}')

    expect(master).toHaveAttribute('aria-valuenow', '75')
    // Sem mexer no fundo de tabela.
    expect(
      screen.getByRole('slider', { name: 'Volume FUNDO' }),
    ).toHaveAttribute('aria-valuenow', '40')
  })
})

describe('o primeiro arranque (setup do nome da igreja)', () => {
  async function primeiroArranque() {
    painel.unmount()
    painel = await montarPainel({ pollMs: 60_000, primeiroArranque: true })
  }

  it('não aparece para quem já configurou', () => {
    // O painel padrão dos testes já é um app usado — e o que ele NÃO pode
    // fazer é piscar a tela de boas-vindas antes do IndexedDB responder.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(noAr()).toContain('STANDBY')
  })

  it('aparece no primeiro arranque e salva o nome na topbar', async () => {
    await primeiroArranque()

    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveTextContent('Bem-vindo ao CronoApp')

    const u = user()
    await u.type(
      screen.getByLabelText('Nome da igreja'),
      'Igreja Batista Central',
    )
    await u.click(screen.getByRole('button', { name: 'Começar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(painel.container.querySelector('.brand')).toHaveTextContent(
      'Igreja Batista Central',
    )
    expect(painel.store.getState().preferences.churchName).toBe(
      'Igreja Batista Central',
    )
  })

  it('"Agora não" fecha e não volta a perguntar', async () => {
    await primeiroArranque()

    await user().click(screen.getByRole('button', { name: 'Agora não' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // A marca de "já perguntei" é o que impede a tela de voltar toda vez que o
    // operador abrir o painel sem ter dado nome.
    expect(painel.store.getState().preferences.setupDone).toBe(true)
    expect(painel.store.getState().preferences.churchName).toBe('')
  })

  it('com a tela aberta, os atalhos do painel ficam quietos (RF-07.2)', async () => {
    await primeiroArranque()
    const u = user()
    await u.type(screen.getByLabelText('Nome da igreja'), 'Betel')

    // "s" pararia o louvor e "3" trocaria de aba se os atalhos estivessem vivos.
    expect(screen.getByLabelText('Nome da igreja')).toHaveValue('Betel')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('sem nome, a topbar fica exatamente como era', async () => {
    await primeiroArranque()
    await user().click(screen.getByRole('button', { name: 'Agora não' }))

    expect(
      painel.container.querySelector('.brand-church'),
    ).not.toBeInTheDocument()
  })

  it('dá para trocar o nome depois, nas configurações', async () => {
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Configurações' }))

    await u.type(screen.getByLabelText('Nome da igreja'), 'Betel')

    expect(painel.store.getState().preferences.churchName).toBe('Betel')
    expect(painel.container.querySelector('.brand')).toHaveTextContent('Betel')
  })
})
