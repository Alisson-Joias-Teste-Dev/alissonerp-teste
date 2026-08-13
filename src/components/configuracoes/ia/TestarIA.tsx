"use client";

import { useState, useRef } from "react";
import { Bot, Camera } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
import { ResultadoIA, P } from "./types";

export default function TestarIA() {
  const testFileRef = useRef<HTMLInputElement>(null);
  const [testFile, setTestFile] = useState<File | null>(null);
  const [testPeso, setTestPeso] = useState("");
  const [testando, setTestando] = useState(false);
  const [testResult, setTestResult] = useState<ResultadoIA | null>(null);

  async function testar() {
    if (!testFile || !testPeso) return;
    setTestando(true);
    setTestResult(null);
    const fd = new FormData();
    fd.append("file", testFile);
    fd.append("peso", testPeso);
    const res = await fetch("/api/pcp/validar-peso", {
      method: "POST",
      body: fd,
    });
    const result = (await res.json()) as ResultadoIA;
    setTestResult(result);
    setTestando(false);
  }

  return (
    <div className="space-y-3">
      <p
        className="text-[10px] uppercase tracking-widest font-medium"
        style={{ color: P.muted }}
      >
        Testar Validação
      </p>
      <div
        className="p-4 rounded-xl space-y-3"
        style={{ border: `1px solid ${P.border}`, backgroundColor: P.card }}
      >
        <div className="flex gap-3 flex-wrap">
          <div>
            <label
              className="text-[10px] uppercase tracking-wider block mb-1"
              style={{ color: P.muted }}
            >
              Foto da balança
            </label>
            <input
              ref={testFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                setTestFile(e.target.files?.[0] ?? null);
                setTestResult(null);
              }}
            />
            <button
              onClick={() => testFileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors"
              style={{
                border: `1px solid ${P.border}`,
                color: testFile ? P.verde : P.sage,
              }}
            >
              <Camera size={13} />
              {testFile
                ? testFile.name.slice(0, 20) + "…"
                : "Selecionar foto"}
            </button>
          </div>
          <div>
            <label
              className="text-[10px] uppercase tracking-wider block mb-1"
              style={{ color: P.muted }}
            >
              Peso digitado (g)
            </label>
            <input
              type="number"
              step="0.001"
              value={testPeso}
              onChange={(e) => {
                setTestPeso(e.target.value);
                setTestResult(null);
              }}
              placeholder="12.340"
              className="px-3 py-2 rounded-lg text-sm font-mono outline-none w-32"
              style={{
                backgroundColor: P.bg,
                border: `1px solid ${P.border}`,
                color: P.creme,
              }}
            />
          </div>
          <div className="flex items-end">
            <Button variant="primary" size="sm" loading={testando} disabled={!testFile || !testPeso} onClick={testar}>
              <Bot size={13} /> Testar IA
            </Button>
          </div>
        </div>

        {testResult && (
          <div
            className="px-4 py-3 rounded-xl text-sm space-y-1"
            style={
              testResult.match
                ? {
                    backgroundColor: P.verde + "18",
                    border: `1px solid ${P.verde}44`,
                  }
                : {
                    backgroundColor: P.vermelho + "18",
                    border: `1px solid ${P.vermelho}44`,
                  }
            }
          >
            <p
              className="font-semibold"
              style={{
                color: testResult.match ? P.verde : P.vermelho,
              }}
            >
              {testResult.match
                ? "✅ Peso confirmado"
                : "❌ " + testResult.mensagem}
            </p>
            {testResult.match && (
              <p style={{ color: P.sage }}>
                Balança: {testResult.peso_balanca}g
              </p>
            )}
            <p className="text-[11px]" style={{ color: P.muted }}>
              Provedor: {testResult.provedor} · Confiança:{" "}
              {testResult.confianca}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
