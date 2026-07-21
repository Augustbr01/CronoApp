# `youtube/` — integração com o YouTube

- **Wrapper da IFrame Player API** com interface própria: carregar, tocar,
  pausar, definir volume, consultar estado, reportar erro. Substitui o
  `react-player` — é aqui que os ~1,4 MB de HLS/DASH desaparecem.
- **Cliente de busca** para o backend `GET /api/youtube/search` (implementação
  única e parametrizada — RNF-01.3).
- **oEmbed** para título e duração ao colar um link (RF-01.2).

> Wrapper preenchido na **Etapa 2**; cliente de busca e oEmbed na **Etapa 5**.
