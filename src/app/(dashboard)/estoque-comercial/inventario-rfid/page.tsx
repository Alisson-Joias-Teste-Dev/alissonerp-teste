"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, ScanLine, Loader2, CheckCircle,
  ClipboardList, Play, Square, Send, Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTslReader } from "@/lib/tsl-websocket";

interface LocalEstoque { id: number; nome: string; }

interface ProdutoInventario {
  produto_id: number | null;
  id_api_produto: number | null;
  sku: string | null;
  nome: string | null;
  esperado: number;
  encontrado: number;
  divergencia: number;
  epcs: string[];
  status: "ok" | "faltando" | "excedente" | "nao_cadastrado";
}

interface ResultadoInventario {
  ok: boolean;
  local_estoque_id: number;
  local_nome: string;
  total_epcs: number;
  total_epcs_unicos: number;
  nao_identificados: string[];
  produtos: ProdutoInventario[];
  resumo: {
    total_produtos: number;
    total_esperado: number;
    total_encontrado: number;
    produtos_com_divergencia: number;
    faltando: number;
    excedente: number;
    nao_cadastrado: number;
  };
}

const STATUS_CFG: Record<string, { bg: string; text: string; label: string }> = {
  ok:           { bg: "#D1FAE5", text: "#065F46", label: "OK" },
  faltando:     { bg: "#FEE2E2", text: "#991B1B", label: "Faltando" },
  excedente:    { bg: "#FEF3C7", text: "#92400E", label: "Excedente" },
  nao_cadastrado: { bg: "#F3F4F6", text: "#6B7280", label: "Nao cadastrado" },
};

