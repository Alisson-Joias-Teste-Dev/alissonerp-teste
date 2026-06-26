"use client";

import { useState } from "react";
import { MessageBox } from "@/components/ui";
import IntegracaoWooCommerce from "./integracoes/IntegracaoWooCommerce";
import IntegracaoKommo from "./integracoes/IntegracaoKommo";
import IntegracaoTiny from "./integracoes/IntegracaoTiny";
import IntegracaoMercadoPago from "./integracoes/IntegracaoMercadoPago";
import IntegracaoPagBank from "./integracoes/IntegracaoPagBank";
import IntegracaoBancoInter from "./integracoes/IntegracaoBancoInter";
import IntegracaoWhatsappDev from "./integracoes/IntegracaoWhatsappDev";

export default function TabIntegracoes() {
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  return (
    <div className="space-y-4">
      {/* Mensagem global */}
      {msg && (
        <MessageBox tipo={msg.tipo} mensagem={msg.texto} onFechar={() => setMsg(null)} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <IntegracaoWooCommerce onMsg={setMsg} />
        <IntegracaoKommo onMsg={setMsg} />
        <IntegracaoTiny onMsg={setMsg} />
        <IntegracaoMercadoPago onMsg={setMsg} />
        <IntegracaoPagBank onMsg={setMsg} />
        <IntegracaoBancoInter onMsg={setMsg} />
        <IntegracaoWhatsappDev onMsg={setMsg} />
      </div>
    </div>
  );
}
