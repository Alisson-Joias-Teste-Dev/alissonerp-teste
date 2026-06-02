"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle, XCircle, Clock, ArrowRight, AlertCircle, Camera, RotateCcw, Package, Wrench } from "lucide-react";
import ConcluirConversaoSkuModal from "@/components/forms/ConcluirConversaoSkuModal";

const C = {
  esmeralda: "#184036",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  bg: "#FAFAF7",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pendente:         { label: "Pendente",         color: "#92400E", bg: "#FEF3C7", icon: Clock },
  aprovado:         { label: "Aprovado",         color: "#065F46", bg: "#D1FAE5", icon: CheckCircle },
  recusado:         { label: "Recusado",         color: "#991B1B", bg: "#FEE2E2", icon: XCircle },
  em_fabrica:       { label: "Na Fábrica",       color: "#7C3AED", bg: "#EDE9FE", icon: Wrench },
  aguardando_volta: { label: "Aguardando Volta", color: "#B45309", bg: "#FEF3C7", icon: Clock },
  concluido:        { label: "Concluído",        color: "#065F46", bg: "#D1FAE5", icon: CheckCircle },
};

const TIMELINE_STEPS: Record<string, { label: string; desc: string }[]> = {
  pendente: [
    { label: "Reservado", desc: "SKU origem reservado" },
    { label: "Aprovado",  desc: "Aprovação pendente" },
    { label: "Em Fábrica",desc: "Aguardando envio" },
    { label: "Execução",  desc: "Converter SKU" },
    { label: "Retorno",   desc: "Protocolo volta" },
    { label: "Concluído", desc: "Finalizado" },
  ],
  aprovado: [
    { label: "Reservado", desc: "SKU origem reservado" },
    { label: "Aprovado",  desc: "Aprovado" },
    { label: "Em Fábrica",desc: "Aguardando envio" },
    { label: "Execução",  desc: "Converter SKU" },
    { label: "Retorno",   desc: "Protocolo volta" },
    { label: "Concluído", desc: "Finalizado" },
  ],
  em_fabrica: [
    { label: "Reservado", desc: "SKU origem reservado" },
    { label: "Aprovado",  desc: "Aprovado" },
    { label: "Em Fábrica",desc: "Chegou na fábrica" },
    { label: "Execução",  desc: "Converter SKU" },
    { label: "Retorno",   desc: "Protocolo volta" },
    { label: "Concluído", desc: "Finalizado" },
  ],
  aguardando_volta: [
    { label: "Reservado", desc: "SKU origem reservado" },
    { label: "Aprovado",  desc: "Aprovado" },
    { label: "Em Fábrica",desc: "Chegou na fábrica" },
    { label: "Execução",  desc: "Serviço concluído" },
    { label: "Retorno",   desc: "Aguardando protocolo" },
    { label: "Concluído", desc: "Finalizado" },
  ],
  concluido: [
    { label: "Reservado", desc: "SKU origem reservado" },
    { label: "Aprovado",  desc: "Aprovado" },
    { label: "Em Fábrica",desc: "Chegou na fábrica" },
    { label: "Execução",  desc: "Serviço concluído" },
    { label: "Retorno",   desc: "Protocolo concluído" },
    { label: "Concluído", desc: "Finalizado" },
  ],
};

function Badge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "#6B7280", bg: "#F3F4F6" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, color: cfg.color, backgroundColor: cfg.bg }}>
      {status}
    </span>
  );
}

