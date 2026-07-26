import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import * as matchers from '@testing-library/jest-dom/matchers'
import { cleanup } from '@testing-library/react'
import { afterEach, expect } from 'vitest'

// O jsdom não implementa IndexedDB, e a persistência do app é toda nele
// (ADR 0003). O `fake-indexeddb/auto` instala uma implementação em memória nos
// globais, para os testes exercitarem o armazenamento de verdade — abrir banco,
// gravar, reabrir — em vez de um dublê que só finge concordar.

// Registro dos matchers do jest-dom (toBeInTheDocument, etc.) para o Vitest.
//
// O import de '@testing-library/jest-dom/vitest' acima traz a TIPAGEM — ele
// aumenta a interface `Assertion` do vitest, dando os matchers já tipados. Mas
// o registro em runtime dele depende do `expect` global existir no instante
// exato do setup, o que abria uma corrida rara no primeiro arranque dos workers
// ("Invalid Chai property: toBeInTheDocument"). Estender de novo, com o `expect`
// importado explicitamente do vitest, fecha essa janela — é idempotente e
// determinístico.
expect.extend(matchers)

// Desmontar o que cada teste renderizou, **por arquivo**.
//
// Parece redundante — o `@testing-library/react` já registra este mesmo
// `afterEach` sozinho — mas com `isolate: false` (ver vite.config.ts) não é. O
// registro de módulos é compartilhado pelo worker, então o RTL é instanciado uma
// única vez e o hook que ele registra no import fica pendurado no contexto do
// **primeiro arquivo que o importou**. Todos os outros arquivos daquele worker
// rodam sem cleanup nenhum e vão empilhando containers no mesmo `document.body`.
//
// O sintoma era um `getByRole('button')` achando dois botões no
// ErrorBoundary.test.tsx, e só de vez em quando: qual arquivo importa o RTL
// primeiro depende da ordem, que o Vitest tira do cache de durações do run
// anterior e do número de núcleos da máquina. Passava no notebook e quebrava no
// CI de 2 núcleos.
//
// Hooks declarados aqui, ao contrário, valem para cada arquivo de teste (medido,
// não suposto: uma probe neste mesmo lugar disparou nos 58 testes de dois
// arquivos diferentes). Chamar `cleanup` duas vezes no arquivo que ganhou o
// registro do RTL é inofensivo — é idempotente.
//
// Para reproduzir a falha original, é preciso forçar a ordem ruim:
//   rm node_modules/.vite/vitest/*/results.json
//   npx vitest run src/App.test.tsx src/shared/ErrorBoundary.test.tsx --no-file-parallelism
afterEach(cleanup)
