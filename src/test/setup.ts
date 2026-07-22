import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import * as matchers from '@testing-library/jest-dom/matchers'
import { expect } from 'vitest'

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
