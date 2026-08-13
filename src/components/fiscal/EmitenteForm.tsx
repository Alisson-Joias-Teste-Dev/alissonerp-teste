"use client";

import { useEffect, useState } from "react";
import { X, Save, Eye, EyeOff, Loader2 } from "lucide-react";

const C = { esmeralda: "#184036", cremeBorder: "#E8DCC8", creme: "#F3EADA" };

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR",
  "PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export interface Emitente {
  id?: number;
  nome_fantasia?: string | null;
  razao_social: string;
  cnpj: string;
  ie?: string | null;
  im?: string | null;
  regime_tributario?: 1 | 2 | 3;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  codigo_ibge_municipio?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  ambiente?: "homologacao" | "producao";
  serie_nfe?: number;
  serie_nfce?: number;
  proxima_nfe?: number;
  proxima_nfce?: number;
  local_estoque_id?: number | null;
  ativo?: boolean;
  tem_token?: boolean;
}

interface Props {
  id: number | null;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY: Emitente = {
  razao_social: "",
  cnpj: "",
  regime_tributario: 1,
  ambiente: "homologacao",
  serie_nfe: 1,
  serie_nfce: 1,
  proxima_nfe: 1,
  proxima_nfce: 1,
};

export default function EmitenteForm({ id, onClose, onSaved }: Props) {
  const [data, setData] = useState<Emitente>(EMPTY);
  const [focusToken, setFocusToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (id == null) { setData(EMPTY); setFocusToken(""); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/fiscal/emitentes/${id}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok) { setErr(j.error ?? "Erro ao carregar"); return; }
        setData(j);
        setFocusToken("");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  function update<K extends keyof Emitente>(k: K, v: Emitente[K]) {
    setData((prev) => ({ ...prev, [k]: v }));
  }

  async function salvar() {
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        nome_fantasia: data.nome_fantasia || null,
        razao_social: data.razao_social.trim(),
        ie: data.ie || null,
        im: data.im || null,
        regime_tributario: data.regime_tributario ?? 1,
        logradouro: data.logradouro || null,
        numero: data.numero || null,
        complemento: data.complemento || null,
        bairro: data.bairro || null,
        codigo_ibge_municipio: data.codigo_ibge_municipio || null,
        municipio: data.municipio || null,
        uf: data.uf || null,
        cep: data.cep ? data.cep.replace(/\D/g, "") : null,
        ambiente: data.ambiente ?? "homologacao",
        serie_nfe: data.serie_nfe ?? 1,
        serie_nfce: data.serie_nfce ?? 1,
        proxima_nfe: data.proxima_nfe ?? 1,
        proxima_nfce: data.proxima_nfce ?? 1,
        local_estoque_id: data.local_estoque_id ?? null,
      };
      if (id == null) {
        body.cnpj = data.cnpj.replace(/\D/g, "");
        if (focusToken) body.focus_token = focusToken;
      } else {
        // Na edicao so envia token se foi preenchido
        if (focusToken) body.focus_token = focusToken;
      }

      const res = id == null
        ? await fetch("/api/fiscal/emitentes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/fiscal/emitentes/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Erro");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8 border" style={{ borderColor: C.cremeBorder }}>
        <header
          className="px-6 py-4 flex items-center justify-between rounded-t-xl"
          style={{ background: C.creme }}
        >
          <h2 className="text-xl font-serif" style={{ color: C.esmeralda }}>
            {id == null ? "Novo Emitente" : "Editar Emitente"}
          </h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-900">
            <X size={22} />
          </button>
        </header>

        {loading ? (
          <div className="py-16 flex justify-center items-center text-gray-500">
            <Loader2 size={24} className="animate-spin mr-2" /> Carregando...
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {err && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                {err}
              </div>
            )}

            {/* Identificacao */}
            <section>
              <h3 className="text-sm font-medium mb-3" style={{ color: C.esmeralda }}>Identificação</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Razão Social *">
                  <input
                    value={data.razao_social}
                    onChange={(e) => update("razao_social", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Nome Fantasia">
                  <input
                    value={data.nome_fantasia ?? ""}
                    onChange={(e) => update("nome_fantasia", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label={id == null ? "CNPJ * (14 dígitos)" : "CNPJ (imutável)"}>
                  <input
                    value={data.cnpj}
                    onChange={(e) => update("cnpj", e.target.value.replace(/\D/g, "").slice(0, 14))}
                    className="input"
                    disabled={id != null}
                    placeholder="00000000000000"
                  />
                </Field>
                <Field label="Regime Tributário">
                  <select
                    value={data.regime_tributario ?? 1}
                    onChange={(e) => update("regime_tributario", Number(e.target.value) as 1 | 2 | 3)}
                    className="input"
                  >
                    <option value={1}>Simples Nacional</option>
                    <option value={2}>Lucro Presumido</option>
                    <option value={3}>Lucro Real</option>
                  </select>
                </Field>
                <Field label="Inscrição Estadual">
                  <input
                    value={data.ie ?? ""}
                    onChange={(e) => update("ie", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Inscrição Municipal">
                  <input
                    value={data.im ?? ""}
                    onChange={(e) => update("im", e.target.value)}
                    className="input"
                  />
                </Field>
              </div>
            </section>

            {/* Endereco */}
            <section>
              <h3 className="text-sm font-medium mb-3" style={{ color: C.esmeralda }}>Endereço</h3>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <Field label="Logradouro" span="md:col-span-4">
                  <input
                    value={data.logradouro ?? ""}
                    onChange={(e) => update("logradouro", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Número" span="md:col-span-1">
                  <input
                    value={data.numero ?? ""}
                    onChange={(e) => update("numero", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Complemento" span="md:col-span-1">
                  <input
                    value={data.complemento ?? ""}
                    onChange={(e) => update("complemento", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Bairro" span="md:col-span-3">
                  <input
                    value={data.bairro ?? ""}
                    onChange={(e) => update("bairro", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Município" span="md:col-span-3">
                  <input
                    value={data.municipio ?? ""}
                    onChange={(e) => update("municipio", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="UF" span="md:col-span-1">
                  <select
                    value={data.uf ?? ""}
                    onChange={(e) => update("uf", e.target.value)}
                    className="input"
                  >
                    <option value="">—</option>
                    {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
                <Field label="CEP" span="md:col-span-2">
                  <input
                    value={data.cep ?? ""}
                    onChange={(e) => update("cep", e.target.value.replace(/\D/g, "").slice(0, 8))}
                    className="input"
                    placeholder="00000000"
                  />
                </Field>
                <Field label="Código IBGE Município (7 dígitos)" span="md:col-span-3">
                  <input
                    value={data.codigo_ibge_municipio ?? ""}
                    onChange={(e) => update("codigo_ibge_municipio", e.target.value.replace(/\D/g, "").slice(0, 7))}
                    className="input"
                    placeholder="Ex: 3550308 (São Paulo)"
                  />
                </Field>
              </div>
            </section>

            {/* Fiscal */}
            <section>
              <h3 className="text-sm font-medium mb-3" style={{ color: C.esmeralda }}>Emissão Fiscal</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field label="Ambiente" span="md:col-span-2">
                  <select
                    value={data.ambiente ?? "homologacao"}
                    onChange={(e) => update("ambiente", e.target.value as "homologacao" | "producao")}
                    className="input"
                  >
                    <option value="homologacao">Homologação (testes)</option>
                    <option value="producao">Produção</option>
                  </select>
                </Field>
                <Field label="Local de Estoque ID" span="md:col-span-2">
                  <input
                    type="number"
                    value={data.local_estoque_id ?? ""}
                    onChange={(e) => update("local_estoque_id", e.target.value === "" ? null : Number(e.target.value))}
                    className="input"
                    placeholder="1=Fábrica, 2=Loja"
                  />
                </Field>

                <Field label="Série NF-e">
                  <input
                    type="number"
                    value={data.serie_nfe ?? 1}
                    onChange={(e) => update("serie_nfe", Number(e.target.value))}
                    className="input"
                  />
                </Field>
                <Field label="Série NFC-e">
                  <input
                    type="number"
                    value={data.serie_nfce ?? 1}
                    onChange={(e) => update("serie_nfce", Number(e.target.value))}
                    className="input"
                  />
                </Field>
                <Field label="Próxima NF-e">
                  <input
                    type="number"
                    value={data.proxima_nfe ?? 1}
                    onChange={(e) => update("proxima_nfe", Number(e.target.value))}
                    className="input"
                  />
                </Field>
                <Field label="Próxima NFC-e">
                  <input
                    type="number"
                    value={data.proxima_nfce ?? 1}
                    onChange={(e) => update("proxima_nfce", Number(e.target.value))}
                    className="input"
                  />
                </Field>

                <Field label="Token Focus NFe" span="md:col-span-4">
                  <div className="flex gap-2">
                    <input
                      type={showToken ? "text" : "password"}
                      value={focusToken}
                      onChange={(e) => setFocusToken(e.target.value)}
                      className="input flex-1"
                      placeholder={
                        id != null && data.tem_token
                          ? "Token salvo — deixe em branco para preservar"
                          : "Cole o token do painel Focus NFe"
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((s) => !s)}
                      className="px-3 rounded-lg border hover:bg-gray-50"
                      style={{ borderColor: C.cremeBorder }}
                    >
                      {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>
              </div>
            </section>

            <footer className="flex justify-end gap-2 pt-4 border-t" style={{ borderColor: C.cremeBorder }}>
              <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm" style={{ borderColor: C.cremeBorder }}>
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-white text-sm flex items-center gap-2 disabled:opacity-50"
                style={{ background: C.esmeralda }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </footer>
          </div>
        )}
      </div>
      <style jsx>{`
        :global(.input) {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid ${C.cremeBorder};
          border-radius: 0.5rem;
          background: white;
          font-size: 0.875rem;
        }
        :global(.input:focus) {
          outline: none;
          border-color: ${C.esmeralda};
        }
        :global(.input:disabled) {
          background: #F3F4F6;
          color: #6B7280;
        }
      `}</style>
    </div>
  );
}

function Field({ label, span = "", children }: { label: string; span?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${span}`}>
      <span className="block text-xs text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
