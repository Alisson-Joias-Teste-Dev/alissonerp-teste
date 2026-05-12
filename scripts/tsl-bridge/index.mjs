import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import http from "http";
import postgres from "postgres";
import fs from "fs";
import path from "path";

const PORT = process.env.TSL_PORT || "COM3";
const BAUD = parseInt(process.env.TSL_BAUD || "115200", 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "9101", 10);
const RETRY_DELAY = parseInt(process.env.TSL_RETRY || "5000", 10);
const DATABASE_URL = process.env.DATABASE_URL;

let port = null;
let scanning = false;
let retryTimer = null;
let retryCount = 0;
let db = null;
let lastResult = null;
const recentEpcs = [];
const MAX_EPCS = 10000;
const statusLog = { connected: false };

// Conexao com banco
function initDb() {
  if (!DATABASE_URL) {
    console.warn("[tsl-bridge] DATABASE_URL nao definida. Proxy DB desabilitado.");
    return;
  }
  try {
    db = postgres(DATABASE_URL, { ssl: false, max: 2, idle_timeout: 20,
      connection: { search_path: "alissonerp,public" },
    });
    console.log("[tsl-bridge] Conexao com banco OK");
  } catch (e) {
    console.error("[tsl-bridge] Erro ao conectar no banco:", e.message);
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

function getInventoryPageHtml() {
  const proxyBase = "";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inventario RFID - TSL 1128</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F5F5F0;color:#374151;padding:16px}
.card{background:#FAFAF7;border:1px solid #E8DCC8;border-radius:16px;padding:20px;margin-bottom:16px}
h1{font-family:Georgia,serif;color:#184036;font-size:22px;margin-bottom:4px}
.status-dot{width:12px;height:12px;border-radius:50%;display:inline-block;margin-right:8px}
.btn{padding:10px 20px;border-radius:12px;border:none;font-size:14px;font-weight:600;cursor:pointer;color:#F3EADA;display:inline-flex;align-items:center;gap:8px}
.btn:disabled{opacity:.5;cursor:default}
.btn-primary{background:#184036}
.btn-danger{background:#DC2626}
.btn-success{background:#059669}
.btn-gray{background:#374151}
.btn-sm{padding:6px 12px;font-size:12px}
select{padding:6px 12px;border-radius:8px;border:1px solid #E8DCC8;font-size:14px;background:#fff}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;padding:8px 6px;font-size:12px;color:#6B7280;text-transform:uppercase;border-bottom:1px solid #E8DCC8;font-weight:600}
td{padding:10px 6px;border-bottom:1px solid #F3F4F6}
.badge{padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
.badge-ok{background:#D1FAE5;color:#065F46}
.badge-warn{background:#FEE2E2;color:#991B1B}
.badge-exc{background:#FEF3C7;color:#92400E}
.badge-info{background:#DBEAFE;color:#1E40AF}
.badge-fora-cat{background:#F3E8FF;color:#6B21A8}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.stat-card{background:#fff;border:1px solid #E8DCC8;border-radius:10px;padding:12px;text-align:center}
.stat-card .num{font-size:26px;font-weight:700;color:#184036}
.stat-card .lbl{font-size:11px;color:#6B7280;margin-top:2px}
.summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
#log{max-height:400px;overflow-y:auto}
.log-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;border:1px solid #F3F4F6;margin-bottom:4px;font-size:13px}
.log-item .dot{width:8px;height:8px;border-radius:50%;background:#059669;flex-shrink:0}
.log-item .epc{font-family:monospace;font-size:12px;color:#6B7280}
.log-item .info{color:#9CA3AF;font-size:12px;font-style:italic}
.checkbox-conf{width:20px;height:20px;cursor:pointer;accent-color:#059669}
</style>
</head>
<body>

<div class="card" style="display:flex;align-items:center;gap:10px;padding:14px 20px">
  <span id="statusDot" class="status-dot" style="background:#DC2626"></span>
  <div>
    <p id="statusTitle" style="font-weight:600;color:#184036">Conectando...</p>
    <p id="statusSub" style="font-size:12px;color:#9CA3AF">Iniciando bridge</p>
  </div>
</div>

<div class="card" id="controls">
  <div class="summary">
    <label style="font-size:13px;font-weight:600;color:#6B7280">Local:</label>
    <select id="localSelect"></select>
    <label style="font-size:13px;font-weight:600;color:#6B7280;margin-left:8px">Categoria:</label>
    <select id="catSelect"><option value="">Todas</option></select>
    <span id="timer" style="font-family:monospace;color:#2563EB;display:none"></span>
    <span id="count" style="font-weight:600;color:#184036">0 pecas</span>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button id="btnStart" class="btn btn-primary" onclick="startScan()">Iniciar Contagem</button>
    <button id="btnStop" class="btn btn-danger" onclick="stopScan()" style="display:none">Parar</button>
    <button id="btnClear" class="btn btn-gray" onclick="reset()" disabled>Limpar</button>
    <button id="btnSend" class="btn btn-success" onclick="sendInventory()" disabled>Conferir</button>
  </div>
</div>

<div id="resultArea" style="display:none"></div>

<div id="logArea">
  <p style="font-size:11px;font-weight:600;text-transform:uppercase;color:#6B7280;margin-bottom:8px">
    Leituras <span id="logCount"></span>
  </p>
  <div id="log"></div>
</div>

<script>
const API = "";
let epcs = [], known = new Set(), scanning = false, timer = 0, timerInt = null;
let conferidoState = {}; // { sku: true/false }

async function api(path) { const r = await fetch(API + path, {cache:"no-store"}); return r.json(); }
async function apiPost(path, body) {
  const r = await fetch(API + path, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body), cache:"no-store"});
  return r.json();
}
function $(id) { return document.getElementById(id); }
function setStatus(color, title, sub) { $("statusDot").style.background = color; $("statusTitle").textContent = title; $("statusSub").textContent = sub; }

// Carrega locais via proxy
apiPost("/proxy", {url:"/api/locais-estoque"}).then(d => {
  if (Array.isArray(d)) {
    const sel = $("localSelect");
    sel.innerHTML = d.map(l => '<option value="'+l.id+'">'+l.nome+'</option>').join("");
    loadCategorias();
  }
}).catch(() => {});

// Carrega categorias via proxy (com agrupamento hierarquico usando ->)
function loadCategorias() {
  const localId = parseInt($("localSelect").value) || 2;
  apiPost("/proxy", {url:"/api/categorias", body:{local_estoque_id: localId}}).then(d => {
    if (Array.isArray(d)) {
      const sel = $("catSelect");
      const currentVal = sel.value;

      // Funcao auxiliar para escape de HTML (atributos entre aspas)
      function esc(s) { return String(s).replace(/"/g,'"').replace(/'/g,'&#39;'); }

      // Separa raizes (sem ->) e filhos (com ->)
      const roots = [];
      const children = [];
      for (const c of d) {
        const sep = c.categoria.indexOf(' -> ');
        if (sep >= 0) {
          children.push({
            categoria: c.categoria,
            total: c.total,
            total_produtos: c.total_produtos,
            parent: c.categoria.substring(0, sep),
            childName: c.categoria.substring(sep + 4)
          });
        } else {
          roots.push(c);
        }
      }

      // Monta grupos: cada grupo tem label, root (ou null), e filhos
      const groups = [];
      const seenParents = new Set();

      // 1. Grupos a partir de categorias raiz existentes
      for (const r of roots) {
        groups.push({
          label: r.categoria,
          root: r,
          children: children.filter(ch => ch.parent === r.categoria)
        });
        seenParents.add(r.categoria);
      }

      // 2. Grupos de filhos cujo pai nao existe como raiz
      for (const ch of children) {
        if (!seenParents.has(ch.parent)) {
          groups.push({
            label: ch.parent,
            root: null,
            children: children.filter(c => c.parent === ch.parent)
          });
          seenParents.add(ch.parent);
        }
      }

      // Ordena grupos pelo total da raiz (ou maior total dos filhos se sem raiz)
      groups.sort((a, b) => {
        const aTotal = a.root ? a.root.total : Math.max(0, ...a.children.map(c => c.total));
        const bTotal = b.root ? b.root.total : Math.max(0, ...b.children.map(c => c.total));
        return bTotal - aTotal;
      });

      // Recalcula total do pai = ele mesmo + soma de todos os filhos
      for (const g of groups) {
        if (g.root) {
          const somaFilhos = g.children.reduce((s, ch) => s + ch.total, 0);
          g.root.total = g.root.total + somaFilhos;
        }
      }

      // Renderiza options: raiz em negrito, filhos indentados com ↳
      let html = '<option value="">Todas</option>';
      for (const g of groups) {
        const childrenSorted = [...g.children].sort((a, b) => b.total - a.total);
        if (g.root) {
          html += '<option value="' + esc(g.root.categoria) + '" style="font-weight:700">' + esc(g.root.categoria) + ' (' + g.root.total + ')</option>';
        }
        for (const ch of childrenSorted) {
          html += '<option value="' + esc(ch.categoria) + '">&nbsp;&nbsp;↳ ' + esc(ch.childName) + ' (' + ch.total + ')</option>';
        }
      }

      sel.innerHTML = html;
      sel.value = currentVal;
    }
  }).catch(() => {});
}
// Recarrega categorias quando mudar de local
$("localSelect").addEventListener("change", loadCategorias);

// Poll status
setInterval(async () => {
  try {
    const d = await api("/status");
    const conn = d.connected;
    setStatus(conn ? "#059669" : "#F59E0B", conn ? "Leitor conectado (COM3)" : "Bridge ativo, aguardando leitor...", conn ? "Pronto" : "Pressione o gatilho do TSL 1128");
    $("btnStart").disabled = !conn;
    if (Array.isArray(d.epcs)) {
      for (const epc of d.epcs) {
        if (known.has(epc)) continue;
        known.add(epc);
        epcs.unshift({epc, ts: Date.now()});
        if (epcs.length > 5000) epcs.pop();
        renderLog();
      }
    }
  } catch(e) {
    setStatus("#DC2626", "Bridge desconectado", "Inicie o bridge com npm run tsl-bridge");
  }
}, 500);

function renderLog() {
  $("count").textContent = epcs.length + " peca" + (epcs.length !== 1 ? "s" : "");
  $("btnClear").disabled = epcs.length === 0;
  $("btnSend").disabled = epcs.length === 0;
  $("logCount").textContent = epcs.length > 50 ? "(ultimas 50)" : "(" + epcs.length + ")";
  $("log").innerHTML = epcs.slice(0, 50).map((e,i) =>
    '<div class="log-item"><span class="dot"></span><span class="epc">' + (e.epc.length > 20 ? e.epc.slice(-16) : e.epc) + '</span>' +
    (i === 0 && scanning ? '<span class="info">AGORA</span>' : '') + '</div>'
  ).join("");
}

async function startScan() {
  scanning = true;
  $("btnStart").style.display = "none";
  $("btnStop").style.display = "";
  timer = 0; $("timer").style.display = "";
  timerInt = setInterval(() => { timer++; $("timer").textContent = "⏱ " + String(Math.floor(timer/60)).padStart(2,"0") + ":" + String(timer%60).padStart(2,"0"); }, 1000);
  await apiPost("/command", {cmd:"inventory_start"});
}

async function stopScan() {
  scanning = false;
  $("btnStart").style.display = "";
  $("btnStop").style.display = "none";
  if (timerInt) clearInterval(timerInt);
  $("timer").style.display = "none";
  await apiPost("/command", {cmd:"inventory_stop"});
}

async function reset() {
  epcs = []; known.clear(); renderLog();
  await apiPost("/command", {cmd:"reset"});
}

async function sendInventory() {
  const localId = parseInt($("localSelect").value);
  const categoria = $("catSelect").value;
  try {
    const data = await apiPost("/proxy", {
      url: "/api/rfid/inventario",
      method: "POST",
      body: {leituras: epcs.map(e=>e.epc), leitor_id:"TSL-1128", local_estoque_id: localId, categoria}
    });
    if (data.error) { alert("Erro: " + data.error); return; }
    if (!data.resumo) { alert("Erro: resposta invalida do servidor"); console.error(data); return; }
    conferidoState = {};
    showResult(data);
  } catch(e) {
    alert("Erro ao enviar: " + e.message);
  }
}

async function toggleConferido(produtoId, sku, checked) {
  conferidoState[sku] = checked;
  try {
    await apiPost("/conferir", { produto_id: produtoId, conferido: checked });
  } catch(e) {
    console.error("Erro ao marcar conferido:", e);
  }
}

function showResult(d) {
  $("resultArea").style.display = "";
  $("logArea").style.display = "none";
  $("controls").style.display = "none";
  let rows = "";
  for (const p of d.produtos || []) {
    const cl = p.status==="ok"?"badge-ok":p.status==="faltando"?"badge-warn":p.status==="excedente"?"badge-exc":"badge-info";
    const lb = p.status==="ok"?"OK":p.status==="faltando"?"Faltando":p.status==="excedente"?"Excedente":p.status==="sem_estoque"?"Sem estoque":"Nao cadastrado";
    const checked = conferidoState[p.sku] ? "checked" : "";
    const safeSku = String(p.sku||'').replace(/"/g,'"').replace(/'/g,'&#39;');
    rows += '<tr data-pid="' + (p.produto_id||'') + '" data-sku="' + safeSku + '">' +
      '<td><input type="checkbox" class="checkbox-conf" ' + checked + '></td>' +
      '<td>' + (p.nome||"API #"+p.id_api_produto) + '</td><td>' + (p.sku||"-") + '</td><td>' +
      (p.categoria||"-") + '</td><td>' +
      p.esperado + '</td><td>' + p.encontrado + '</td><td style="color:' +
      (p.divergencia===0?"#6B7280":p.divergencia<0?"#DC2626":"#F59E0B") + '">' +
      (p.divergencia>0?"+":"") + p.divergencia + '</td><td><span class="badge ' + cl + '">' + lb + '</span></td></tr>';
  }
  const diff = d.resumo.total_encontrado - d.resumo.total_esperado;

  // Resumo por categoria
  const catMap = new Map();
  for (const p of d.produtos || []) {
    const cat = p.categoria || "Sem categoria";
    if (!catMap.has(cat)) catMap.set(cat, { esperado: 0, encontrado: 0, produtos: 0 });
    const c = catMap.get(cat);
    c.esperado += p.esperado;
    c.encontrado += p.encontrado;
    c.produtos++;
  }
  let catRows = "";
  for (const [cat, c] of [...catMap.entries()].sort((a,b) => b[1].encontrado - a[1].encontrado || b[1].esperado - a[1].esperado)) {
    const cd = c.encontrado - c.esperado;
    catRows += '<tr><td>' + cat + '</td><td>' + c.produtos + '</td><td>' + c.esperado + '</td><td>' + c.encontrado + '</td><td style="color:' + (cd===0?"#6B7280":cd<0?"#DC2626":"#059669") + '">' + (cd>0?"+":"") + cd + '</td></tr>';
  }

  // Seção "Fora da categoria"
  let foraCatHtml = "";
  const fora = d.produtos_fora_categoria || [];
  if (fora.length > 0) {
    let foraRows = "";
    for (const p of fora) {
      foraRows += '<tr><td>' + (p.nome||"API #"+p.id_api_produto) + '</td><td>' + (p.sku||"-") + '</td><td>' + (p.categoria||"-") + '</td><td>' + p.encontrado + '</td></tr>';
    }
    foraCatHtml = '<div class="card" style="border-color:#D8B4FE;background:#FDF4FF">' +
      '<h2 style="margin-bottom:8px;color:#6B21A8;font-size:16px">⚠️ ' + fora.length + ' leitura(s) fora da categoria selecionada "' + (d.categoria_filtro || "") + '"</h2>' +
      '<table><thead><tr><th>Produto</th><th>SKU</th><th>Categoria</th><th>Lido</th></tr></thead><tbody>' + foraRows + '</tbody></table></div>';
  }

  $("resultArea").innerHTML =
    '<div class="card"><h2 style="margin-bottom:12px">Resultado — ' + d.local_nome + '</h2>' +
    '<div class="grid-4">' +
      '<div class="stat-card"><div class="num">' + d.total_epcs_unicos + '</div><div class="lbl">Pecas lidas</div></div>' +
      '<div class="stat-card"><div class="num">' + d.resumo.total_esperado + '</div><div class="lbl">Esperado</div></div>' +
      '<div class="stat-card"><div class="num" style="color:' + (d.resumo.produtos_com_divergencia>0?"#DC2626":"#059669") + '">' + d.resumo.produtos_com_divergencia + '</div><div class="lbl">Divergencias</div></div>' +
      '<div class="stat-card"><div class="num" style="color:' + (diff===0?"#059669":"#DC2626") + '">' + (diff>0?"+":"") + diff + '</div><div class="lbl">Diferenca</div></div>' +
    '</div>' +
    (d.nao_identificados?.length ? '<p style="margin:10px 0;font-size:12px;color:#9CA3AF">' + d.nao_identificados.length + ' EPCs nao identificados</p>' : "") +
    (catRows ? '<details style="margin:10px 0"><summary style="font-weight:600;font-size:13px;color:#184036;cursor:pointer">Resumo por Categoria (' + catMap.size + ')</summary><table style="margin-top:6px"><thead><tr><th>Categoria</th><th>Produtos</th><th>Esperado</th><th>Lido</th><th>Div.</th></tr></thead><tbody>' + catRows + '</tbody></table></details>' : "") +
    '<table>' + (rows ? '<thead><tr><th style="width:40px">Conf.</th><th>Produto</th><th>SKU</th><th>Categoria</th><th>Esperado</th><th>Lido</th><th>Div.</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody>' : "") + '</table>' +
    foraCatHtml +
    '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="btn btn-gray" onclick="resetResult()">Refazer contagem</button>' +
      '<button id="btnSave" class="btn btn-success" onclick="saveInventory()">Salvar no Sistema</button>' +
    '</div></div>';
}

function resetResult() { $("resultArea").style.display = "none"; $("logArea").style.display = ""; $("controls").style.display = ""; epcs = []; known.clear(); conferidoState = {}; renderLog(); }

// Event delegation para checkbox de conferido (evita SyntaxError com SKUs com caracteres especiais)
document.addEventListener("change", (e) => {
  if (e.target.classList.contains("checkbox-conf")) {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const pid = parseInt(tr.dataset.pid, 10);
    const sku = tr.dataset.sku || "";
    if (!pid) return;
    toggleConferido(pid, sku, e.target.checked);
  }
});

async function saveInventory() {
  const btn = $("btnSave");
  btn.disabled = true;
  btn.textContent = "Salvando...";
  try {
    const localId = parseInt($("localSelect").value);
    const categoria = $("catSelect").value;
    const r = await apiPost("/salvar", { local_estoque_id: localId, categoria: categoria || undefined });
    if (r.error) { alert("Erro: " + r.error); btn.disabled = false; btn.textContent = "Salvar no Sistema"; return; }
    alert("Inventario #" + r.inventario_id + " salvo com " + r.itens_atualizados + " itens contados! Acesse: /estoque-comercial/inventario");
    resetResult();
  } catch(e) {
    alert("Erro ao salvar: " + e.message);
    btn.disabled = false;
    btn.textContent = "Salvar no Sistema";
  }
}

</script>
</body></html>`;
}

function startHttpServer() {
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Private-Network": "true",
        "Access-Control-Max-Age": "0",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
    const path = url.pathname;

    if (path === "/health") {
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

    if (path === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getInventoryPageHtml());
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

    if (path === "/proxy" && req.method === "POST") {
      let raw = "";
      req.on("data", (chunk) => { raw += chunk; });
      req.on("end", async () => {
        try {
          const msg = JSON.parse(raw);
          if (!db) throw new Error("Banco nao conectado");

          if (msg.url === "/api/locais-estoque") {
            const rows = await db`SELECT id, nome FROM alissonerp.locais_estoque WHERE ativo = true ORDER BY nome`;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(rows));
            return;
          }

          if (msg.url === "/api/categorias") {
            const localId = msg.body?.local_estoque_id || 2;
            const rows = await db`
              WITH categorias_estoque AS (
                SELECT p.categoria, COUNT(*)::int as total_produtos, COALESCE(SUM(v.saldo_fisico),0)::int as total
                FROM alissonerp.vw_saldo_estoque_comercial_v2 v
                JOIN public.produtos p ON p.id_produto = v.produto_id
                WHERE v.local_estoque_id = ${localId || 2}
                  AND p.categoria IS NOT NULL AND p.categoria != ''
                GROUP BY p.categoria
              ),
              categorias_config AS (
                SELECT p.categoria, COUNT(*)::int as total_produtos, 0::int as total
                FROM alissonerp.estoque_comercial_config cfg
                JOIN public.produtos p ON p.id_produto = cfg.produto_id
                WHERE cfg.ativo = true
                  AND p.categoria IS NOT NULL AND p.categoria != ''
                  AND NOT EXISTS (SELECT 1 FROM categorias_estoque c WHERE c.categoria = p.categoria)
                GROUP BY p.categoria
              )
              SELECT categoria, total_produtos, total FROM categorias_estoque
              UNION ALL
              SELECT categoria, total_produtos, total FROM categorias_config
              ORDER BY total DESC, categoria
            `;

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(rows));
            return;
          }

          if (msg.url === "/api/rfid/inventario" && msg.body) {
            const b = msg.body;
            const leituras = [...new Set((b.leituras || []).map(l => String(l).trim()).filter(Boolean))];
            if (leituras.length === 0) throw new Error("Nenhuma leitura");
            const localId = b.local_estoque_id ?? 2;
            const categoriaFiltro = b.categoria || null;

            console.log(`[inventario] EPCs recebidos: ${leituras.length}`);
            console.log(`[inventario] Primeiro EPC: ${leituras[0]}`);
            console.log(`[inventario] Local ID: ${localId}` + (categoriaFiltro ? ` Categoria: ${categoriaFiltro}` : ""));

            // 1. Registra leituras
            for (const epc of leituras) {
              await db`INSERT INTO alissonerp.joias_leituras (epc, evento, localizacao, leitor_id, lido_em) VALUES (${epc}, 'inventario', 'RFID', 'TSL-1128', now())`;
            }

            // 2. Extrai id_api_produto de cada EPC
            const idsApiLidos = new Set();
            const naoIdentificados = [];
            for (const epc of leituras) {
              if (epc.length >= 13 && /^\d{24}$/.test(epc)) {
                const idApi = parseInt(epc.slice(4, 13), 10);
                if (!isNaN(idApi) && idApi > 0) idsApiLidos.add(idApi);
              } else {
                naoIdentificados.push(epc);
              }
            }

            // 3. Busca produtos por id_api_produto (mapeia id_api_produto -> sku)
            const prodPorIdApi = new Map();
            if (idsApiLidos.size > 0) {
              const prods = await db`SELECT id_produto, id_api_produto, sku, nome, COALESCE(categoria,'') as categoria FROM public.produtos WHERE id_api_produto = ANY(${[...idsApiLidos]}::int[])`;
              for (const p of prods) prodPorIdApi.set(Number(p.id_api_produto), { id_produto: p.id_produto, sku: p.sku, nome: p.nome, categoria: p.categoria });
            }
            console.log(`[inventario] produtos encontrados: ${prodPorIdApi.size}`);

            // 4. Agrupa EPCs por SKU (via id_api_produto -> public.produtos.sku)
            const contagemPorSku = new Map(); // sku -> { count, epcs, nome, idApi }
            const skusLidos = new Set();
            for (const epc of leituras) {
              if (epc.length >= 13 && /^\d{24}$/.test(epc)) {
                const idApi = parseInt(epc.slice(4, 13), 10);
                if (!isNaN(idApi) && idApi > 0) {
                  const prod = prodPorIdApi.get(idApi);
                  const sku = prod?.sku;
                  if (sku) {
                    skusLidos.add(sku);
                    if (!contagemPorSku.has(sku)) contagemPorSku.set(sku, { count: 0, epcs: [], idApi, id_produto: prod.id_produto, nome: prod.nome, categoria: prod.categoria });
                    const g = contagemPorSku.get(sku);
                    g.count++;
                    g.epcs.push(epc);
                  }
                }
              }
            }
            console.log(`[inventario] skus escaneados: ${[...skusLidos].join(",")}`);
            console.log(`[inventario] idsApi sem produto: ${[...idsApiLidos].filter(a => !prodPorIdApi.has(a)).join(",")}`);

            // 5. Busca estoque por SKU em vw_saldo_estoque_comercial_v2 (filtrado por local e opcionalmente categoria)
            const estoquePorSku = new Map(); // sku -> saldo_fisico
            if (skusLidos.size > 0) {
              const skuArr = [...skusLidos];
              console.log(`[inventario] buscando SKUs no local ${localId}` + (categoriaFiltro ? ` categoria ${categoriaFiltro}` : "") + `: ${skuArr.join(",")}`);
              let query = db`SELECT v.sku, v.saldo_fisico::int FROM alissonerp.vw_saldo_estoque_comercial_v2 v WHERE v.local_estoque_id = ${localId} AND v.sku = ANY(${skuArr}::text[])`;
              if (categoriaFiltro) {
                query = db`SELECT v.sku, v.saldo_fisico::int FROM alissonerp.vw_saldo_estoque_comercial_v2 v JOIN public.produtos p ON p.id_produto = v.produto_id WHERE v.local_estoque_id = ${localId} AND v.sku = ANY(${skuArr}::text[]) AND p.categoria LIKE ${categoriaFiltro + '%'}`;
              }
              const alertRows = await query;
              console.log(`[inventario] estoque encontrado no local ${localId}: ${alertRows.length}`);
              for (const r of alertRows) estoquePorSku.set(String(r.sku), Number(r.saldo_fisico ?? 0));
            }

            // 5b. (REMOVED) Nao faz mais fallback de saldo consolidado.
            //     Se o SKU nao tem estoque no local selecionado, fica como 0.
            //     Isso evita que produtos de outros locais aparecam como "esperado" aqui.

            // 6. Busca TODOS os SKUs com estoque nesse local (para mostrar faltantes), filtrando por categoria se definido
            let todosQuery = db`SELECT v.sku, v.saldo_fisico::int FROM alissonerp.vw_saldo_estoque_comercial_v2 v WHERE v.local_estoque_id = ${localId}`;
            if (categoriaFiltro) {
              todosQuery = db`SELECT v.sku, v.saldo_fisico::int FROM alissonerp.vw_saldo_estoque_comercial_v2 v JOIN public.produtos p ON p.id_produto = v.produto_id WHERE v.local_estoque_id = ${localId} AND p.categoria LIKE ${categoriaFiltro + '%'}`;
            }
            const todosLocal = await todosQuery;
            console.log(`[inventario] total produtos no local ${localId}` + (categoriaFiltro ? ` categoria ${categoriaFiltro}` : "") + `: ${todosLocal.length}`);
            for (const r of todosLocal) {
              const sku = String(r.sku);
              if (!estoquePorSku.has(sku)) estoquePorSku.set(sku, Number(r.saldo_fisico ?? 0));
            }

            // 6.5 Busca nome/produto_id para SKUs com estoque mas nao escaneados
            const skusNaoLidos = [...estoquePorSku.keys()].filter(s => !skusLidos.has(s));
            if (skusNaoLidos.length > 0) {
              const prodsFaltantes = await db`SELECT id_produto, id_api_produto, sku, nome, COALESCE(categoria,'') as categoria FROM public.produtos WHERE sku = ANY(${skusNaoLidos}::text[])`;
              for (const p of prodsFaltantes) {
                const s = String(p.sku);
                if (!contagemPorSku.has(s)) contagemPorSku.set(s, { count: 0, epcs: [], idApi: Number(p.id_api_produto), id_produto: p.id_produto, nome: p.nome, categoria: p.categoria });
              }
            }

            // 7. Monta relatorio
            const produtos = [];
            const produtosForaCategoria = []; // produtos lidos cuja categoria NAO corresponde ao filtro
            let totalEsperado = 0, totalEncontrado = 0;
            const todosSkus = new Set([...skusLidos, ...estoquePorSku.keys()]);

            for (const sku of todosSkus) {
              const g = contagemPorSku.get(sku);
              const esperadoQty = estoquePorSku.get(sku) ?? 0;
              const encontradoQty = g?.count ?? 0;
              const divergencia = encontradoQty - esperadoQty;

              let status = "ok";
              if (esperadoQty === 0 && encontradoQty > 0) status = "sem_estoque";
              else if (divergencia < 0) status = "faltando";
              else if (divergencia > 0) status = "excedente";
              else if (esperadoQty === 0 && encontradoQty === 0) continue;

              totalEsperado += esperadoQty;
              totalEncontrado += encontradoQty;

              // Verifica se esta fora da categoria filtrada
              // Regra: se categoria_filtro = "Anel", entao "Anel -> *" faz parte do grupo
              let foraDaCategoria = false;
              if (categoriaFiltro && g?.categoria) {
                if (g.categoria !== categoriaFiltro && !g.categoria.startsWith(categoriaFiltro + ' -> ')) {
                  foraDaCategoria = true;
                }
              }

              const prodItem = {
                produto_id: g?.id_produto ?? null,
                id_api_produto: g?.idApi ?? null,
                sku,
                nome: g?.nome ?? null,
                categoria: g?.categoria ?? null,
                esperado: esperadoQty,
                encontrado: encontradoQty,
                divergencia,
                epcs: g?.epcs ?? [],
                status,
              };

              if (foraDaCategoria) {
                produtosForaCategoria.push(prodItem);
              } else {
                produtos.push(prodItem);
              }
            }

            // Busca nome do local
            const [localInfo] = await db`SELECT nome FROM alissonerp.locais_estoque WHERE id = ${localId}`;
            const localNome = localInfo?.nome ?? "Local " + localId;

            const resultado = {
              ok: true, local_estoque_id: localId,
              local_nome: localNome, total_epcs_unicos: leituras.length,
              nao_identificados: naoIdentificados,
              produtos,
              produtos_fora_categoria: produtosForaCategoria,
              categoria_filtro: categoriaFiltro,
              resumo: {
                total_produtos: produtos.length, total_esperado: totalEsperado,
                total_encontrado: totalEncontrado,
                produtos_com_divergencia: produtos.filter(p => p.status !== "ok" && p.status !== "sem_estoque").length,
                faltando: produtos.filter(p => p.status === "faltando").length,
                excedente: produtos.filter(p => p.status === "excedente").length,
                sem_estoque: produtos.filter(p => p.status === "sem_estoque").length,
                nao_cadastrado: 0,
                fora_categoria: produtosForaCategoria.length,
              },
            };

            lastResult = resultado;

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(resultado));
            return;
          }

          res.writeHead(400);
          res.end(JSON.stringify({ error: "url nao suportada" }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (path === "/salvar" && req.method === "POST" && db) {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const msg = JSON.parse(body);
          const localId = msg.local_estoque_id;
          const cat = msg.categoria?.trim() || null;
          if (!lastResult) throw new Error("Nenhum resultado para salvar. Execute 'Conferir' primeiro.");
          if (!localId) throw new Error("local_estoque_id obrigatorio");

          const [existente] = await db`SELECT id FROM alissonerp.inventarios_comercial WHERE local_estoque_id = ${localId} AND status IN ('aberto','em_contagem')`;
          if (existente) throw new Error(`Ja existe inventario aberto para esse local (ID: ${existente.id}). Conclua ou cancele primeiro.`);

          const [inv] = await db`INSERT INTO alissonerp.inventarios_comercial (local_estoque_id, status, obs, categoria) VALUES (${localId}, 'em_contagem', 'Inventario via RFID TSL-1128', ${cat}) RETURNING id`;

          if (cat) {
            // Com filtro de categoria
            await db`INSERT INTO alissonerp.itens_inventario_comercial (inventario_id, produto_id, quantidade_sistema)
              SELECT ${inv.id}, v.produto_id, COALESCE(v.saldo_fisico,0)::INTEGER
              FROM alissonerp.vw_saldo_estoque_comercial_v2 v
              JOIN public.produtos p ON p.id_produto = v.produto_id
              WHERE v.local_estoque_id = ${localId} AND v.saldo_fisico IS NOT NULL AND p.categoria LIKE ${cat + '%'}`;

            await db`INSERT INTO alissonerp.itens_inventario_comercial (inventario_id, produto_id, quantidade_sistema)
              SELECT ${inv.id}, cfg.produto_id, 0
              FROM alissonerp.estoque_comercial_config cfg
              JOIN public.produtos p ON p.id_produto = cfg.produto_id
              WHERE cfg.ativo = true AND p.categoria LIKE ${cat + '%'}
                AND NOT EXISTS (SELECT 1 FROM alissonerp.itens_inventario_comercial ii WHERE ii.inventario_id = ${inv.id} AND ii.produto_id = cfg.produto_id)`;
          } else {
            // Sem filtro de categoria
            await db`INSERT INTO alissonerp.itens_inventario_comercial (inventario_id, produto_id, quantidade_sistema)
              SELECT ${inv.id}, v.produto_id, COALESCE(v.saldo_fisico,0)::INTEGER
              FROM alissonerp.vw_saldo_estoque_comercial_v2 v
              WHERE v.local_estoque_id = ${localId} AND v.saldo_fisico IS NOT NULL`;

            await db`INSERT INTO alissonerp.itens_inventario_comercial (inventario_id, produto_id, quantidade_sistema)
              SELECT ${inv.id}, cfg.produto_id, 0
              FROM alissonerp.estoque_comercial_config cfg
              WHERE cfg.ativo = true
                AND NOT EXISTS (SELECT 1 FROM alissonerp.itens_inventario_comercial ii WHERE ii.inventario_id = ${inv.id} AND ii.produto_id = cfg.produto_id)`;
          }


          let atualizados = 0;
          for (const p of (lastResult.produtos || [])) {
            if (!p.sku || p.encontrado <= 0) continue;
            await db`
              UPDATE alissonerp.itens_inventario_comercial ii
              SET quantidade_contada = ${p.encontrado}
              FROM public.produtos pr
              WHERE ii.inventario_id = ${inv.id}
                AND ii.produto_id = pr.id_produto
                AND pr.sku = ${p.sku}
            `;
            atualizados++;
          }

          console.log(`[salvar] Inventario ${inv.id} criado, ${atualizados} itens atualizados`);
          lastResult = null;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, inventario_id: inv.id, itens_atualizados: atualizados }));
        } catch (e) {
          console.error("[salvar] Erro:", e.message);
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (path === "/conferir" && req.method === "POST" && db) {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const msg = JSON.parse(body);
          const { produto_id, conferido } = msg;
          if (!lastResult) throw new Error("Nenhum inventario em andamento");
          if (!produto_id) throw new Error("produto_id obrigatorio");

          await db`
            UPDATE alissonerp.itens_inventario_comercial ii
            SET conferido = ${!!conferido},
                conferido_em = CASE WHEN ${!!conferido} THEN now() ELSE NULL END
            FROM alissonerp.inventarios_comercial inv
            WHERE ii.inventario_id = inv.id
              AND inv.status IN ('aberto', 'em_contagem')
              AND ii.produto_id = ${produto_id}
          `;

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, produto_id, conferido: !!conferido }));
        } catch (e) {
          console.error("[conferir] Erro:", e.message);
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(HTTP_PORT, () => {
    console.log(`[tsl-bridge] Servidor HTTP em http://localhost:${HTTP_PORT}`);
    console.log(`[tsl-bridge] Endpoints: /health /status /command /salvar`);
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
initDb();
setTimeout(connectSerial, 500);

console.log(`[tsl-bridge] =======================`);
console.log(`[tsl-bridge] TSL 1128 Bridge (HTTP)`);
console.log(`[tsl-bridge] Porta: ${PORT}`);
console.log(`[tsl-bridge] HTTP: http://localhost:${HTTP_PORT}`);
console.log(`[tsl-bridge] =======================`);
