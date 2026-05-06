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
              background: reader.status.connected ? "#059669"
                : reader.status.ws_connected ? "#F59E0B"
                : "#DC2626",
            }}
          />
          <div>
            <p className="text-sm font-medium" style={{ color: "#184036" }}>
              {reader.status.connected
                ? `Leitor conectado (${reader.status.port})`
                : reader.status.ws_connected
                  ? "Bridge ativo, aguardando leitor..."
                  : "Bridge desconectado"}
            </p>
            <p className="text-xs text-gray-400">
              {reader.status.connected
                ? "Pronto para contagem"
                : reader.status.ws_connected
                  ? `Pressione o gatilho do TSL 1128 para conectar`
                  : "Inicie a ponte com npm run tsl-bridge"}
            </p>
          </div>
        </div>
        </div>
      </div>

      {/* Painel de controle (só aparece antes de enviar) */}
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

      {/* Resultado da conferência */}
      {resultado && (
        <div className="space-y-4">
          <div
            className="rounded-xl p-5"
            style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList size={18} style={{ color: "#184036" }} />
              <h2 className="font-bold" style={{ color: "#184036" }}>
                Inventario — {resultado.local_nome}
              </h2>
              {concluido && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#D1FAE5", color: "#065F46" }}>
                  Concluido
                </span>
              )}
            </div>

            {/* Cards resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-white rounded-lg p-3 text-center border" style={{ borderColor: "#E8DCC8" }}>
                <p className="text-2xl font-bold" style={{ color: "#184036" }}>{resultado.total_epcs_unicos}</p>
                <p className="text-xs text-gray-500">Peças lidas</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border" style={{ borderColor: "#E8DCC8" }}>
                <p className="text-2xl font-bold" style={{ color: "#184036" }}>{resultado.resumo.total_esperado}</p>
                <p className="text-xs text-gray-500">Esperado</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border" style={{ borderColor: "#E8DCC8" }}>
                <p className="text-2xl font-bold" style={{ color: resultado.resumo.produtos_com_divergencia > 0 ? "#DC2626" : "#059669" }}>
                  {resultado.resumo.produtos_com_divergencia}
                </p>
                <p className="text-xs text-gray-500">Divergencias</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border" style={{ borderColor: "#E8DCC8" }}>
                <p className="text-2xl font-bold" style={{ color: resultado.resumo.total_encontrado === resultado.resumo.total_esperado ? "#059669" : "#DC2626" }}>
                  {resultado.resumo.total_encontrado - resultado.resumo.total_esperado > 0 ? "+" : ""}
                  {resultado.resumo.total_encontrado - resultado.resumo.total_esperado}
                </p>
                <p className="text-xs text-gray-500">Diferenca</p>
              </div>
            </div>

            {/* Tabela de produtos */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase border-b" style={{ borderColor: "#E8DCC8" }}>
                    <th className="text-left py-2 pr-2 font-medium">Produto</th>
                    <th className="text-center px-2 py-2 font-medium">SKU</th>
                    <th className="text-center px-2 py-2 font-medium">Esperado</th>
                    <th className="text-center px-2 py-2 font-medium">Lido</th>
                    <th className="text-center px-2 py-2 font-medium">Div.</th>
                    <th className="text-right pl-2 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.produtos.map(p => {
                    const st = statusStyle(p.status);
                    return (
                      <tr key={p.produto_id ?? p.id_api_produto} className="border-b" style={{ borderColor: "#F3F4F6" }}>
                        <td className="py-2.5 pr-2">
                          <span className="truncate block max-w-[200px]" style={{ color: "#184036" }}>
                            {p.nome ?? `API #${p.id_api_produto}`}
                          </span>
                        </td>
                        <td className="text-center px-2 py-2.5 text-gray-400 text-xs">{p.sku ?? "-"}</td>
                        <td className="text-center px-2 py-2.5 font-medium">{p.esperado}</td>
                        <td className="text-center px-2 py-2.5 font-medium">{p.encontrado}</td>
                        <td className="text-center px-2 py-2.5 font-medium" style={{
                          color: p.divergencia === 0 ? "#6B7280"
                            : p.divergencia < 0 ? "#DC2626" : "#F59E0B"
                        }}>
                          {p.divergencia > 0 ? `+${p.divergencia}` : p.divergencia}
                        </td>
                        <td className="text-right pl-2 py-2.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.text }}>
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Nao identificados */}
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

            {/* Botao concluir */}
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
      )}

      {/* Lista ao vivo (só enquanto nao enviou) */}
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
