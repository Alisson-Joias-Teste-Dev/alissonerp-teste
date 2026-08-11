SDK Zebra Browser Print — vendorizado (não versionado no repo).

PARA INSTALAR:
1. Baixar o instalador do Browser Print v1.3+:
   https://www.zebra.com/us/en/support-downloads/printer-software/printer-setup-utilities/browser-print.html

2. Instalar no PC da loja (Windows).

3. Copiar os arquivos JS da pasta de instalação para cá:
   - BrowserPrint-3.x.x.min.js
   - BrowserPrint-Zebra-1.x.x.min.js
   (geralmente em C:\Program Files (x86)\Zebra Technologies\Browser Print\)

4. No PC da loja, abrir o app Zebra Browser Print e adicionar o domínio
   do ERP em "Approved Hosts" (ex: alisson.api.br).

5. O SDK é carregado via <Script> no componente que usa Browser Print.
   A exposição window.BrowserPrint é consumida por lib/rfid/browser-print.ts.

   Exemplo de uso:
   import Script from "next/script";
   <Script src="/browser-print/BrowserPrint-3.x.x.min.js" strategy="afterInteractive" />
   <Script src="/browser-print/BrowserPrint-Zebra-1.x.x.min.js" strategy="afterInteractive" />

REFERÊNCIAS:
- doc-zebra-zd500r-devtools.md seção 4 (Browser Print, portas, mixed content)
- Browser Print User Guide v1.3 (2020)
