---
name: Transferência PCP - foto+IA obrigatória para metal
description: Transferência de metal no PCP exige foto da balança validada pela IA, igual aos apontamentos
type: feedback
---

Ao implementar ou modificar o fluxo de transferência PCP:
- Transferência de ouro (categoria_id=1): foto da balança OBRIGATÓRIA + validação IA (tolerância zero)
- Pedras: foto NÃO obrigatória na transferência
- Mesmo endpoint de validação: POST /api/pcp/validar-peso (tipo="metal")
- Foto upada para bucket "apontamento-fotos" (path: transferencias/{pcpId}/{timestamp}.ext)
- Botão confirmar desabilitado se metal selecionado e IA não confirmou (validacaoIA.match !== true)
- foto_balanca salva em transferencias_ordem.obs como [foto:path] até coluna ser adicionada:
  ALTER TABLE alissonerp.transferencias_ordem ADD COLUMN IF NOT EXISTS foto_balanca text;
