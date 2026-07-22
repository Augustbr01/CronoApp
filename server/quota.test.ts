import {
  DAILY_QUOTA_UNITS,
  QUOTA_COST,
  createQuotaLedger,
  quotaDay,
} from './quota'

describe('contador da cota diária', () => {
  it('gasta enquanto cabe e recusa quando não cabe', () => {
    const ledger = createQuotaLedger({ dailyLimit: 250, reserve: 0 })

    expect(ledger.spend(QUOTA_COST.SEARCH)).toBe(true)
    expect(ledger.spend(QUOTA_COST.SEARCH)).toBe(true)
    expect(ledger.spend(QUOTA_COST.SEARCH)).toBe(false)
    // Recusar não pode cobrar: o gasto tem que continuar em 200.
    expect(ledger.remaining()).toBe(50)
  })

  it('a reserva mantém vivo o que é barato depois que o caro acabou', () => {
    const ledger = createQuotaLedger({ dailyLimit: 300, reserve: 200 })
    expect(ledger.spend(QUOTA_COST.SEARCH)).toBe(true)

    // Outra busca não cabe: passaria da linha da reserva.
    expect(ledger.spend(QUOTA_COST.SEARCH)).toBe(false)
    // Mas ler a duração de um link colado, que custa 1, continua passando.
    expect(ledger.spend(QUOTA_COST.VIDEO_DETAILS, { reservable: false })).toBe(
      true,
    )
  })

  it('zera quando vira o dia no fuso do Pacífico, não no nosso', () => {
    // 03:00 de Brasília é ainda o dia anterior na Califórnia: contar pelo dia
    // local zeraria a cota na manhã de domingo, com o culto em andamento.
    const sabadoTarde = Date.parse('2026-07-25T22:00:00-07:00')
    let agora = sabadoTarde
    const ledger = createQuotaLedger({
      dailyLimit: 100,
      reserve: 0,
      now: () => agora,
    })
    expect(ledger.spend(100)).toBe(true)
    expect(ledger.spend(1)).toBe(false)

    // Uma hora depois ainda é o mesmo dia no Pacífico, embora já seja outro dia
    // no Brasil.
    agora += 60 * 60 * 1000
    expect(ledger.spend(1)).toBe(false)

    // Passada a meia-noite do Pacífico, aí sim.
    agora += 2 * 60 * 60 * 1000
    expect(ledger.spend(1)).toBe(true)
  })

  it('a conta bate com a tabela oficial: menos de cem buscas por dia', () => {
    // O número que justifica o cache e o limite por IP existirem.
    expect(Math.floor(DAILY_QUOTA_UNITS / QUOTA_COST.SEARCH)).toBe(100)
  })

  it('o dia da cota é uma data simples, comparável', () => {
    expect(quotaDay(Date.parse('2026-07-25T22:00:00-07:00'))).toBe('2026-07-25')
    expect(quotaDay(Date.parse('2026-07-26T00:30:00-07:00'))).toBe('2026-07-26')
  })
})
