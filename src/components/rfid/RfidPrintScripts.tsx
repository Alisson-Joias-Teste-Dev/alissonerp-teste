"use client";

import Script from "next/script";

/**
 * Carrega o SDK do Zebra Browser Print (BrowserPrint + BrowserPrint-Zebra)
 * uma única vez para o app inteiro.
 *
 * Antes, cada tela que precisava imprimir etiqueta RFID (ex.: cadastro)
 * declarava os próprios <Script>. Agora o carregamento vive no layout do
 * dashboard (`src/app/(dashboard)/layout.tsx`) e este componente é
 * seguro de renderizar uma única vez ali — o Next dedupa por `src`, então
 * mesmo que algum consumidor futuro monte este componente de novo não há
 * duplicação real de tags <script> no DOM.
 */
export function RfidPrintScripts() {
  return (
    <>
      <Script
        src="/browser-print/BrowserPrint-3.1.250.min.js"
        strategy="afterInteractive"
      />
      <Script
        src="/browser-print/BrowserPrint-Zebra-1.1.250.min.js"
        strategy="afterInteractive"
      />
    </>
  );
}