function Timeline({ status }: { status: string }) {
  const steps = TIMELINE_STEPS[status] ?? TIMELINE_STEPS.pendente;
  const STATUS_ORDER = ["pendente","aprovado","em_fabrica","aguardando_volta","concluido"];
  const activeIdx = status === "recusado"
    ? -1
    : status === "concluido"
    ? steps.length
    : Math.max(0, STATUS_ORDER.indexOf(status) + 1);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 16, overflowX: "auto", paddingBottom: 8 }}>
      {steps.map((s, i) => {
        const done = i < activeIdx;
        return (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 80 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                backgroundColor: done ? "#7C3AED" : "#E5E7EB",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: done ? "#fff" : "#9CA3AF", fontSize: 11, fontWeight: 700,
              }}>
                {done ? "✓" : i + 1}
              </div>
              <div style={{ fontSize: 11, color: done ? "#1F2937" : "#9CA3AF", fontWeight: done ? 600 : 400, whiteSpace: "nowrap" }}>
                {s.label}
              </div>
              <div style={{ fontSize: 10, color: "#6B7280", textAlign: "center", maxWidth: 100 }}>
                {s.desc}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ConversaoSkuDetalheClient({ ordem, conversao, tarefa, userRole, userNome }: any) {
  const [showConcluir, setShowConcluir] = useState(false);
  const isAdmin = userRole === "admin" || userRole === "desenvolvedor";
  const isFabrica = userRole === "operador" || userRole === "gerente_fabrica" || isAdmin;

  const podeExecutar = conversao.status_conversao === "em_fabrica" && isFabrica;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/estoque-comercial" style={{ color: C.esmeralda, fontSize: 13, textDecoration: "none" }}>
          ← Conversões
        </a>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1F2937", margin: 0 }}>
              Conversão SKU {ordem.numero_ordem}
            </h1>
            <Badge status={conversao.status_conversao} />
          </div>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>
            Criado por {conversao.criado_por_nome || "—"} em {format(new Date(ordem.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <Card title="Detalhes da Conversão">
          <Row label="Tipo" value="Conversão de SKU" />
          <Row label="Status" value={STATUS_CONFIG[conversao.status_conversao]?.label ?? conversao.status_conversao} />
          <Row label="Local Origem" value={conversao.local_origem_nome || "—"} />
          <Row label="Local Destino" value={conversao.local_destino_nome || "—"} />

          {conversao.servico_numero && (
            <Row label="Ordem Serviço" value={`${conversao.servico_numero} (${conversao.servico_status})`} />
          )}

          {conversao.motivo && (
            <Row label="Motivo" value={conversao.motivo} />
          )}
          {conversao.aprovado_por && (
            <Row label="Aprovado por" value={`${conversao.aprovado_por_nome} em ${format(new Date(conversao.aprovado_em), "dd/MM HH:mm")}`} />
          )}
          {conversao.recusado_por && (
            <Row label="Recusado por" value={`${conversao.recusado_por_nome} em ${format(new Date(conversao.recusado_em), "dd/MM HH:mm")}`} />
          )}
          {conversao.motivo_recusa && (
            <Row label="Motivo" value={conversao.motivo_recusa} />
          )}
        </Card>

        <Card title="SKU Origem → Destino">
          <div style={{ padding: "8px 0", borderBottom: `1px solid ${C.cremeBorder}` }}>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 2 }}>ORIGEM</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#1F2937" }}>{conversao.sku_origem_nome || "—"}</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>
              SKU: {conversao.sku_origem_cod || "—"} · Qtd: {conversao.sku_origem_quantidade} · Peso: {conversao.sku_origem_peso}g
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
            <ArrowRight size={20} style={{ color: "#7C3AED" }} />
          </div>

          <div style={{ padding: "8px 0" }}>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 2 }}>DESTINO</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#1F2937" }}>{conversao.sku_destino_nome || "—"}</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>
              SKU: {conversao.sku_destino_cod || "—"} · Qtd desejada: {conversao.sku_destino_quantidade_desejada}
            </div>
          </div>

          {conversao.quantidade_produzida && (
            <div style={{ padding: "8px 0", borderTop: `1px solid ${C.cremeBorder}` }}>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 2 }}>RESULTADO</div>
              <div style={{ fontSize: 13, color: "#1F2937" }}>
                Produzido: {conversao.quantidade_produzida} un · Peso final: {conversao.peso_final}g
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Sobra / Quebra */}
      {conversao.peso_sobra_real != null && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          <Card title="Sobra e Quebra">
            <Row label="Sobra Calculada" value={`${Number(conversao.peso_sobra_calculado).toFixed(3)}g`} />
            <Row label="Sobra Real (pesada)" value={`${Number(conversao.peso_sobra_real).toFixed(3)}g`} />
            <Row label="Quebra (operador)" value={`${Number(conversao.quebra || 0).toFixed(3)}g`} />
            <Row label="Destino Insumo" value={`ID: ${conversao.insumo_destino_sobra}`} />
          </Card>

          {conversao.foto_balanca_final && (
            <Card title="Fotos do Resultado">
              <div style={{ display: "flex", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Balança Final</div>
                  <img src={conversao.foto_balanca_final} alt="Balança" style={{ width: 180, height: 135, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.cremeBorder}` }} />
                </div>
                {conversao.foto_sobra && (
                  <div>
                    <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Sobra</div>
                    <img src={conversao.foto_sobra} alt="Sobra" style={{ width: 180, height: 135, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.cremeBorder}` }} />
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}

      <Card title="Progresso">
        <Timeline status={conversao.status_conversao} />
      </Card>

      {(conversao.foto_abertura || conversao.foto_recusa) && !conversao.foto_balanca_final && (
        <Card title="Fotos">
          <div style={{ display: "flex", gap: 16 }}>
            {conversao.foto_abertura && (
              <div>
                <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Abertura</div>
                <img src={conversao.foto_abertura} alt="Abertura" style={{ width: 200, height: 150, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.cremeBorder}` }} />
              </div>
            )}
            {conversao.foto_recusa && (
              <div>
                <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Recusa</div>
                <img src={conversao.foto_recusa} alt="Recusa" style={{ width: 200, height: 150, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.cremeBorder}` }} />
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Aprovação pendente */}
      {tarefa && tarefa.status === "aguardando_aprovacao" && isAdmin && (
        <div style={{
          marginTop: 24, padding: 16, borderRadius: 8,
          backgroundColor: "#FEF3C7", border: "1px solid #FDE68A",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <AlertCircle size={20} color="#92400E" />
          <span style={{ fontSize: 13, color: "#92400E" }}>
            Esta conversão SKU aguarda aprovação. Acesse o painel de tarefas para aprovar ou recusar.
          </span>
        </div>
      )}

      {/* Botão Executar Conversão */}
      {podeExecutar && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setShowConcluir(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold w-full justify-center"
            style={{ backgroundColor: "#7C3AED", color: "#fff" }}
          >
            <Wrench size={16} />
            Executar Conversão SKU
          </button>
        </div>
      )}

      <ConcluirConversaoSkuModal
        isOpen={showConcluir}
        onClose={() => setShowConcluir(false)}
        conversao={conversao}
        onSuccess={() => { window.location.reload(); }}
      />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E5E7EB", padding: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", margin: "0 0 12px" }}>{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
      <span style={{ color: "#6B7280" }}>{label}</span>
      <span style={{ color: "#1F2937", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
