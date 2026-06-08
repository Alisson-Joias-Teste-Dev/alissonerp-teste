/**
 * Rastreio público de entrega — /rastreio/[codigo]
 *
 * REGRA DE NEGÓCIO: página pública (sem autenticação) para que o cliente
 * ou qualquer pessoa com o código da entrega possa consultar o status.
 * Exibe apenas informações não-sensíveis: código, status, data de criação.
 *
 * O QUE: busca a entrega pelo codigo_entrega e exibe status formatado.
 * POR QUE: transparência — o cliente pode acompanhar sua entrega sem
 * precisar de login no ERP.
 * IMPACTO SE REMOVIDO: clientes perdem acesso ao autoatendimento de
 * rastreamento, gerando mais chamadas para a loja.
 */

import { Metadata } from "next";
import sql from "@/lib/db";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ codigo: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { codigo } = await params;
  return {
    title: `Rastreio ${codigo} — Alisson Joias`,
  };
}

export default async function RastreioPage({ params }: Props) {
  const { codigo } = await params;

  // Busca a entrega pelo código público (codigo_entrega)
  const [entrega] = await sql`
    SELECT
      ev.codigo_entrega,
      ev.situacao,
      ev.forma_entrega,
      ev.data_saida,
      ev.data_retirada,
      ev.data_entrega_realizada,
      ev.correios_rastreio,
      ev.created_at,
      ve.numero_venda
    FROM alissonerp.entregas_venda ev
    LEFT JOIN alissonerp.vendas_erp ve ON ve.id = ev.venda_id
    WHERE ev.codigo_entrega = ${codigo}
    LIMIT 1
  `;

  if (!entrega) {
    return (
      <main style={styles.main}>
        <div style={styles.card}>
          <h1 style={styles.title}>Código não encontrado</h1>
          <p style={styles.text}>
            O código <strong>{codigo}</strong> não corresponde a nenhuma entrega
            registrada no sistema.
          </p>
          <p style={styles.hint}>
            Verifique se o código foi digitado corretamente ou entre em contato
            com a loja.
          </p>
        </div>
      </main>
    );
  }

  const statusLabel = getStatusLabel(entrega.situacao, entrega);
  const statusColor = getStatusColor(entrega.situacao);

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        {/* Cabeçalho */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              display: "inline-block",
              padding: "8px 16px",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              backgroundColor: statusColor.bg,
              color: statusColor.text,
              marginBottom: 12,
            }}
          >
            {statusLabel}
          </div>
          <h1 style={styles.title}>Rastreamento de Entrega</h1>
          <p style={{ ...styles.mono, fontSize: 18, color: "#184036" }}>
            {entrega.codigo_entrega}
          </p>
        </div>

        {/* Timeline simplificada */}
        <div style={styles.timeline}>
          <TimelineStep
            label="Entrega criada"
            date={entrega.created_at}
            done={true}
          />
          {entrega.data_saida && (
            <TimelineStep
              label="Retirada da loja"
              date={entrega.data_saida}
              done={true}
            />
          )}
          {entrega.data_retirada && (
            <TimelineStep
              label="Retirada pelo cliente"
              date={entrega.data_retirada}
              done={true}
            />
          )}
          {entrega.data_entrega_realizada && (
            <TimelineStep
              label="Entregue ao cliente"
              date={entrega.data_entrega_realizada}
              done={true}
            />
          )}
          {!entrega.data_entrega_realizada &&
            entrega.situacao !== "cancelada" && (
              <TimelineStep
                label={
                  entrega.forma_entrega === "motoboy"
                    ? "Aguardando entrega ao cliente"
                    : "Aguardando retirada"
                }
                date={null}
                done={false}
              />
            )}
        </div>

        {/* Info extra */}
        <div style={{ ...styles.infoBox, marginTop: 24 }}>
          {entrega.correios_rastreio && (
            <p style={styles.text}>
              📦 Código de rastreio:{" "}
              <strong>{entrega.correios_rastreio}</strong>
            </p>
          )}
          <p style={styles.hint}>
            Em caso de dúvidas, entre em contato com a loja informando o código
            acima.
          </p>
        </div>
      </div>
    </main>
  );
}

function TimelineStep({
  label,
  date,
  done,
}: {
  label: string;
  date: string | null;
  done: boolean;
}) {
  return (
    <div style={styles.step}>
      <div
        style={{
          ...styles.dot,
          backgroundColor: done ? "#184036" : "#E8DCC8",
        }}
      />
      <div style={{ flex: 1 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: done ? 600 : 400,
            color: done ? "#184036" : "#9CA3AF",
          }}
        >
          {label}
        </span>
        {date && (
          <span style={{ fontSize: 12, color: "#6B7280", display: "block" }}>
            {fmt(new Date(date))}
          </span>
        )}
      </div>
    </div>
  );
}

function getStatusLabel(situacao: string, entrega: any): string {
  if (situacao === "cancelada") return "Cancelada";
  if (situacao === "confirmada") return "Entregue";
  if (entrega.data_saida) return "Em trânsito";
  return "Pendente";
}

function getStatusColor(situacao: string) {
  switch (situacao) {
    case "confirmada":
      return { bg: "#D1FAE5", text: "#065F46" };
    case "cancelada":
      return { bg: "#F3F4F6", text: "#6B7280" };
    default:
      return { bg: "#FEF3C7", text: "#92400E" };
  }
}

function fmt(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Estilos inline (página pública, sem Tailwind carregado)
const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAFAF7",
    padding: 16,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    maxWidth: 480,
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 32,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "#184036",
    marginBottom: 8,
  },
  text: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 1.6,
  },
  hint: {
    fontSize: 13,
    color: "#9CA3AF",
    lineHeight: 1.5,
  },
  mono: {
    fontFamily: '"SF Mono", "Fira Code", monospace',
    fontWeight: 600,
  },
  timeline: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 0,
  },
  step: {
    display: "flex",
    gap: 12,
    paddingBottom: 20,
    position: "relative" as const,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    marginTop: 4,
    flexShrink: 0,
    border: "2px solid #E8DCC8",
  },
  infoBox: {
    padding: 16,
    backgroundColor: "#FAFAF7",
    borderRadius: 8,
    border: "1px solid #E8DCC8",
  },
};
