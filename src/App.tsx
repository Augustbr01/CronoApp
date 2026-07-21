/**
 * Shell mínimo do CronoApp.
 *
 * A UI real (topbar NO AR/STANDBY, abas Fila/Buscar/Fundos, mixer) é
 * reconstruída na Etapa 4, sobre o motor de áudio (Etapa 2) e o store
 * (Etapa 3). Por ora, apenas confirma que a fundação monta e renderiza.
 */
export default function App() {
  return (
    <main className="app-shell">
      <h1>CronoApp</h1>
      <p>Painel de operação de som para culto ao vivo.</p>
    </main>
  )
}
