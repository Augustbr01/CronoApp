/**
 * A assinatura de quem fez, no rodapé.
 *
 * O mark do GitHub vem desenhado à mão porque a versão do `lucide-react` usada
 * aqui não traz mais ícones de marca — e puxar um pacote inteiro de logos para
 * um único glifo pagaria KB de bundle (RNF-04.1) por nada.
 */

const PERFIL = 'https://github.com/Augustbr01'

/** O octogato do GitHub, no traço oficial, herdando a cor do texto. */
function GithubMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="currentColor"
      // Decorativo: quem lê por leitor de tela já recebe "Augusto Corrêa" no
      // texto do link, e "imagem: GitHub" no meio da frase só atrapalharia.
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

export function Credit() {
  return (
    <a
      className="credit"
      href={PERFIL}
      target="_blank"
      // `noreferrer` cobre também o `noopener`: sem ele, a página aberta ganha
      // acesso a esta pelo `window.opener`.
      rel="noreferrer"
    >
      {/* Os espaços são explícitos porque o `gap` do flexbox separa o que se
          **vê**, não o que se **lê**: sem eles o leitor de tela anuncia
          "Desenvolvido porAugusto Corrêa", tudo emendado. */}
      Desenvolvido por <GithubMark /> Augusto Corrêa
    </a>
  )
}
