"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Loader2, PackageCheck, ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";

export default function EntradaEstoqueScanner() {
  const router = useRouter();
  const [scans, setScans] = useState<Array<{ epc: string; produto: string; ok: boolean; msg: string }>>([]);
  const [scanValue, setScanValue] = useState("");
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [scans]);

  async function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setScanValue("");
    setScanning(true);

    try {
      const r = await fetch("/api/rfid/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: trimmed,
          action: "entrada_estoque",
          warehouse_id: 2, // Loja
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setScans(prev => [{
          epc: data.rfid.epc,
          produto: data.rfid.produto ?? "Produto",
          ok: true,
          msg: "Entrada registrada",
        }, ...prev]);
      } else {
        setScans(prev => [{
          epc: trimmed,
          produto: data.rfid?.produto ?? "?",
          ok: false,
          msg: data.error ?? "Erro",
        }, ...prev]);
      }
    } catch {
      setScans(prev => [{ epc: trimmed, produto: "?", ok: false, msg: "Erro de conexão" }, ...prev]);
    } finally {
      setScanning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  const totalOk = scans.filter(s => s.ok).length;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <button
        className="flex items-center gap-1.5 text-sm mb-6 hover:opacity-70 transition-opacity"
        style={{ color: "#184036" }}
        onClick={() => router.push("/estoque-comercial")}
      >
        <ArrowLeft size={15} />
        Estoque Comercial
      </button>

      <div className="rounded-2xl p-5 sm:p-6 mb-6" style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}>
        <div className="flex items-center gap-3 mb-2">
          <ScanLine size={24} style={{ color: "#184036" }} />
          <h1 className="text-xl font-bold" style={{ fontFamily: "Georgia, serif", color: "#184036" }}>
            Entrada por Scanner
          </h1>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Escaneie as etiquetas RFID para dar entrada no estoque da Loja.
        </p>

        <div className="flex gap-2 mb-2">
          <input
            ref={inputRef}
            type="text"
            value={scanValue}
            onChange={e => setScanValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleScan(scanValue); }}
            placeholder="Aponte o leitor e escaneie..."
            className="flex-1 border rounded-xl px-4 py-3 text-sm outline-none font-mono text-lg"
            style={{ borderColor: "#E8DCC8", color: "#374151" }}
            autoFocus
            disabled={scanning}
          />
          <button
            onClick={() => handleScan(scanValue)}
            disabled={scanning || !scanValue.trim()}
            className="px-6 py-3 rounded-xl text-sm font-medium"
            style={{ background: "#184036", color: "#F3EADA", opacity: scanning ? 0.5 : 1 }}
          >
            {scanning ? <Loader2 size={16} className="animate-spin" /> : "OK"}
          </button>
        </div>

        {totalOk > 0 && (
          <div className="flex items-center gap-2 text-sm mt-3" style={{ color: "#059669" }}>
            <PackageCheck size={16} />
            <span>{totalOk} peça{totalOk > 1 ? "s" : ""} registrada{totalOk > 1 ? "s" : ""} no estoque</span>
          </div>
        )}
      </div>

      {/* Histórico da sessão */}
      {scans.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
            Últimas leituras
          </p>
          {scans.slice(0, 20).map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
              style={{ border: "1px solid #F3F4F6" }}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: s.ok ? "#059669" : "#DC2626" }}
              />
              <span className="font-mono text-xs text-gray-500">{s.epc.slice(-16)}</span>
              <span className="text-gray-700 flex-1 truncate">{s.produto}</span>
              <span className="text-xs" style={{ color: s.ok ? "#059669" : "#DC2626" }}>
                {s.msg}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
