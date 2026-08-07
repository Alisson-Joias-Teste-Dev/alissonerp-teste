# Regras de Negócio — Protocolo (transporte de peças, ordens, ouro e estoque)

> Documento **mantido à mão** (NÃO é auto-gerado como `docs/schema/`). Toda vez que mexermos no módulo de protocolo, atualizar aqui: regra nova → acrescenta; regra mudou → corrige.
> Fonte de schema (colunas/tabelas) = `docs/schema/` (auto-gerado). Aqui é o **porquê** e o **como** do negócio.
> ⚠️ O PR #141 (`fix/protocolo-ida-lista-fabrica`, ainda não mergeado) também cria este arquivo com a documentação da lista de Ida. Na hora do merge, **mesclar os dois** — nenhum dos dois conteúdos substitui o outro.

Última atualização: 2026-08-07 (PROTOCOLO DE TRANSFERÊNCIA DE ESTOQUE — tipo novo `transferencia`: movimenta produto do estoque comercial entre dois locais quaisquer (`locais_estoque`), com solicitação, reserva, transporte opcional por motoboy e recebimento no destino. Reusa `protocolos` + `protocolo_produtos` + `transferencias_estoque_comercial`; nenhuma tabela nova, nenhuma tela nova. Migration 368. Ver §5).

---

## 1. O que é o módulo

Protocolo é o **registro do transporte físico**: alguém entrega uma coisa a alguém, com foto dos dois lados e carimbo de quem/quando. O que viaja varia por `tipo_protocolo`:

| `tipo_protocolo` | O que viaja | O que a conclusão dispara |
|---|---|---|
| `fabrica` | ordens de produção (Loja ↔ Fábrica) | ida: cria PCP + ordem vira `em_andamento`. volta: cria `aprovacoes_consultora` |
| `service` | ordens de service (Loja ↔ Service) | idem `fabrica` |
| `ouro` / sangria | metal (`cofre_ouro_baixas`) | baixa vai de `em_trafego` → `recebido` |
| `interno` | ⚠️ **LEGADO** — 23 registros da v0 da Movimentação Interna | nada. Substituído por `solicitacoes_peca` (migrations 343/344). Filtrado fora das abas com `tipo_protocolo != 'interno'` |
| `transferencia` | **produtos do estoque comercial entre locais** (§5) | fecha a transferência: entrada no local de destino |

**Direção** (`enum_direcao_protocolo`: `ida`, `volta`) e **etapas** (`enum_etapas_protocolo`: `pendente`, `concluido`, `cancelado`).

**Tabelas centrais:** `alissonerp.protocolos` (cabeçalho), `protocolo_ordens` (N:N com ordens), `protocolo_produtos` (N:N com produtos), `protocolo_fotos` (órfã/legada — o código usa `foto_criacao`/`foto_conclusao` direto no cabeçalho).

**Quem faz o quê:**
- **Criar**: permissão por tipo, em `usuarios.tipos_protocolo_permitidos` (JSONB) — tela de permissões, nunca no código. `admin`/`desenvolvedor` ignoram a lista.
- **Concluir**: `ROLES_CONCLUIR_PROTOCOLO` (`src/lib/roles.ts`) = admin, desenvolvedor, diretor, `gerente_fabrica`, `gerente_loja`.
- **Motoboy**: cria e atualiza o **próprio** protocolo (RLS `motoboy_update_protocolos`), **nunca conclui** — a constraint `chk_motoboy_recebedor` impede motoboy = recebedor. Quem recebe é sempre alguém do destino.

**Trigger de conclusão:** `fn_concluir_protocolo` (BEFORE UPDATE, migration 021) — **zona no-touch**, não mexer sem autorização. Ela varre `protocolo_ordens`; protocolo **sem ordens** passa por ela sem efeito nenhum (loop vazio), só grava `data_conclusao`. É por isso que sangria e transferência podem reusar a mesma tabela sem risco de disparar PCP.

---

## 2. Fluxo de ordens (ida e volta)

