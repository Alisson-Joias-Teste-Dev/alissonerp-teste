"use client";

import NovaOrdemVendaBaseModal from "@/components/ordens/NovaOrdemVendaBaseModal";

export interface NovaOrdemFabricacaoModalProps {
  isOpen:     boolean;
  onClose:    () => void;
  onSuccess?: (numeroOrdem: string) => void;
  userId:     string;
  userName:   string;
}

export default function NovaOrdemFabricacaoModal(props: NovaOrdemFabricacaoModalProps) {
  return <NovaOrdemVendaBaseModal {...props} tipoOrdem="fabricacao" />;
}
