"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

// ─── Paleta ─────────────────────────────────────────────────────────────────
const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  bg: "#FAFAF7",
};

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface Mensagem {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  acao?: "configurar" | null;
}

interface Props {
  produtoId: number;
  produtoNome: string;
  produtoSku: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function gerarId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// ─── Componente ─────────────────────────────────────────────────────────────

export default function ChatPersonalizacao({
  produtoId,
  produtoNome,
  produtoSku,
}: Props) {
  const [mensagens, setMensagens] = useState<Mensagem[]>(() => {
    return [
      {
        id: "welcome",
        role: "assistant",
        content: `Olá! 👋 Eu sou a **LIA**, sua Arquiteta de Personalização.\n\nVou te ajudar a **configurar as regras de personalização** do produto **${produtoNome}** (SKU: ${produtoSku}). 💍✨\n\nMe diga como você quer que funcione:\n- Quantos nomes/gravações gratuitos?\n- Quanto cobrar por campo extra?\n- Regras de formatação (primeira letra maiúscula, sem números, etc.)\n- Qual o texto do campo (label)\n\nEu cuido de tudo e salvo automaticamente! 🛠️`,
        timestamp: new Date(),
      },
    ];
  });

  const [input, setInput] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Rola para o final quando novas mensagens chegam
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [mensagens]);

  // Foco no input ao montar
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Envia mensagem para a API
  const enviarMensagem = useCallback(async () => {
    const texto = input.trim();
    if (!texto || carregando) return;

    const msgUser: Mensagem = {
      id: gerarId(),
      role: "user",
      content: texto,
      timestamp: new Date(),
    };

    setMensagens((prev) => [...prev, msgUser]);
    setInput("");
    setCarregando(true);
    setErro(null);

    try {
      const res = await fetch("/api/lia/personalizar/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produtoId,
          mensagens: mensagens
            .filter((m) => m.id !== "welcome")
            .map((m) => ({ role: m.role, content: m.content })),
          mensagemAtual: texto,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Erro ao comunicar com a LIA");
      }

      const msgAssistant: Mensagem = {
        id: gerarId(),
        role: "assistant",
        content: data.reply,
        timestamp: new Date(),
        acao: data.acao ?? null,
      };

      setMensagens((prev) => [...prev, msgAssistant]);

      // Se a LIA retornou uma ação de configurar, executa automaticamente
      if (data.acao === "configurar" && data.configPayload) {
        await executarConfiguracao(data.configPayload);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Erro desconhecido";
      setErro(errorMessage);

      const msgErro: Mensagem = {
        id: gerarId(),
        role: "assistant",
        content: `Desculpe, tive um problema para me conectar. 😔\n\n**Erro:** ${errorMessage}\n\nPode tentar novamente?`,
        timestamp: new Date(),
      };
      setMensagens((prev) => [...prev, msgErro]);
    } finally {
      setCarregando(false);
    }
  }, [input, carregando, mensagens, produtoId]);

  // Executa a configuração via API
  const executarConfiguracao = useCallback(
    async (payload: Record<string, unknown>) => {
      setCarregando(true);
      try {
        const res = await fetch("/api/lia/personalizar/configurar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Erro ao salvar configuração");
        }

        const msgSucesso: Mensagem = {
          id: gerarId(),
          role: "assistant",
          content: `✅ **Configuração salva com sucesso!**\n\nAs regras de personalização foram aplicadas ao produto. 🎉\n\nSe precisar ajustar algo, é só me chamar!`,
          timestamp: new Date(),
        };
        setMensagens((prev) => [...prev, msgSucesso]);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Erro desconhecido";
        const msgErro: Mensagem = {
          id: gerarId(),
          role: "assistant",
          content: `❌ **Erro ao salvar configuração:** ${errorMessage}\n\nPode tentar novamente?`,
          timestamp: new Date(),
        };
        setMensagens((prev) => [...prev, msgErro]);
      } finally {
        setCarregando(false);
      }
    },
    [],
  );

