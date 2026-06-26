/**
 * Script Node.js: Impressao de etiquetas RFID na Zebra ZD500R
 *
 * Uso:
 *   node imprimir_rfid_zebra.mjs --epc AJ2600000001 --sku "1470-6" --nome "Anel Ouro Branco"
 *   node imprimir_rfid_zebra.mjs --produto-id 39187
 *
 * Conexao:
 *   IP: 192.168.15.144
 *   Porta: 9100
 */

import net from "net";

function epcToHex(epc) {
  return Buffer.from(epc, "ascii").toString("hex").toUpperCase();
}

function gerarZpl({ epc, sku, nome }) {
  const epcHex = epcToHex(epc);
  return [
    "^XA",
    "^PW580",
    "^LL160",
    "^CI28",
    `^FO10,10^A0N,22,22^FD${nome.replace(/[\^~]/g, " ")}^FS`,
    `^FO10,40^A0N,18,18^FDSKU: ${sku.replace(/[\^~]/g, " ")}^FS`,
    `^FO10,70^A0N,15,15^FDID: ${epc}^FS`,
    `^FO400,10^BQN,2,5^FDLA,${epc}^FS`,
    `^RFW,H^FD${epcHex}^FS`,
    "^XZ",
  ].join("\n");
}

function imprimirZpl(zpl, ip = "192.168.15.144", port = 9100) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(10000);
    socket.connect(port, ip, () => {
      socket.write(zpl, "utf8", () => {
        socket.end();
        resolve();
      });
    });
    socket.on("error", (err) => {
      socket.destroy();
      reject(new Error(`Erro: ${err.message}`));
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Timeout"));
    });
  });
}

// ─── CLI ──────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace("--", "");
  args[key] = process.argv[i + 1];
}

if (!args.epc && !args["produto-id"]) {
  console.error("Uso: node imprimir_rfid_zebra.mjs --epc AJ2600000001 --sku X --nome Y");
  console.error("  ou: node imprimir_rfid_zebra.mjs --produto-id 39187");
  process.exit(1);
}

if (args["produto-id"]) {
  // Modo API: chama o backend
  const apiUrl = args.api || "http://localhost:3000/api/rfid/imprimir";
  fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ produto_id: Number(args["produto-id"]), tipo: "imprimir" }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.error) {
        console.error("❌", data.error);
        process.exit(1);
      }
      console.log(`✅ EPC: ${data.epc} | Status: ${data.status}`);
      if (data.warning) console.log("⚠️", data.warning);
    })
    .catch((err) => {
      console.error("❌ Erro API:", err.message);
      process.exit(1);
    });
} else {
  // Modo direto
  const zpl = gerarZpl({ epc: args.epc, sku: args.sku || "", nome: args.nome || "" });
  const ip = args.ip || "192.168.15.144";
  const port = Number(args.porta || args.port || 9100);

  imprimirZpl(zpl, ip, port)
    .then(() => console.log(`✅ Impresso: ${args.nome} (${args.epc})`))
    .catch((err) => {
      console.error("❌", err.message);
      console.log("\n--- ZPL gerado ---\n" + zpl);
      process.exit(1);
    });
}
