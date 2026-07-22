# `e2e/` — os testes que rodam o app de verdade

Os 397 testes de Vitest provam que a **lógica** está certa: o fade tem a curva
certa, o store guarda o que deve, o endpoint devolve o status certo. Eles rodam
em jsdom, com relógio falso e player falso.

Estes aqui provam outra coisa: que o **app está de pé**. Chromium de verdade,
bundle de produção, IndexedDB do navegador, CSS aplicado,
`requestAnimationFrame` medindo os fades em tempo real.

| Arquivo                                          | O que garante                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| [smoke.spec.ts](smoke.spec.ts)                   | O painel abre em standby. Quebrou aqui, não olhe o resto.              |
| [fluxo-critico.spec.ts](fluxo-critico.spec.ts)   | Buscar → fila → tocar → o fundo voltar sozinho (RNF-02.4).             |
| [acessibilidade.spec.ts](acessibilidade.spec.ts) | Auditoria do axe nos dois temas, foco no modal, região viva (RNF-05).  |
| [layout.spec.ts](layout.spec.ts)                 | Sem rolagem lateral de 1280 px para cima, e tablet inteiro (RNF-06.2). |
| [fake-youtube.ts](fake-youtube.ts)               | A única fronteira falsificada — ver abaixo.                            |

## A única coisa que é de mentira

O `window.YT`. Ele é instalado com `addInitScript`, **antes** do bundle carregar,
e por isso o `api-loader` do app nem chega a injetar o script do Google.

Duas razões, as duas práticas: depender do YouTube estar no ar transformaria a
suíte num detector de instabilidade da internet, e vídeo não toca num CI sem
placa de som.

Tudo o mais — store, motor de áudio, componentes, persistência, roteamento — é o
código de produção.

## Rodando

```bash
npm run test:e2e              # o Playwright faz o build e sobe o preview sozinho
npm run test:e2e -- --ui      # modo interativo, para investigar uma falha
npx playwright show-report    # o relatório da última execução
```

No CI eles rodam num job separado do `build`, com só o Chromium instalado — o
alvo declarado é Chrome desktop (ADR 0004), e baixar três navegadores para testar
um seria pagar minutos por nada.