1. `POST /api/protocolo` — cria o protocolo com `etapas='pendente'`, foto de criação obrigatória no front, e vincula as ordens.
2. `PATCH /api/protocolo/[id]` com `etapas='concluido'` — o recebedor confirma com foto. Dispara `fn_concluir_protocolo`.

**Regra da lista de Ida:** feito um protocolo de ida OU de volta, a ordem some da lista de disponíveis; só volta por **reprovação da consultora** (`aprovacoes_consultora.etapas='reprovado'`, comparação `>=` porque a linha nasce no mesmo instante da conclusão da volta). Ver `vw_ordens_prontas_ida` e o PR #141.

---

## 3. Fluxo de sangria (ouro)

Protocolo vincula **1 baixa** (`baixa_id`). Ao abrir: baixa vai de `esperando_protocolo` → `em_trafego` e grava rastreio. Ao concluir: `em_trafego` → `recebido`. O metal só sai do cofre quando alguém assume o transporte.

---

## 4. Dívidas conhecidas (não corrigir sem confirmar)

- **47 protocolos de ida presos em `pendente`** (mais antigo 31/03), 6 deles vazios. Enquanto pendente, a ordem some da lista de disponíveis.
- `POST /api/protocolo` não recusa ida para ordem que já está na fábrica — a regra vive só na lista.
- Upload de foto é feito direto do client para o Storage (`NovaProtocoloModal`, `ProtocoloMotoboy`), enquanto o CLAUDE.md manda upload server-side via `src/lib/storage.ts`.
- No PATCH, a validação de role do recebedor só roda se `recebedor_id` vier junto com `etapas='concluido'`.

---

## 5. Protocolo de transferência de estoque (tipo `transferencia`)

### 5.1 O problema que resolve

Mover joia de um local de estoque para outro (Loja → Fábrica, Reposição → Loja, Fábrica → Loja…) já era possível pela tela de estoque comercial, mas **sem rastreabilidade**: não registrava quem transportou, não tinha foto, e a peça sumia do saldo sem ninguém assumir a responsabilidade pelo caminho. Das 271 transferências existentes, 24 cruzavam Loja ↔ Fábrica sem nenhum protocolo.

A partir daqui, **transferência de estoque comercial nasce de um protocolo** — porta única.

### 5.2 O ciclo

| Passo | Quem | O que grava | Efeito no estoque |
|---|---|---|---|
| 1. Solicitar | quem tem `transferencia` em `tipos_protocolo_permitidos` | `protocolos` (`tipo_protocolo='transferencia'`, `etapas='pendente'`, origem, destino, motoboy opcional) + `protocolo_produtos` (SKU + quantidade) | **reserva** cada item no local de origem (`reservas_estoque_comercial`, `status='ativo'`) — a peça continua no saldo físico mas sai do disponível, ninguém vende no PDV |
| 2. Coletar | motoboy (só quando há transporte) | cria `transferencias_estoque_comercial` (`status='pendente'`) por item, vinculada ao protocolo, + foto | **saída no local de origem** (trigger `fn_transferencia_ec_envio`) e a reserva é **efetivada** (deixa de segurar saldo que já saiu) |
| 3. Receber | `ROLES_CONCLUIR_PROTOCOLO` | `etapas='concluido'` + foto; conclui cada transferência vinculada | **entrada no local de destino** (trigger `fn_transferencia_ec_recebimento`) |
| — Cancelar | quem solicitou ou quem conclui | `etapas='cancelado'` + motivo obrigatório | solta a reserva (`status='cancelado'`); se já havia saído, cancela a transferência, que estorna a saída |

**Trajeto sem motoboy:** quando origem e destino ficam no mesmo prédio (hoje Reposição ↔ Loja, 210 das 271 transferências), o solicitante marca "sem motoboy" e o passo 2 desaparece — quem recebe faz a saída e a entrada no mesmo ato de confirmar. O campo `motoboy_id` fica nulo. Se amanhã esse trajeto passar a exigir transporte, é só escolher o motoboy no formulário: **nada muda no banco**.

### 5.3 Estado é derivado, não é coluna

