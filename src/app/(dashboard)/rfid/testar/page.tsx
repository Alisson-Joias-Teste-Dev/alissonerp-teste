"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import {
  Printer,
  Loader2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Download,
} from "lucide-react";
import { toast } from "sonner";

import { useImpressora } from "@/hooks/rfid/useImpressora";
import { enviarEVerificar } from "@/lib/rfid/browser-print";
import { interpretarRespostaGravacao } from "@/lib/rfid/verificacao";
import type { Epc } from "@/lib/rfid/tipos";

import { BannerImpressora } from "@/components/rfid/BannerImpressora";

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function TestarRfidPage() {
  const router = useRouter();

  // ── Impressora ────────────────────────────────────────────────────────
  const { device, status, reconectar } = useImpressora();
  const conectado = status === "conectado" && device !== null;

  // ── Estado local ──────────────────────────────────────────────────────
  const [produtoId, setProdutoId] = useState(39187);
  const [loading, setLoading] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);
  const [resultado, setResultado] = useState<{
    epc: string;
    zpl: string;
    status: string;
    warning?: string;
    produto?: { id: number; sku: string; nome: string };
  } | null>(null);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [impressaoResultado, setImpressaoResultado] = useState<{
    status: string;
    mensagem: string;
  } | null>(null);

  // ── Gerar ZPL ─────────────────────────────────────────────────────────

  const gerarZpl = useCallback(async () => {
    setLoading(true);
    setErro("");
    setResultado(null);
    setImpressaoResultado(null);

    try {
      const res = await fetch("/api/rfid/cadastrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produto_id: produtoId }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setErro(data.error ?? `Erro ${res.status} ao gerar ZPL`);
        return;
      }

      setResultado(data);
      toast.success("ZPL gerado com sucesso", {
        description: `EPC: ${data.epc}`,
      });
    } catch {
      setErro("Erro de conex\u00e3o com o servidor");
    } finally {
      setLoading(false);
    }
  }, [produtoId]);

  // ── Imprimir (Browser Print + verificação) ────────────────────────────

  const imprimir = useCallback(async () => {
    if (!resultado?.zpl) {
      toast.error("Gere o ZPL primeiro");
      return;
    }

    if (!conectado || !device) {
      toast.error("Impressora n\u00e3o conectada", {
        description: "Verifique o Zebra Browser Print.",
      });
      return;
    }

    setImprimindo(true);
    setImpressaoResultado(null);
    try {
      const raw = await enviarEVerificar(device, resultado.zpl);
      const interpretado = interpretarRespostaGravacao(raw, resultado.epc as Epc);

      setImpressaoResultado({
        status: interpretado.status,
        mensagem: interpretado.mensagem,
      });

      if (interpretado.status === "ok") {
        toast.success("Impress\u00e3o conclu\u00edda", {
          description: interpretado.mensagem,
        });
      } else if (interpretado.status === "void") {
        toast.error("Etiqueta VOID", {
          description: interpretado.mensagem,
        });
      } else {
        toast.warning("Aten\u00e7\u00e3o", {
          description: interpretado.mensagem,
        });
      }
    } catch (err) {
      toast.error("Falha ao enviar para impressora", {
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setImprimindo(false);
    }
  }, [resultado, conectado, device]);

  // ── Copiar ZPL ────────────────────────────────────────────────────────

  const copiarZpl = useCallback(() => {
    if (resultado?.zpl) {
      navigator.clipboard.writeText(resultado.zpl);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  }, [resultado]);

  // ── Baixar ZPL ────────────────────────────────────────────────────────

  const baixarZpl = useCallback(() => {
    if (!resultado) return;
    const blob = new Blob([resultado.zpl], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rfid-${resultado.epc}.zpl`;
    a.click();
    URL.revokeObjectURL(url);
  }, [resultado]);

  // ── Render ────────────────────────────────────────────────────────────

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
      <div className="min-h-full bg-stone-50">
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        {/* Voltar */}
        <button
          type="button"
          onClick={() => router.push("/rfid/cadastro")}
          className="flex items-center gap-1.5 text-sm text-emerald-800 hover:text-emerald-700 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Cadastro RFID
        </button>

        {/* Card principal */}
        <div className="rounded-2xl p-6 mb-6 bg-white border border-stone-200 shadow-sm">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <Printer className="w-6 h-6 text-emerald-800" />
            <h1 className="text-xl font-bold text-emerald-800 font-serif">
              Testar Etiqueta RFID
            </h1>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            Ferramenta de diagn&oacute;stico &mdash; ZD500R
          </p>

          {/* Status Browser Print */}
          <div className="mb-6">
            <BannerImpressora
              status={status}
              device={device}
              onReconectar={reconectar}
            />
          </div>

          {/* Input + botões */}
          <div className="flex flex-wrap items-end gap-3 mb-6">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-semibold mb-1 text-gray-500">
                ID do Produto
              </label>
              <input
                type="number"
                value={produtoId}
                onChange={(e) => setProdutoId(Number(e.target.value))}
                className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-colors"
              />
              <p className="text-xs text-gray-400 mt-1">
                39187 = Teste Evolur | 39188 = Teste Ytalo
              </p>
            </div>

            <button
              type="button"
              onClick={gerarZpl}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-sm font-medium bg-emerald-800 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              Gerar ZPL
            </button>

            <button
              type="button"
              onClick={imprimir}
              disabled={imprimindo || !resultado || !conectado}
              className="px-4 py-2.5 rounded-xl text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {imprimindo ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              Imprimir
            </button>
          </div>

          {/* Erro */}
          {erro && (
            <div className="flex items-center gap-2 text-sm p-3 rounded-xl mb-4 bg-red-50 border border-red-200 text-red-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {erro}
            </div>
          )}

          {/* Resultado da impressão */}
          {impressaoResultado && (
            <div
              className={`flex items-start gap-3 rounded-xl p-4 mb-4 border ${
                impressaoResultado.status === "ok"
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              {impressaoResultado.status === "ok" ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
              )}
              <div>
                <p
                  className={`text-sm font-semibold ${
                    impressaoResultado.status === "ok"
                      ? "text-emerald-800"
                      : "text-amber-800"
                  }`}
                >
                  {impressaoResultado.status === "ok"
                    ? "Impress\u00e3o OK"
                    : impressaoResultado.status === "void"
                      ? "Etiqueta VOID"
                      : "Aten\u00e7\u00e3o"}
                </p>
                <p className="text-sm mt-0.5 text-gray-600">
                  {impressaoResultado.mensagem}
                </p>
              </div>
            </div>
          )}

          {/* Resultado do ZPL */}
          {resultado && (
            <div className="space-y-4">
              {/* Banner de sucesso */}
              <div className="rounded-xl p-4 bg-emerald-50 border border-emerald-200">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold text-sm text-emerald-900">
                    RFID gerado
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">EPC:</span>
                    <span className="ml-2 font-mono text-emerald-800">
                      {resultado.epc}
                    </span>
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
                  <div className="flex items-center gap-2 text-sm mt-3 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    {resultado.warning}
                  </div>
                )}
              </div>

              {/* ZPL Preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    ZPL Gerado
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={copiarZpl}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-stone-100 transition-colors text-emerald-800"
                    >
                      {copiado ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      {copiado ? "Copiado!" : "Copiar ZPL"}
                    </button>
                    <button
                      type="button"
                      onClick={baixarZpl}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-stone-100 transition-colors text-emerald-800"
                    >
                      <Download className="w-3 h-3" />
                      Baixar
                    </button>
                  </div>
                </div>
                <pre className="text-xs font-mono p-4 rounded-xl overflow-x-auto whitespace-pre bg-gray-900 text-green-400 border border-gray-700">
                  {resultado.zpl}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
