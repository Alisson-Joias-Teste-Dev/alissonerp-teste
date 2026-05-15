"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle, XCircle, Clock, AlertCircle, ArrowRight, Package, Camera, RotateCcw } from "lucide-react";

const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  bg: "#FAFAF7",
  dourado: "#DB9864",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pendente:  { label: "Pendente",  color: "#92400E", bg: "#FEF3C7", icon: Clock },
  aprovado:  { label: "Aprovado",  color: "#065F46", bg: "#D1FAE5", icon: CheckCircle },
  recusado:  { label: "Recusado",  color: "#991B1B", bg: "#FEE2E2", icon: XCircle },
  em_rota:   { label: "Em Rota",   color: "#1E40AF", bg: "#DBEAFE", icon: ArrowRight },
  concluido: { label: "Concluído", color: "#065F46", bg: "#D1FAE5", icon: CheckCircle },
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
  const allSteps = [
    { key: "pendente", label: "Reservado", desc: "Produtos reservados" },
    { key: "aprovado", label: "Aprovado", desc: "Aprovado por Alisson" },
    { key: "em_rota", label: "Em Rota", desc: "Saiu para fábrica" },
    { key: "concluido", label: "Concluído", desc: "Convertido em metal" },
  ];

  const steps = status === "recusado"
    ? allSteps.filter(s => s.key === "pendente" || s.key === "recusado" || s.key === "aprovado")
    : allSteps;

  const currentIdx = status === "recusado"
    ? 0
    : steps.findIndex(s => s.key === status) + (status === "recusado" ? -1 : 0);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 16 }}>
      {steps.map((s, i) => {
        const done = i <= currentIdx;
        const isLast = i === steps.length - 1;
        return (
          <div key={s.key} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                backgroundColor: done ? C.esmeralda : "#E5E7EB",
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
            {!isLast && <div style={{ flex: 1, height: 1, backgroundColor: done ? C.esmeralda : "#E5E7EB", marginBottom: 24 }} />}
          </div>
        );
      })}
    </div>
  );
}

export default function ConversaoDetalheClient({ ordem, conversao, itens, tarefa, userRole }: any) {
  const isAdmin = userRole === "admin" || userRole === "desenvolvedor";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/dashboard/estoque-comercial" style={{ color: C.esmeralda, fontSize: 13, textDecoration: "none" }}>
          ← Estoque Comercial
        </a>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1F2937", margin: 0 }}>
              Conversão {ordem.numero_ordem}
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
          <Row label="Peso Total" value={`${conversao.peso_total}g`} />
          <Row label="Quantidade Total" value={`${conversao.quantidade_total} itens`} />
          <Row label="Insumo Destino" value={`ID: ${conversao.insumo_destino}`} />
          <Row label="Status" value={STATUS_CONFIG[conversao.status_conversao]?.label ?? conversao.status_conversao} />
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

        <Card title="Produtos na Conversão">
          {itens.map((item: any, i: number) => (
            <div key={item.id} style={{
              padding: "8px 0",
              borderBottom: i < itens.length - 1 ? `1px solid ${C.cremeBorder}` : "none",
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#1F2937" }}>{item.produto_nome}</div>
              <div style={{ fontSize: 12, color: "#6B7280", display: "flex", gap: 16, marginTop: 2 }}>
                <span>SKU: {item.sku || "—"}</span>
                <span>Qtd: {item.quantidade}</span>
                <span>Peso: {item.peso_individual}g</span>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card title="Progresso">
        <Timeline status={conversao.status_conversao} />
      </Card>

      {(conversao.foto_abertura || conversao.foto_recusa) && (
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

      {tarefa && tarefa.status === "aguardando_aprovacao" && isAdmin && (
        <div style={{
          marginTop: 24, padding: 16, borderRadius: 8,
          backgroundColor: "#FEF3C7", border: "1px solid #FDE68A",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <AlertCircle size={20} color="#92400E" />
          <span style={{ fontSize: 13, color: "#92400E" }}>
            Esta conversão aguarda aprovação. Acesse o painel de tarefas para aprovar ou recusar.
          </span>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E5E7EB", padding: 16,
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: C.esmeralda, margin: "0 0 12px" }}>{title}</h3>
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