Não existe estado `em_rota`. O que a tela mostra sai da combinação do protocolo com as transferências vinculadas:

| Protocolo | Transferências | Tela mostra |
|---|---|---|
| `pendente` | nenhuma | **Solicitado** — peça ainda na origem, reservada |
| `pendente` | `pendente` | **Em rota** — saiu da origem, ninguém recebeu |
| `concluido` | `concluido` | **Recebido** |
| `cancelado` | nenhuma ou `cancelado` | **Cancelado** |

**Por quê:** o estoque já é a verdade — a `vw_saldo_estoque_comercial_v2` inclusive já expõe a coluna `em_transito` (soma das transferências `pendente` por destino). Duplicar isso num enum criaria duas fontes que podem divergir.

### 5.4 Por que `direcao` fica sempre `ida`

`protocolos.direcao` é NOT NULL e só aceita `ida`/`volta`. Como o trajeto real agora vive em `local_origem_id`/`local_destino_id`, a direção perde o sentido aqui e é gravada **sempre como `ida`**, por dois motivos concretos:

- `fn_reposicao_entrada_volta` dispara em `direcao='volta' AND etapas='concluido'` — gravar `volta` chamaria uma regra de reposição que não tem nada a ver com transferência;
- a aba **Ida** da tela `/protocolo` filtra `direcao='ida' AND tipo_protocolo != 'interno'`, então o protocolo de transferência aparece na tela existente sem nenhuma mudança de filtro.

**Impacto se alterado:** trocar para `volta` faz o protocolo sumir da aba Ida e dispara a trigger de reposição indevidamente.

### 5.5 Reserva: por que existe

Entre a solicitação e a coleta pode passar o dia inteiro. Sem reserva, a consultora vende no PDV uma peça que já foi prometida à fábrica, e o conflito só aparece na hora da entrega. A reserva (mecanismo que já existe para venda e para ordem) resolve isso sem inventar nada.

**Por isso o cancelamento é obrigatório junto:** solicitação abandonada seguraria a peça para sempre — o módulo já tem o precedente de 47 protocolos de ida parados desde março.

### 5.6 Escolha do local

O formulário lista `locais_estoque` ativos, **menos** o grupo `Em Transito` (id 6) e seus filhos: trânsito aqui é a própria transferência `pendente`, não um local com saldo. Origem e destino têm de ser diferentes (a tabela de transferência já valida isso).

### 5.7 Onde isso vive na tela (nada novo)

| Tela existente | O que ganha |
|---|---|
| `/protocolo`, aba **Ida** | os protocolos de transferência entram pelo filtro que já existe |
| Botão **Novo Protocolo Ida** (dropdown por tipo) | mais um tipo, vindo de `tipos_protocolo_permitidos` |
| `NovaProtocoloModal` | modo `produtos` (origem, destino, transporte, lista de SKU + quantidade), ao lado dos modos `ordens` e `sangria` que já existem |
| `ConcluirProtocoloModal` | bloco de produtos, ao lado do bloco de ordens e do de sangria — o modal já trata protocolo sem ordens |
| `ProtocoloMotoboy` | card de confirmar coleta, mesmo botão e mesma foto dos outros tipos |

### 5.8 Migration 368

| Mudança | Para quê |
|---|---|
| `protocolos.local_origem_id`, `protocolos.local_destino_id` (FK, nulos) | o trajeto. Nulos nos protocolos antigos, que continuam funcionando igual |
| `protocolo_produtos.quantidade` (NOT NULL default 1) | vários SKUs com quantidade no mesmo protocolo |
| `transferencias_estoque_comercial.protocolo_id` (FK, nulo) | amarra o movimento de estoque ao protocolo |
| `reservas_estoque_comercial.protocolo_id` (FK, nulo) | saber qual reserva soltar na coleta ou no cancelamento |
| `protocolos.motivo_cancelamento` (texto) | motivo obrigatório ao cancelar |
| `ALTER TYPE enum_etapas_protocolo ADD VALUE 'cancelado'` | aditivo — nenhum código existente compara com ele |
