import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { WebSocketServer } from "ws";
import http from "http";

const PORT = process.env.TSL_PORT || "COM3";
const BAUD = parseInt(process.env.TSL_BAUD || "115200", 10);
const WS_PORT = parseInt(process.env.WS_PORT || "9101", 10);
const RETRY_DELAY = parseInt(process.env.TSL_RETRY || "5000", 10);
const MAX_RETRIES = 0; // 0 = infinite

let port = null;
let wss = null;
let httpServer = null;
let scanning = false;
let retryTimer = null;
let retryCount = 0;

function broadcast(data) {
  if (!wss) return;
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

function hexToAscii(hex) {
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substring(i, i + 2), 16);
    if (isNaN(code)) break;
    out += String.fromCharCode(code);
  }
  return out;
}

function isPrintable(str) {
  return /^[\x20-\x7E]+$/.test(str);
}

function parseLine(line) {
  const clean = line.startsWith("#") ? line.slice(1) : line.trim();

  if (clean.startsWith("EP:")) {
    const raw = clean.slice(3).replace(/[^0-9A-Fa-f]/g, "");
    if (raw.length < 6) return null;

    // Tenta decodificar hex → ASCII
    const decoded = hexToAscii(raw);
    const trimmed = decoded.replace(/\0/g, "").trim();

    // Se parecer um EPC AJ válido (só caracteres imprimíveis, começa com AJ)
    if (trimmed.startsWith("AJ") && isPrintable(trimmed) && trimmed.length >= 8) {
      console.log(`[EPC] AJ=${trimmed}  hex=${raw}  len=${raw.length}`);
      return { type: "epc", epc: trimmed };
    }

    // Tenta sem os 2 primeiros bytes (PC bits — protocol control)
    if (raw.length > 8) {
      const stripped = hexToAscii(raw.slice(4)).replace(/\0/g, "").trim();
      if (stripped.startsWith("AJ") && isPrintable(stripped) && stripped.length >= 8) {
        console.log(`[EPC] AJ(pc_strip)=${stripped}  hex_no_pc=${raw.slice(4)}  raw_len=${raw.length}`);
        return { type: "epc", epc: stripped };
      }
    }

    // Tenta decodificar o hex puro como ASCII (tags com EPC em texto)
    const ascii = raw.length % 2 === 0 ? hexToAscii(raw).replace(/\0/g, "").trim() : "";
    if (ascii.length >= 4 && /^\d+$/.test(ascii)) {
      console.log(`[EPC] ASCII=${ascii}  hex=${raw}`);
      return { type: "epc", epc: ascii };
    }

    // Fallback: retorna o hex puro
    console.log(`[EPC] RAW_HEX=${raw}`);
    return { type: "epc", epc: raw };
  }

  if (clean.startsWith("IV:")) {
    const status = clean.slice(3).trim();
    if (status === "OK" || status.startsWith("OK")) {
      scanning = true;
      broadcast({ type: "inventory_status", status: "started" });
    } else if (status === "STOP") {
      scanning = false;
      broadcast({ type: "inventory_status", status: "stopped" });
    }
    return null;
  }

  if (clean.startsWith("VR:")) {
    broadcast({ type: "firmware", version: clean.slice(3).trim() });
    return null;
  }

  if (clean.startsWith("ER:")) {
    broadcast({ type: "error", message: clean.slice(3).trim() });
    return null;
  }

  return null;
}

function sendToReader(cmd) {
  if (!port || !port.isOpen) return;
  port.write(cmd + "\r");
}

