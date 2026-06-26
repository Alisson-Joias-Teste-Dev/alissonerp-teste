"use client";

import React, { useState, useRef, useEffect } from "react";
import { TableRow, SchemaName } from "@/lib/gestao-estoque/types";
import { X, MessageSquare, Sparkles, Send, Loader2 } from "lucide-react";

interface AIChatProps {
  isOpen: boolean;
  onClose: () => void;
  contextData: TableRow[];
  tableName: string;
  schema: SchemaName;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const AIChat: React.FC<AIChatProps> = ({ isOpen, onClose, contextData, tableName, schema }) => {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  if (!isOpen) return null;

  async function enviar() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    const novasMensagens: ChatMsg[] = [...messages, { role: "user", content: msg }];
    setMessages(novasMensagens);
    setLoading(true);
    try {
      const res = await fetch("/api/gestao-estoque/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, contextData, tableName, schema }),
      });
      const j = await res.json();
      setMessages([...novasMensagens, { role: "assistant", content: j.text ?? "Sem resposta." }]);
    } catch (err) {
      setMessages([
        ...novasMensagens,
        { role: "assistant", content: `Erro: ${err instanceof Error ? err.message : "desconhecido"}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 h-[540px] bg-white border border-creme-200 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-alisson-gold text-white">
        <div className="flex items-center gap-2">
          <Sparkles size={18} />
          <h3 className="font-semibold">ALISSON AI</h3>
        </div>
        <button onClick={onClose} className="hover:opacity-80 transition-opacity">
          <X size={18} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 bg-creme-50">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center mt-12">
            <MessageSquare size={32} className="text-gray-400 mb-3" />
            <p className="text-gray-600 text-sm">
              Pergunte sobre <span className="text-alisson-gold font-semibold">{tableName}</span>.
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Ex: &quot;Qual produto tem maior estoque parado?&quot;
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
              m.role === "user"
                ? "ml-auto bg-alisson-gold text-white"
                : "mr-auto bg-white border border-creme-200 text-gray-800"
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="mr-auto bg-white border border-creme-200 text-gray-500 px-3 py-2 rounded-xl text-sm flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Pensando...
          </div>
        )}
      </div>

      <div className="p-3 border-t border-creme-200 bg-white flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          placeholder="Pergunte algo sobre os dados..."
          className="flex-1 bg-creme-50 border border-creme-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-alisson-gold"
          disabled={loading}
        />
        <button
          onClick={enviar}
          disabled={loading || !input.trim()}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-alisson-gold text-white hover:opacity-90 disabled:opacity-40 transition-all"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
};

export default AIChat;
