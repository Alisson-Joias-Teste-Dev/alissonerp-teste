import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import http from "http";

const PORT = process.env.TSL_PORT || "COM3";
const BAUD = parseInt(process.env.TSL_BAUD || "115200", 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "9101", 10);
const RETRY_DELAY = parseInt(process.env.TSL_RETRY || "5000", 10);

let port = null;
let scanning = false;
let retryTimer = null;
let retryCount = 0;
const recentEpcs = [];
const MAX_EPCS = 10000;
const statusLog = { connected: false };

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

    const decoded = hexToAscii(raw);
    const trimmed = decoded.replace(/\0/g, "").trim();

    if (trimmed.startsWith("AJ") && isPrintable(trimmed) && trimmed.length >= 8) {
      console.log(`[EPC] AJ=${trimmed}  hex=${raw}`);
      return { type: "epc", epc: trimmed };
    }

    if (raw.length > 8) {
      const stripped = hexToAscii(raw.slice(4)).replace(/\0/g, "").trim();
      if (stripped.startsWith("AJ") && isPrintable(stripped) && stripped.length >= 8) {
        console.log(`[EPC] AJ(pc)=${stripped}`);
        return { type: "epc", epc: stripped };
      }
    }

    const ascii = raw.length % 2 === 0 ? hexToAscii(raw).replace(/\0/g, "").trim() : "";
    if (ascii.length >= 4 && /^\d+$/.test(ascii)) {
      console.log(`[EPC] ASCII=${ascii}  hex=${raw}`);
      return { type: "epc", epc: ascii };
    }

    console.log(`[EPC] RAW=${raw}`);
    return { type: "epc", epc: raw };
  }

  if (clean.startsWith("IV:")) {
    const s = clean.slice(3).trim();
    scanning = s === "OK" || s.startsWith("OK");
    return null;
  }

  if (clean.startsWith("VR:")) {
    statusLog.firmware = clean.slice(3).trim();
    return null;
  }

  if (clean.startsWith("ER:")) {
    console.error("[ERRO LEITOR]", clean.slice(3).trim());
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
      console.warn(`[tsl-bridge] ${PORT} nao encontrada (tentativa ${retryCount})`);
      statusLog.com_error = `Porta ${PORT} nao encontrada`;
      retryTimer = setTimeout(connectSerial, RETRY_DELAY);
      return;
    }

    retryCount = 0;
    console.log(`[tsl-bridge] Abrindo ${PORT}...`);

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
      statusLog.connected = true;
      statusLog.com_error = null;
      setTimeout(() => sendToReader(".vr"), 1000);
    });

    parser.on("data", (line) => {
      const parsed = parseLine(line);
      if (parsed && parsed.type === "epc") {
        recentEpcs.push(parsed.epc);
        if (recentEpcs.length > MAX_EPCS) recentEpcs.shift();
      }
    });

    port.on("error", (err) => {
      console.error(`[tsl-bridge] Erro: ${err.message}`);
      statusLog.connected = false;
      statusLog.com_error = err.message;
      cleanupPort();
      retryTimer = setTimeout(connectSerial, RETRY_DELAY);
    });

    port.on("close", () => {
      console.log("[tsl-bridge] Porta fechada");
      statusLog.connected = false;
      cleanupPort();
      retryTimer = setTimeout(connectSerial, RETRY_DELAY);
    });

    port.open((err) => {
      if (err) {
        console.error(`[tsl-bridge] Falha ao abrir ${PORT}: ${err.message}`);
        statusLog.connected = false;
        statusLog.com_error = err.message;
        cleanupPort();
        retryTimer = setTimeout(connectSerial, RETRY_DELAY);
      }
    });
  } catch (err) {
    console.error(`[tsl-bridge] Falha: ${err.message}`);
    statusLog.com_error = err.message;
    retryTimer = setTimeout(connectSerial, RETRY_DELAY);
  }
}

function cleanupPort() {
  try { if (port && port.isOpen) port.close(); } catch { }
  port = null;
  scanning = false;
}

function startHttpServer() {
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
    const path = url.pathname;

    if (path === "/health" || path === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        service: "tsl-bridge",
        connected: statusLog.connected,
        scanning,
        port_name: PORT,
        firmware: statusLog.firmware || null,
      }));
      return;
    }

    if (path === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        connected: statusLog.connected,
        scanning,
        port: PORT,
        firmware: statusLog.firmware || null,
        epcs: recentEpcs.slice(-100),
        epc_count: recentEpcs.length,
        com_error: statusLog.com_error || null,
      }));
      return;
    }

    if (path === "/command" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const msg = JSON.parse(body);
          switch (msg.cmd) {
            case "inventory_start":
              scanning = true;
              sendToReader(".iv");
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true, cmd: "started" }));
              break;
            case "inventory_stop":
              scanning = false;
              sendToReader(".");
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true, cmd: "stopped" }));
              break;
            case "reset":
              recentEpcs.length = 0;
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true }));
              break;
            default:
              res.writeHead(400);
              res.end(JSON.stringify({ error: "cmd desconhecido" }));
          }
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "JSON invalido" }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(HTTP_PORT, () => {
    console.log(`[tsl-bridge] Servidor HTTP em http://localhost:${HTTP_PORT}`);
    console.log(`[tsl-bridge] Endpoints: /health /status /command`);
    console.log(`[tsl-bridge] Tentando conectar em ${PORT} @ ${BAUD} baud`);
    console.log(`[tsl-bridge] TSL_PORT=COM3 npm run tsl-bridge`);
  });
}

function cleanup() {
  console.log("\n[tsl-bridge] Encerrando...");
  if (retryTimer) clearTimeout(retryTimer);
  cleanupPort();
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

startHttpServer();
setTimeout(connectSerial, 500);

console.log(`[tsl-bridge] =======================`);
console.log(`[tsl-bridge] TSL 1128 Bridge (HTTP)`);
console.log(`[tsl-bridge] Porta: ${PORT}`);
console.log(`[tsl-bridge] HTTP: http://localhost:${HTTP_PORT}`);
console.log(`[tsl-bridge] =======================`);