async function connectSerial() {
  if (retryTimer) clearTimeout(retryTimer);
  if (port && port.isOpen) return;

  try {
    const list = await SerialPort.list();
    const match = list.find((p) => p.path.toUpperCase() === PORT.toUpperCase());

    if (!match) {
      retryCount++;
      const msg = `Porta ${PORT} nao encontrada (tentativa ${retryCount}). Portas: ${list.map(p => p.path).join(", ")}`;
      console.warn(`[tsl-bridge] ${msg}`);
      broadcast({ type: "status", connected: false, message: msg });
      retryTimer = setTimeout(connectSerial, RETRY_DELAY);
      return;
    }

    retryCount = 0;
    console.log(`[tsl-bridge] Porta ${PORT} encontrada. Abrindo...`);

    port = new SerialPort({
      path: PORT,
      baudRate: BAUD,
      dataBits: 8,
      parity: "none",
      stopBits: 1,
      rtscts: true,
      autoOpen: false,
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

    port.on("open", () => {
      console.log(`[tsl-bridge] Conectado em ${PORT} @ ${BAUD} baud RTS/CTS`);
      broadcast({ type: "status", connected: true, port: PORT, baud: BAUD });
      setTimeout(() => sendToReader(".vr"), 1000);
    });

    parser.on("data", (line) => {
      const parsed = parseLine(line);
      if (parsed) broadcast(parsed);
    });

    port.on("error", (err) => {
      console.error(`[tsl-bridge] Erro na porta: ${err.message}`);
      broadcast({ type: "status", connected: false, error: err.message });
      cleanupPort();
      retryTimer = setTimeout(connectSerial, RETRY_DELAY);
    });

    port.on("close", () => {
      console.log("[tsl-bridge] Porta fechada");
      broadcast({ type: "status", connected: false });
      cleanupPort();
      retryTimer = setTimeout(connectSerial, RETRY_DELAY);
    });

    port.open((err) => {
      if (err) {
        console.error(`[tsl-bridge] Falha ao abrir ${PORT}: ${err.message}`);
        console.error(`[tsl-bridge] Pressione o gatilho do leitor para acorda-lo e reconecte o Bluetooth.`);
        broadcast({ type: "status", connected: false, error: err.message });
        cleanupPort();
        retryTimer = setTimeout(connectSerial, RETRY_DELAY);
      }
    });
  } catch (err) {
    console.error(`[tsl-bridge] Falha ao conectar: ${err.message}`);
    broadcast({ type: "status", connected: false, error: err.message });
    retryTimer = setTimeout(connectSerial, RETRY_DELAY);
  }
}

function cleanupPort() {
  try { if (port && port.isOpen) port.close(); } catch { }
  port = null;
  scanning = false;
}

function startServer() {
  httpServer = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        service: "tsl-bridge",
        ws_port: WS_PORT,
        connected: port?.isOpen ?? false,
        scanning,
        port_name: PORT,
      }));
      return;
    }

    if (req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        connected: port?.isOpen ?? false,
        scanning,
        port: PORT,
        firmware: null,
      }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  wss = new WebSocketServer({ server: httpServer });

  httpServer.listen(WS_PORT, () => {
    console.log(`[tsl-bridge] Servidor em http://localhost:${WS_PORT}`);
    console.log(`[tsl-bridge] WebSocket em ws://localhost:${WS_PORT}`);
    console.log(`[tsl-bridge] Tentando conectar em ${PORT} @ ${BAUD} baud`);
    console.log(`[tsl-bridge] Para trocar de porta: TSL_PORT=COM3 npm run tsl-bridge`);
  });

  wss.on("connection", (ws) => {
    console.log("[tsl-bridge] Navegador conectado ao WebSocket");

    ws.send(JSON.stringify({
      type: "status",
      ws_connected: true,
      ws_port: WS_PORT,
      connected: port?.isOpen ?? false,
      port: PORT,
      scanning,
    }));

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.cmd) {
        case "inventory_start":
          sendToReader(".iv");
          break;
        case "inventory_stop":
          sendToReader(".");
          break;
        case "status":
          ws.send(JSON.stringify({ type: "status", connected: port?.isOpen ?? false, scanning }));
          break;
        case "reconnect":
          cleanupPort();
          setTimeout(connectSerial, 500);
          break;
      }
    });
  });
}

function cleanup() {
  console.log("\n[tsl-bridge] Encerrando...");
  if (retryTimer) clearTimeout(retryTimer);
  cleanupPort();
  if (wss) wss.close();
  if (httpServer) httpServer.close();
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

startServer();
setTimeout(connectSerial, 500);

console.log(`[tsl-bridge] ========================================`);
console.log(`[tsl-bridge] TSL 1128 Bridge iniciado`);
console.log(`[tsl-bridge] Porta: ${PORT}`);
console.log(`[tsl-bridge] WebSocket: ws://localhost:${WS_PORT}`);
console.log(`[tsl-bridge] ========================================`);
console.log(`[tsl-bridge] `);
console.log(`[tsl-bridge] ANTES DE USAR, CERTIFIQUE-SE DE:`);
console.log(`[tsl-bridge] 1. Leitor TSL 1128 ligado (LED azul)  `);
console.log(`[tsl-bridge] 2. Pressione o gatilho para acordar  `);
console.log(`[tsl-bridge] 3. No Windows: Config > Bluetooth > `);
console.log(`[tsl-bridge]    "001116-BR-1128" deve estar como `);
console.log(`[tsl-bridge]    "Conectado" (nao apenas "Pareado")`);
console.log(`[tsl-bridge] `);
