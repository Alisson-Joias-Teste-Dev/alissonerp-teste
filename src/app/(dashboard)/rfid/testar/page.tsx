"use client";

import { useState } from "react";
import { Printer, Loader2, Copy, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function TestarRFID() {
  const router = useRouter();
  const [produtoId, setProdutoId] = useState(39187);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{
    epc: string; zpl: string; status: string; warning?: string;
    produto?: { id: number; sku: string; nome: string };
  } | null>(null);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);

  async function testar(tipo: "gerar" | "imprimir") {
    setLoading(true);
    setErro("");
    setResultado(null);
    try {
      const r = await fetch("/api/rfid/imprimir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produto_id: produtoId, tipo }),
      });
      const data = await r.json();
      if (!r.ok) { setErro(data.error); return; }
      setResultado(data);
    } catch {
      setErro("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  function copiarZpl() {
    if (resultado?.zpl) {
      navigator.clipboard.writeText(resultado.zpl);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <button
        className="flex items-center gap-1.5 text-sm mb-6 hover:opacity-70"
        style={{ color: "#184036" }}
        onClick={() => router.push("/rfid/cadastro")}
      >
        <ArrowLeft size={15} />
        Voltar
      </button>

      <div className="rounded-2xl p-6 mb-6" style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}>
        <div className="flex items-center gap-3 mb-2">
          <Printer size={24} style={{ color: "#184036" }} />
          <h1 className="text-xl font-bold" style={{ fontFamily: "Georgia, serif", color: "#184036" }}>
            Testar Etiqueta RFID
          </h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Gere uma etiqueta RFID de teste e envie para a Zebra ZD500R.
        </p>

        <div className="flex items-end gap-3 mb-6">
          <div className="flex-1">
            <label className="block text-xs font-semibold mb-1 text-gray-500">ID do Produto</label>
            <input
              type="number"
              value={produtoId}
              onChange={e => setProdutoId(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none bg-white"
              style={{ borderColor: "#E8DCC8" }}
            />
            <p className="text-xs text-gray-400 mt-1">39187 = Teste Evolur | 39188 = Teste Ytalo</p>
          </div>
          <button
            onClick={() => testar("gerar")}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: "#184036", color: "#F3EADA", opacity: loading ? 0.5 : 1 }}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : "Gerar ZPL"}
          </button>
          <button
            onClick={() => testar("imprimir")}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-1.5"
            style={{ background: "#D4A843", color: "#fff", opacity: loading ? 0.5 : 1 }}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
            Imprimir
          </button>
        </div>

        {erro && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-xl mb-4" style={{ background: "#FEE2E2", color: "#991B1B" }}>
            <AlertTriangle size={15} />
            {erro}
          </div>
        )}

        {resultado && (
          <div className="space-y-4">
            <div className="rounded-xl p-4" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} style={{ color: "#16A34A" }} />
                <span className="font-semibold text-sm">RFID gerado</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">EPC:</span>
                  <span className="ml-2 font-mono">{resultado.epc}</span>
                </div>
                <div>
                  <span className="text-gray-500">Status:</span>
                  <span className="ml-2">{resultado.status}</span>
                </div>
                {resultado.produto && (
                  <>
                    <div>
                      <span className="text-gray-500">Produto:</span>
                      <span className="ml-2">{resultado.produto.nome}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">SKU:</span>
                      <span className="ml-2">{resultado.produto.sku}</span>
                    </div>
                  </>
                )}
              </div>
              {resultado.warning && (
                <div className="flex items-center gap-2 text-sm mt-3 p-2 rounded-lg" style={{ background: "#FEF3C7", color: "#92400E" }}>
                  <AlertTriangle size={14} />
                  {resultado.warning}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">ZPL Gerado</span>
                <button
                  onClick={copiarZpl}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                  style={{ color: "#184036" }}
                >
                  {copiado ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                  {copiado ? "Copiado!" : "Copiar ZPL"}
                </button>
              </div>
              <pre
                className="text-xs font-mono p-4 rounded-xl overflow-x-auto whitespace-pre"
                style={{ background: "#1A1A1A", color: "#A7F3D0", border: "1px solid #374151" }}
              >
                {resultado.zpl}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
