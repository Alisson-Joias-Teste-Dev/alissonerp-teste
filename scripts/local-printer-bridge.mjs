/**
 * Bridge de impressao local para Zebra ZD500R
 *
 * Roda no Windows (mesma rede da impressora).
 * O frontend envia o ZPL pra este servidor, que manda pra impressora via TCP.
 *
 * Uso:
 *   node scripts/local-printer-bridge.mjs
 *   (opcional) --port 3456 --printer-ip 192.168.15.144 --printer-port 9100
 *
 * Endpoints:
 *   POST /print  { zpl: string }
 *   GET  /health
 */

import http from "http";
import net from "net";

const PORT = Number(process.argv.find((a) => a.startsWith("--port="))?.split("=")[1]) || 3456;
const PRINTER_IP =
  process.argv.find((a) => a.startsWith("--printer-ip="))?.split("=")[1] || "192.168.15.144";
const PRINTER_PORT =
  Number(process.argv.find((a) => a.startsWith("--printer-port="))?.split("=")[1]) || 9100;

function imprimirZpl(zpl) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(10000);
    socket.connect(PRINTER_PORT, PRINTER_IP, () => {
      socket.write(zpl, "utf8", () => {
        socket.end();
        resolve();
      });
    });
    socket.on("error", (err) => {
      socket.destroy();
      reject(new Error(`Erro conexao: ${err.message}`));
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Timeout ao conectar na impressora"));
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, printer: `${PRINTER_IP}:${PRINTER_PORT}` }));
    return;
  }

  if (req.method === "POST" && req.url === "/print") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { zpl } = JSON.parse(body);
        if (!zpl) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "zpl obrigatorio" }));
          return;
        }
        await imprimirZpl(zpl);
        console.log(`✅ Impresso em ${new Date().toLocaleTimeString()}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error("❌", err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🖨️  Bridge de impressao local rodando em http://0.0.0.0:${PORT}`);
  console.log(`   Impressora: ${PRINTER_IP}:${PRINTER_PORT}`);
  console.log(`   Envie POST /print com { "zpl": "...^XA..." }`);
  console.log(`   Teste: curl -X POST http://localhost:${PORT}/print -H "Content-Type: application/json" -d '{"zpl":"^XA^XZ"}'`);
});
