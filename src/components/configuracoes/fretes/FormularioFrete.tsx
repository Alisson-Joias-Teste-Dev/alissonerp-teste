"use client";

import { useState } from "react";
import { Save, X } from "lucide-react";
import { Button, MessageBox } from "@/components/ui";

const P = {
  bg:       "#f9fafb",
  card:     "#ffffff",
  border:   "#e5e7eb",
  creme:    "#111827",
  sage:     "#6b7280",
  muted:    "#9ca3af",
  dourado:  "#d97706",
  verde:    "#16a34a",
  vermelho: "#dc2626",
};

const BAIRROS_FORTALEZA = [
  "Aerolândia","Água Fria","Aldeota","Alto da Balança","Alto da Paz","Alto da Vila Prudente",
  "Ancuri","Antônio Bezerra","Areninhas","Autran Nunes","Bairro de Fátima","Barroso",
  "Bela Vista","Benfica","Boa Vista","Bom Futuro","Bom Jardim","Bom Sucesso",
  "Cais do Porto","Cajazeiras","Caça e Pesca","Canindezinho","Carlito Pamplona",
  "Casa Amarela","Castelão","Conjunto Ceará I","Conjunto Ceará II","Couto Fernandes",
  "Cristo Redentor","Curió","Damas","Demócrito Rocha","Dendê","Dias Macêdo",
  "Dois Córregos","Dom Lustosa","Edson Queiroz","Ellery","Engenheiro Luciano Cavalcante",
  "Farias Brito","Floresta","Granja Lisboa","Granja Portugal","Guararapes",
  "Henrique Jorge","Itaoca","Itaperi","Itinga","Jacarecanga","Jardim América",
  "Jardim das Oliveiras","Jardim Guanabara","Jardim Iracema","Jardim União",
  "João XXIII","José Bonifácio","José de Alencar","Jóquei Clube","Lagoa Redonda",
  "Lavras da Mangabeira","Luciano Cavalcante","Luís Cavalcante","Manoel Sátiro",
  "Maraponga","Meireles","Messejana","Mondubim","Monte Castelo","Montese",
  "Mucuripe","Nabuco","Nova Aldeota","Novo Mondubim","Padre Andrade",
  "Padre Júlio Maria","Parangaba","Parque Araxá","Parque Dois Irmãos",
  "Parque Genibaú","Parque Iracema","Parque Manibura","Parque Santa Rosa",
  "Passaré","Paupina","Pici","Pirambu","Planalto Ayrton Senna","Prefeito José Walter",
  "Praia de Iracema","Praia do Futuro I","Praia do Futuro II","Quintino Cunha",
  "Rodolfo Teófilo","Salinas","Sabiaguaba","São Bento","São Gerardo","São João do Tauape",
  "São Miguel","Serrinha","Siqueira","Tarumã","Tauape","Varjota","Vicente Pinzón",
  "Vila Ellery","Vila Manoel Sátiro","Vila União","Vila Velha","Zé Bonifácio",
];

interface FormularioFreteProps {
  onSalvar?: () => void;
  onCancelar?: () => void;
}

export default function FormularioFrete({ onSalvar, onCancelar }: FormularioFreteProps) {
  const [novoForm, setNovoForm] = useState({ bairro: "", municipio: "Fortaleza", valor: "" });
  const [savingNovo, setSavingNovo] = useState(false);
  const [erroNovo, setErroNovo] = useState("");
  const [bairroSugestoes, setBairroSugestoes] = useState<string[]>([]);
  const [bairroOpen, setBairroOpen] = useState(false);

  async function handleCriarFrete() {
    if (!novoForm.bairro.trim()) { setErroNovo("Bairro é obrigatório"); return; }
    setSavingNovo(true); setErroNovo("");
    try {
      const res = await fetch("/api/configuracoes/fretes-bairro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bairro: novoForm.bairro,
          municipio: novoForm.municipio,
          valor: parseFloat(novoForm.valor.replace(",", ".")) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      setNovoForm({ bairro: "", municipio: "Fortaleza", valor: "" });
      onSalvar?.();
    } catch (e) {
      setErroNovo(e instanceof Error ? e.message : "Erro ao cadastrar");
    } finally {
      setSavingNovo(false);
    }
  }

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ border: `1px solid ${P.border}`, backgroundColor: P.card }}>
      <p className="text-xs font-semibold" style={{ color: P.creme }}>Novo Bairro</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <label className="text-[10px] uppercase tracking-widest mb-1 block" style={{ color: P.muted }}>Bairro *</label>
          <input
            type="text"
            value={novoForm.bairro}
            onChange={e => {
              const v = e.target.value;
              setNovoForm(p => ({ ...p, bairro: v }));
              if (v.trim().length >= 1) {
                const sugs = BAIRROS_FORTALEZA.filter(b => b.toLowerCase().includes(v.toLowerCase())).slice(0, 8);
                setBairroSugestoes(sugs);
                setBairroOpen(sugs.length > 0);
              } else {
                setBairroOpen(false);
              }
            }}
            onBlur={() => setTimeout(() => setBairroOpen(false), 150)}
            onFocus={() => {
              if (novoForm.bairro.trim().length >= 1 && bairroSugestoes.length > 0) setBairroOpen(true);
            }}
            placeholder="Nome do bairro"
            className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: P.border, backgroundColor: P.bg, color: P.creme }}
          />
          {bairroOpen && (
            <div className="absolute z-50 w-full mt-1 rounded-xl border shadow-lg bg-white overflow-hidden" style={{ borderColor: P.border, maxHeight: 220, overflowY: "auto" }}>
              {bairroSugestoes.map(b => (
                <button
                  key={b}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-stone-50 border-b last:border-b-0"
                  style={{ borderColor: P.border, color: P.creme }}
                  onMouseDown={() => {
                    setNovoForm(p => ({ ...p, bairro: b }));
                    setBairroOpen(false);
                  }}
                >
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest mb-1 block" style={{ color: P.muted }}>Município</label>
          <input
            type="text"
            value={novoForm.municipio}
            onChange={e => setNovoForm(p => ({ ...p, municipio: e.target.value }))}
            className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: P.border, backgroundColor: P.bg, color: P.creme }}
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest mb-1 block" style={{ color: P.muted }}>Valor (R$)</label>
          <input
            type="text"
            value={novoForm.valor}
            onChange={e => setNovoForm(p => ({ ...p, valor: e.target.value }))}
            placeholder="0,00"
            className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: P.border, backgroundColor: P.bg, color: P.creme }}
          />
        </div>
      </div>
      {erroNovo && <MessageBox tipo="erro" mensagem={erroNovo} onFechar={() => setErroNovo("")} />}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => { onCancelar?.(); setErroNovo(""); }}>
          <X size={11} /> Cancelar
        </Button>
        <Button variant="primary" size="sm" loading={savingNovo} onClick={handleCriarFrete}>
          <Save size={11} /> Salvar
        </Button>
      </div>
    </div>
  );
}