  // Enter envia (sem Shift)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        enviarMensagem();
      }
    },
    [enviarMensagem],
  );

  // Limpa histórico
  const limparChat = useCallback(() => {
    setMensagens([
      {
        id: "welcome",
        role: "assistant",
        content: `Conversa reiniciada! 👋\n\nSou a LIA, arquiteta de personalização do **${produtoNome}**.\n\nMe diga como configurar as regras de personalização! 🛠️✨`,
        timestamp: new Date(),
      },
    ]);
    setErro(null);
  }, [produtoNome]);

  // Formata o conteúdo (markdown básico -> JSX)
  const formatarConteudo = useCallback((content: string) => {
    const partes = content.split(/(\*\*[^*]+\*\*)/g);
    return partes.map((parte, i) => {
      if (parte.startsWith("**") && parte.endsWith("**")) {
        return <strong key={i}>{parte.slice(2, -2)}</strong>;
      }
      return parte.split("\n").map((linha, j) => (
        <span key={`${i}-${j}`}>
          {linha}
          {j < parte.split("\n").length - 1 && <br />}
        </span>
      ));
    });
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      className="rounded-xl border overflow-hidden flex flex-col"
      style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
    >
      {/* Header do chat */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: C.cremeBorder, backgroundColor: C.creme }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: C.esmeralda }}
          >
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: C.esmeralda }}>
              LIA — Personalização
            </p>
            <p className="text-[10px] text-gray-500">
              Arquiteta de regras de personalização
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={limparChat}
            className="text-[10px] px-2 py-1 rounded border hover:bg-white/50 transition-colors"
            style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
            title="Reiniciar conversa"
          >
            ↺ Novo
          </button>
        </div>
      </div>

      {/* Mensagens */}
      <div
        ref={chatRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        style={{ minHeight: "280px", maxHeight: "400px", backgroundColor: "#fff" }}
      >
        {mensagens.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2.5 ${
              msg.role === "user" ? "flex-row-reverse" : ""
            }`}
          >
            {/* Avatar */}
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === "user"
                  ? "bg-gray-100"
                  : ""
              }`}
              style={{
                backgroundColor:
                  msg.role === "user" ? "#F3F4F6" : "#F0F7F4",
              }}
            >
              {msg.role === "user" ? (
                <User className="w-3.5 h-3.5 text-gray-500" />
              ) : (
                <Bot className="w-3.5 h-3.5" style={{ color: C.esmeralda }} />
              )}
            </div>

            {/* Balão */}
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "text-white"
                  : "text-gray-800 border"
              }`}
              style={{
                backgroundColor:
                  msg.role === "user" ? C.esmeralda : "#F9FAFB",
                borderColor:
                  msg.role === "user" ? "transparent" : C.cremeBorder,
              }}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm max-w-none prose-p:my-1 prose-strong:font-semibold">
                  {msg.acao === "configurar" && (
                    <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-100">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Configurando personalização...
                    </div>
                  )}
                  {formatarConteudo(msg.content)}
                </div>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Indicador de digitação */}
        {carregando && (
          <div className="flex items-start gap-2.5">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#F0F7F4" }}
            >
              <Bot className="w-3.5 h-3.5" style={{ color: C.esmeralda }} />
            </div>
            <div
              className="rounded-xl px-4 py-3 border flex items-center gap-2"
              style={{ borderColor: C.cremeBorder, backgroundColor: "#F9FAFB" }}
            >
              <Loader2
                className="w-4 h-4 animate-spin"
                style={{ color: C.sage }}
              />
              <span className="text-sm text-gray-500">LIA está pensando...</span>
            </div>
          </div>
        )}

        {/* Erro */}
        {erro && !carregando && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {erro}
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className="border-t px-4 py-3 shrink-0"
        style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
      >
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ex: quero 3 nomes gratis, R$ 100 por nome extra..."
              rows={1}
              className="w-full resize-none border rounded-lg px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036] transition-colors"
              style={{ borderColor: C.cremeBorder, minHeight: "40px" }}
              disabled={carregando}
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Enter para enviar · Shift+Enter para pular linha
            </p>
          </div>

          <button
            onClick={enviarMensagem}
            disabled={!input.trim() || carregando}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90 shrink-0"
            style={{ backgroundColor: C.esmeralda }}
            title="Enviar"
          >
            {carregando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
