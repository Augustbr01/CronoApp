import { PLAYER_ERROR, describePlayerError } from './errors'

describe('describePlayerError', () => {
  it('trata link inválido como fatal', () => {
    const erro = describePlayerError(PLAYER_ERROR.INVALID_PARAMETER)

    expect(erro.code).toBe(2)
    expect(erro.fatal).toBe(true)
    expect(erro.message).toMatch(/inválido/i)
  })

  it('trata falha do player HTML5 como recuperável', () => {
    const erro = describePlayerError(PLAYER_ERROR.HTML5)

    expect(erro.fatal).toBe(false)
    expect(erro.message).toMatch(/tente de novo/i)
  })

  it('trata vídeo removido ou privado como fatal', () => {
    const erro = describePlayerError(PLAYER_ERROR.NOT_FOUND)

    expect(erro.fatal).toBe(true)
    expect(erro.message).toMatch(/removido|privado/i)
  })

  it('dá a mesma resposta para os dois códigos de reprodução bloqueada', () => {
    const bloqueado = describePlayerError(PLAYER_ERROR.EMBED_BLOCKED)
    const alias = describePlayerError(PLAYER_ERROR.EMBED_BLOCKED_ALIAS)

    expect(bloqueado.message).toBe(alias.message)
    expect(bloqueado.fatal).toBe(true)
    expect(alias.fatal).toBe(true)
    expect(bloqueado.message).toMatch(/outra versão/i)
  })

  it('mantém o código de origem em cada erro traduzido', () => {
    expect(describePlayerError(101).code).toBe(101)
    expect(describePlayerError(150).code).toBe(150)
  })

  it('não declara perdido um vídeo por um código desconhecido', () => {
    const erro = describePlayerError(999)

    expect(erro.code).toBe(999)
    expect(erro.fatal).toBe(false)
    expect(erro.message).toContain('999')
  })

  it('sempre devolve uma mensagem em português, nunca um número seco', () => {
    for (const code of [2, 5, 100, 101, 150, 7, 42]) {
      const { message } = describePlayerError(code)
      expect(message.length).toBeGreaterThan(20)
      expect(message).toMatch(/[a-z]/i)
    }
  })
})
