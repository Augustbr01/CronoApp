# `audio/` — motor de mixagem

Lógica pura de reprodução e mixagem. **Não conhece React, não conhece o
store, não conhece a UI.**

Cobre o RF-04 inteiro:

- Fade in/out por canal (genérico, sem duplicar `main`/`bg`).
- Crossfade de potência constante (RF-04.6).
- Suavização exponencial do fader por frame (RF-04.7).
- Composição de volume `fader suavizado × fator de fade` + mute binário (RF-04.8).
- Snap-to-mute abaixo de 3% (RF-04.9) e cancelamento de fade (RF-04.10).

As curvas de fade e a composição de volume são funções puras sobre tempo e
valores — testáveis com timers falsos, sem DOM.

> Preenchido na **Etapa 2**.
