import { isVideoUrl, parseVideoId, watchUrl } from './video-id'

const ID = 'dQw4w9WgXcQ'

describe('parseVideoId', () => {
  it('aceita o id puro', () => {
    expect(parseVideoId(ID)).toBe(ID)
  })

  it('aceita o link normal da barra de endereço', () => {
    expect(parseVideoId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it('ignora os parâmetros que o botão compartilhar gruda no fim', () => {
    expect(parseVideoId(`https://youtu.be/${ID}?si=abc123&t=42`)).toBe(ID)
    expect(
      parseVideoId(`https://www.youtube.com/watch?v=${ID}&list=PL123&index=2`),
    ).toBe(ID)
  })

  it('aceita as outras formas de link', () => {
    expect(parseVideoId(`https://www.youtube.com/embed/${ID}`)).toBe(ID)
    expect(parseVideoId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID)
    expect(parseVideoId(`https://www.youtube.com/live/${ID}`)).toBe(ID)
    expect(parseVideoId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID)
    expect(parseVideoId(`https://music.youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it('aceita colagem sem protocolo e com espaços em volta', () => {
    expect(parseVideoId(`  youtube.com/watch?v=${ID}  `)).toBe(ID)
    expect(parseVideoId(`youtu.be/${ID}`)).toBe(ID)
  })

  it('recusa o que não é vídeo do YouTube', () => {
    expect(parseVideoId('')).toBeNull()
    expect(parseVideoId('   ')).toBeNull()
    expect(parseVideoId('https://vimeo.com/123456')).toBeNull()
    expect(parseVideoId('https://www.youtube.com/')).toBeNull()
    expect(parseVideoId('https://www.youtube.com/@canal')).toBeNull()
    // Playlist não é vídeo: não há o que tocar.
    expect(
      parseVideoId('https://www.youtube.com/playlist?list=PL123'),
    ).toBeNull()
    // Id com tamanho errado é erro de digitação, não vídeo.
    expect(parseVideoId('abc')).toBeNull()
    expect(parseVideoId(`https://youtu.be/${ID}extra`)).toBeNull()
  })
})

describe('isVideoUrl', () => {
  it('responde se dá para tocar o que foi colado', () => {
    expect(isVideoUrl(`https://youtu.be/${ID}`)).toBe(true)
    expect(isVideoUrl('bom dia')).toBe(false)
  })
})

describe('watchUrl', () => {
  it('monta o endereço público do vídeo', () => {
    expect(watchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`)
  })
})
