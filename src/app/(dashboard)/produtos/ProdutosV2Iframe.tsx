"use client";

import { useEffect, useRef } from "react";

interface Props {
  /** Origem do V2, ex.: "https://v2.alissonjoias.com.br" (sem barra no fim). */
  urlV2: string;
  /** Caminho a abrir dentro do V2, ex.: "/produtos/1511" ou "/produtos". */
  path: string;
}

/**
 * Iframe do V2 (`/produtos`) + a ponte que mantém a URL do V1 sincronizada
 * com a rota interna do V2.
 *
 * 🔴 POR QUE ISSO EXISTE — sem ele, refrescar a página ou copiar o link SEMPRE
 * voltava para `/produtos` (a lista), mesmo com um produto aberto: o React
 * Router do V2 troca a rota DENTRO do iframe (`/produtos/1511`), mas a barra
 * de endereço que a pessoa vê é a desta página, que nunca muda sozinha.
 *
 * V1 e V2 são origens diferentes (subdomínios different de alissonjoias.com.br)
 * — só "mesmo site" pro cookie de sessão, não mesma origem. Por isso não dá
 * pra ler/escrever `iframeRef.current.contentWindow.location` direto (o
 * navegador bloqueia, cross-origin); a única ponte permitida é `postMessage`.
 *
 * O lado que MANDA a mensagem é `AppShell.tsx` no `erp_front` (repo do V2) —
 * a cada troca de rota lá dentro, ele posta
 * `{ tipo: "v2:rota", path: "/produtos/1511" }` para `document.referrer`
 * (esta página). Aqui só falta ESCUTAR e trocar a URL com
 * `history.replaceState` — sem isso a barra de endereço não muda.
 *
 * `replaceState` (não `pushState`) de propósito: cada clique já virou uma
 * entrada de histórico DENTRO do V2 (o React Router de lá cuida disso); se
 * este lado também empilhasse, o botão "Voltar" do navegador precisaria de
 * dois cliques pra sair de cada produto.
 */
export default function ProdutosV2Iframe({ urlV2, path }: Props) {
  const origemV2Ref = useRef<string | null>(null);
  if (origemV2Ref.current === null) {
    try {
      origemV2Ref.current = new URL(urlV2).origin;
    } catch {
      origemV2Ref.current = "";
    }
  }

  useEffect(() => {
    const origemV2 = origemV2Ref.current;
    if (!origemV2) return;

    function onMessage(evento: MessageEvent) {
      if (evento.origin !== origemV2) return;
      const dados = evento.data as { tipo?: unknown; path?: unknown } | null;
      if (!dados || dados.tipo !== "v2:rota" || typeof dados.path !== "string") return;
      // Só aceita rota dentro de `/produtos` — esta página não é dona de mais
      // nada, e uma mensagem malformada não pode levar a barra de endereço
      // pra fora daqui.
      if (!dados.path.startsWith("/produtos")) return;
      if (window.location.pathname === dados.path) return;
      window.history.replaceState(null, "", dados.path);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    // 🔴 A ALTURA NAO E CHUTE — ela copia os deslocamentos do proprio V1.
    // O <main> que envolve esta pagina tem `mt-14 md:mt-0` (56px de topo no
    // celular, zero no desktop). O primeiro palpite foi `calc(100vh - 120px)`,
    // e o resultado foi tela cortada com espaco morto embaixo: o iframe menor
    // que a area, e a rolagem acontecendo DENTRO dele.
    //
    // `block` tira o espaco de linha-de-texto que o iframe herda por ser
    // inline por padrao — sem isso sobram alguns pixels no rodape.
    <iframe
      src={`${urlV2}${path}?embutido=1`}
      title="Produtos (V2)"
      className="block w-full border-0 h-[calc(100vh-3.5rem)] md:h-screen"
    />
  );
}