export default function InventarioRfidPage() {
  const router = useRouter();
  const reader = useTslReader();
  const [locais, setLocais] = useState<LocalEstoque[]>([]);
  const [localId, setLocalId] = useState(2);
  const [resultado, setResultado] = useState<ResultadoInventario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  const [concluido, setConcluido] = useState(false);
  // Linha de produto expandida no resultado (mostra o chip de cada peça)
  const [rfidExpandido, setRfidExpandido] = useState<number | null>(null);
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [produtos, setProdutos] = useState<Record<string, { sku?: string; nome?: string }>>({});
  const lookupRef = useRef<Record<string, { sku?: string; nome?: string }>>({});
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/locais-estoque")
      .then(r => r.json())
      .then(d => setLocais(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (reader.scanning) {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimer(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [reader.scanning]);

  useEffect(() => {
    if (reader.epcs.length === 0) return;
    const semInfo = reader.epcs.filter(e => !lookupRef.current[e.epc]);
    if (semInfo.length === 0) return;

    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    lookupTimerRef.current = setTimeout(() => {
      const pendentes = reader.epcs.filter(e => !lookupRef.current[e.epc]).map(e => e.epc);
      if (pendentes.length === 0) return;
      fetch("/api/rfid/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epcs: pendentes }),
      }).then(r => r.ok && r.json()).then((data: any) => {
        if (!data?.resultados) return;
        for (const p of data.resultados) {
          lookupRef.current[p.epc] = p;
        }
        setProdutos({ ...lookupRef.current });
      }).catch(() => {});
    }, 1000);
  }, [reader.epcs]);

  const fmtTimer = (s: number) => {
    const m = Math.floor(s / 60);
    const seg = s % 60;
    return `${String(m).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
  };

  const handleEnviar = useCallback(async () => {
    if (reader.epcs.length === 0) return;
    setEnviando(true);
    setResultado(null);
    setConcluido(false);
    try {
      const r = await fetch("/api/rfid/inventario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leituras: reader.epcs.map(e => e.epc),
          leitor_id: "TSL-1128",
          local_estoque_id: localId,
        }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      setResultado(await r.json());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setEnviando(false);
    }
  }, [reader.epcs, localId]);

  const handleConcluir = useCallback(async () => {
    if (!resultado) return;
    setConcluindo(true);
    try {
      const r = await fetch("/api/rfid/inventario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leituras: reader.epcs.map(e => e.epc),
          leitor_id: "TSL-1128",
          local_estoque_id: localId,
          concluir: true,
        }),
      });
      if (!r.ok) throw new Error("Erro ao concluir");
      setConcluido(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro");
    } finally {
      setConcluindo(false);
    }
  }, [resultado, reader.epcs, localId]);

  const uniqueEpcs = reader.epcs.filter(
    (e, i, a) => a.findIndex(x => x.epc === e.epc) === i
  );

  const statusStyle = (status: string) => STATUS_CFG[status] ?? STATUS_CFG.ok;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <button
        className="flex items-center gap-1.5 text-sm mb-6 hover:opacity-70 transition-opacity"
        style={{ color: "#184036" }}
        onClick={() => router.push("/estoque-comercial")}
      >
        <ArrowLeft size={15} />
        Estoque Comercial
      </button>

      <div className="flex items-center gap-3 mb-6">
        <ScanLine size={28} style={{ color: "#184036" }} />
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "Georgia, serif", color: "#184036" }}>
            Inventario RFID
          </h1>
          <p className="text-sm text-gray-500">TSL 1128 · {resultado ? "Conferencia" : "Contagem"}</p>
        </div>
      </div>

      <div
        className="rounded-xl p-4 mb-6 flex items-center justify-between"
        style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{
              background: reader.status.connected ? "#059669" : "#DC2626",
            }}
          />
          <div>
            <p className="text-sm font-medium" style={{ color: "#184036" }}>
              {reader.status.connected
                ? `Leitor conectado (${reader.status.port})`
                : "Desconectado — verifique se a ponte esta rodando"}
            </p>
            <p className="text-xs text-gray-400">
              {reader.status.connected
                ? "Pronto para contagem"
                : "Inicie a ponte com iniciar-tsl-bridge.bat"}
            </p>
          </div>
        </div>
      </div>

      {!resultado && (
        <div
          className="rounded-xl p-5 mb-6 space-y-4"
          style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}
        >
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500">Local:</label>
              <select
                className="border rounded-lg px-3 py-1.5 text-sm outline-none bg-white"
                style={{ borderColor: "#E8DCC8" }}
                value={localId}
                onChange={e => setLocalId(Number(e.target.value))}
                disabled={reader.scanning}
              >
                {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
            {reader.scanning && (
              <span className="text-sm font-mono" style={{ color: "#2563EB" }}>
                ⏱ {fmtTimer(timer)}
              </span>
            )}
            <span className="text-sm font-semibold" style={{ color: "#184036" }}>
              {uniqueEpcs.length} peça{uniqueEpcs.length !== 1 ? "s" : ""}
            </span>
          </div>

          {reader.epcs.length > 20 && (
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, reader.epcs.length / 3)}%`,
                  background: "linear-gradient(90deg, #184036, #059669)",
                }}
              />
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            {!reader.scanning ? (
              <button
                onClick={reader.startScanning}
                disabled={!reader.status.connected}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: reader.status.connected ? "#184036" : "#9CA3AF", color: "#F3EADA" }}
              >
                <Play size={15} />
                Iniciar Contagem
              </button>
            ) : (
              <button
                onClick={reader.stopScanning}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: "#DC2626", color: "#F3EADA" }}
              >
                <Square size={15} />
                Parar
              </button>
            )}
            <button
              onClick={reader.reset}
              disabled={reader.epcs.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: reader.epcs.length > 0 ? "#374151" : "#9CA3AF", color: "#F3EADA" }}
            >
              <Trash2 size={15} />
              Limpar
            </button>
            {!reader.scanning && uniqueEpcs.length > 0 && (
              <button
                onClick={handleEnviar}
                disabled={enviando}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: "#059669", color: "#F3EADA" }}
              >
                {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Conferir ({uniqueEpcs.length})
              </button>
            )}
          </div>
        </div>
      )}

      {resultado && (() => {
        // Contagem dupla PEÇAS × SKUs a partir do relatório da conferência
        const produtos = resultado.produtos;
        const skus = produtos.length;
        const esperadoPecas = resultado.resumo.total_esperado;
        const lidoPecas = resultado.resumo.total_encontrado;
        const faltandoPecas = produtos.reduce((acc, p) => acc + (p.divergencia < 0 ? -p.divergencia : 0), 0);
        const excessoPecas  = produtos.reduce((acc, p) => acc + (p.divergencia > 0 ? p.divergencia : 0), 0);
        const faltandoSkus = produtos.filter(p => p.status === "faltando").length;
        const excessoSkus  = produtos.filter(p => p.status === "excedente" || p.status === "nao_cadastrado").length;
        // Veredito em uma linha
        const veredParts: string[] = [];
        if (faltandoPecas > 0) veredParts.push(`Falta ${faltandoPecas} peça${faltandoPecas > 1 ? "s" : ""}`);
        if (excessoPecas > 0) veredParts.push(`${excessoPecas} peça${excessoPecas > 1 ? "s" : ""} a mais`);
        const veredTexto = veredParts.length ? veredParts.join(" · ") : "Bateu certo";
        const vStyle = faltandoPecas > 0 ? { bg: "#FEF2F2", bd: "#FCA5A5", tx: "#991B1B" }
          : excessoPecas > 0 ? { bg: "#EFF6FF", bd: "#BFDBFE", tx: "#1E40AF" }
          : { bg: "#F0FDF4", bd: "#BBF7D0", tx: "#065F46" };
        const cards = [
          { label: "Esperado", pecas: esperadoPecas, skus, color: "#184036" },
          { label: "Lido",     pecas: lidoPecas,     skus, color: "#184036" },
          { label: "Faltando", pecas: faltandoPecas, skus: faltandoSkus, color: "#DC2626" },
          { label: "Excesso",  pecas: excessoPecas,  skus: excessoSkus,  color: "#2563EB" },
        ];
        return (
        <div className="space-y-4">
          <div
            className="rounded-xl p-5"
            style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}
          >
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <ClipboardList size={18} style={{ color: "#184036" }} />
              <h2 className="font-bold" style={{ color: "#184036" }}>
                Conferência — {resultado.local_nome}
              </h2>
              {concluido && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#D1FAE5", color: "#065F46" }}>
                  Concluído
                </span>
              )}
              <span className="text-xs px-2 py-0.5 rounded-full font-medium ml-auto"
                style={{ background: vStyle.bg, color: vStyle.tx, border: `1px solid ${vStyle.bd}` }}>
                {veredTexto}
              </span>
            </div>

            {/* 4 cartões de MÉTRICA em contagem dupla peças×SKU */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {cards.map(c => (
                <div key={c.label} className="rounded-xl px-3 py-2.5" style={{ background: "#fff", border: "1px solid #E8DCC8" }}>
                  <p className="text-xs" style={{ color: "#8A857A" }}>{c.label}</p>
                  <p className="text-xl font-bold leading-tight" style={{ color: c.color }}>
                    {c.pecas} <span className="text-xs font-medium" style={{ color: "#9A948A" }}>pç</span>
                  </p>
                  <p className="text-[11px]" style={{ color: "#9A948A" }}>{c.skus} SKU{c.skus === 1 ? "" : "s"}</p>
                </div>
              ))}
            </div>

            {/* Linhas por produto (dot + sku/nome + contagem + status). Clique
                expande e mostra o número do chip de cada peça lida. */}
            <div className="flex flex-col gap-1.5">
              {produtos.map((p, idx) => {
                const st = statusStyle(p.status);
                const chave = p.produto_id ?? p.id_api_produto;
                const aberto = chave !== null && rfidExpandido === chave;
                const temChips = p.epcs.length > 0;
                return (
                  <div key={chave ?? p.sku ?? idx}>
                    <div className="flex items-center gap-3 px-4 py-2.5"
                      style={{
                        background: "#FAFAF7", border: "1px solid #F3F0E8",
                        borderRadius: aberto ? "0.75rem 0.75rem 0 0" : "0.75rem",
                        cursor: temChips ? "pointer" : "default",
                      }}
                      onClick={() => temChips && chave !== null && setRfidExpandido(prev => prev === chave ? null : chave)}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: st.text }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate font-mono" style={{ color: "#184036" }}>
                          {p.sku ?? `API #${p.id_api_produto}`}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{p.nome ?? "produto não cadastrado"}</p>
                      </div>
                      <span className="text-sm font-bold shrink-0" style={{ color: "#374151" }}>
                        {p.encontrado}/{p.esperado}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: st.bg, color: st.text }}>
                        {st.label}
                      </span>
                    </div>
                    {aberto && temChips && (
                      <div className="px-4 py-2 rounded-b-xl" style={{ background: "#FDFBF6", border: "1px solid #F3F0E8", borderTop: "none" }}>
                        {p.epcs.map((epc, i) => (
                          <div key={epc} className="flex items-center gap-2 py-1 text-[13px]"
                            style={{ borderTop: i === 0 ? "none" : "1px solid #F1ECE1" }}>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#059669" }} />
                            <span className="flex-1 min-w-0">peça {i + 1} · <span className="font-mono text-gray-500">chip {epc.length > 8 ? "…" + epc.slice(-8) : epc}</span></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {resultado.nao_identificados.length > 0 && (
              <details className="mt-4">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                  {resultado.nao_identificados.length} EPCs nao identificados
                </summary>
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {resultado.nao_identificados.map(epc => (
                    <div key={epc} className="text-xs text-gray-400 font-mono">{epc}</div>
                  ))}
                </div>
              </details>
            )}

            {!concluido && (
              <div className="mt-5 flex items-center gap-3 justify-end">
                <button
                  onClick={() => { setResultado(null); }}
                  className="px-4 py-2 rounded-xl text-sm"
                  style={{ border: "1px solid #E8DCC8", color: "#374151" }}
                >
                  Refazer contagem
                </button>
                <button
                  onClick={handleConcluir}
                  disabled={concluindo}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: "#184036", color: "#F3EADA" }}
                >
                  {concluindo ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                  Concluir Inventario
                </button>
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {!resultado && reader.epcs.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
            {reader.scanning ? "Escanenado..." : `${reader.epcs.length} leituras`}
          </p>
          <div className="space-y-1">
            {reader.epcs.slice(0, 50).map((item, i) => (
              <div key={`${item.epc}-${i}`} className="flex items-center gap-3 rounded-xl px-4 py-2 text-sm" style={{ border: "1px solid #F3F4F6" }}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: reader.scanning && i === 0 ? "#2563EB" : "#059669" }} />
                <span className="font-mono text-xs text-gray-500">{item.epc.length > 20 ? item.epc.slice(-16) : item.epc}</span>
                {!resultado && produtos[item.epc]?.sku && (
                  <span className="text-xs text-gray-400 truncate">{produtos[item.epc].sku}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(reader.epcs.length === 0 && !reader.scanning && !resultado) && (
        <div className="text-center py-16">
          <ScanLine size={40} className="mx-auto mb-3" style={{ color: "#D1D5DB" }} />
          <p className="text-gray-400 text-sm">Conecte o leitor e clique em &quot;Iniciar Contagem&quot;</p>
        </div>
      )}
    </div>
  );
}
