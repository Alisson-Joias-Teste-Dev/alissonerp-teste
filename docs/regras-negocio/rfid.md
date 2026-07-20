# Regras de Negócio — Módulo RFID

## 1. Formato do EPC

### Estrutura (96 bits = 24 dígitos numéricos)

```
1001{id_produto 9 dígitos}{serial 11 dígitos} = 24 caracteres
```

| Campo | Posição | Tamanho | Descrição |
|---|---|---|---|
| Prefixo | 1–4 | 4 | `1001` — prefixo fixo Alisson ERP |
| ID Produto | 5–13 | 9 | ID do produto no Tiny, zero-padded (`000039187`) |
| Serial | 14–24 | 11 | Sequencial global, zero-padded (`00000000001`) |

### Exemplo

- EPC: `100100003918700000000001`
- Formatado para display: `1001-000039187-00000000001`
- Prefixo: `1001`, Produto: `39187`, Serial: `1`

### Gravação no chip

Usa `^RFW,H` — grava EPC 96-bit em formato hex direto.

Cada par de caracteres do EPC é interpretado como um byte hex:
`"10"` → 0x10, `"01"` → 0x01, `"00"` → 0x00.

**Regra de ouro:** o EPC JÁ É o hex. NÃO usar `Buffer.from(epc, "ascii")`
nem `epcToHex()` — isso introduziria uma camada ASCII indesejada onde
o caractere `"1"` viraria 0x31 em vez do nibble 0x1.

### Formato legado (coexistência)

Etiquetas com prefixo `0000` foram geradas por sistema externo anterior.
Elas permanecem válidas e o sistema as reconhece via **lookup fallback**:

1. Tenta parsear o EPC como formato interno `1001` → extrai `id_produto`
2. Se falhar (prefixo diferente), faz `SELECT produto_id FROM joias_rfid WHERE epc = ?` para resolução direta

Isso permite que tags antigas em estoque continuem operacionais sem regravação.

## 2. Ciclo de vida da tag

```
                   ┌───────────────────────────────────┐
                   │                                   │
                   ▼                                   │
          [ cadastrar ]                                │
                   │                                   │
                   ▼                                   │
         pendente_impressao                            │
          │                    │                       │
          │ (gravação OK)      │ (falha)               │
          ▼                    ▼                       │
        ativo              [ reverter ]                │
                            DELETE registro             │
```

### Estados

| Estado | Descrição |
|---|---|
| `pendente_impressao` | Registro criado, EPC gerado, ZPL enviado — aguardando confirmação read-back |
| `ativo` | Gravação confirmada — tag está operacional |
| (removido) | Revertido por falha — registro deletado da tabela |

### Transições

1. **Cadastrar:** `POST /api/rfid/cadastrar`
   - Gera serial via `alissonerp.gerar_proximo_serial_rfid()`
   - Constrói EPC com `buildEpc(id_produto, serial)`
   - `INSERT joias_rfid` com status `pendente_impressao`
   - `INSERT joias_leituras` com evento `cadastro`
   - Retorna `{ epc, zpl }` ao front

2. **Confirmar:** `POST /api/rfid/confirmar-impressao`
   - Só pode ser chamado se o read-back confirmar EPC match
   - `UPDATE joias_rfid SET status = 'ativo' WHERE epc = ? AND status = 'pendente_impressao'`

3. **Reverter:** `POST /api/rfid/reverter`
   - Disparado quando a gravação falha (VOID, NO TAG FOUND, divergente)
   - Remove leituras de cadastro/reimpressao associadas
   - `DELETE FROM joias_rfid WHERE epc = ? AND status = 'pendente_impressao'`
   - Motivo registrado no payload da request

### Garantia de consistência

Nunca fica joia com status `pendente_impressao` sem etiqueta física.
Se o browser fechar durante o fluxo:
- Joia permanece `pendente_impressao`
- Futuro garbage collector pode detectar e limpar
- Serial já consumido (não reutilizado) — gap intencional

## 3. Serial

- Gerenciado pela função `alissonerp.gerar_proximo_serial_rfid()`
- Sequencial global (independente do produto)
- BIGINT, 11 dígitos zero-padded
- Incremento atômico (sem race condition)

## 4. Verificação de gravação (read-back)

Após enviar o ZPL, o sistema lê a resposta da impressora e interpreta:

### Comandos ZPL envolvidos

```
^RFW,H^FD{epcHex}^FS   — grava EPC
^RFR,H^FN1^FS          — relê EPC no campo 1
^HV1,12,EPC:,^FS       — devolve ao host "EPC:" + 12 bytes
```

### Interpretação da resposta (ordem de precedência)

| Condição | Status | Ação |
|---|---|---|
| Resposta vazia | `offline` | Alerta — impressora não respondeu |
| Contém `NO TAG FOUND` | `no_tag` | Reverte — sem etiqueta no campo |
| Contém `VOID` | `void` | Reverte — etiqueta invalidada |
| EPC lido == EPC esperado | `ok` | Confirma → `ativo` |
| EPC lido ≠ EPC esperado | `divergente` | Reverte — possível colisão |
| Contém `RFID OK` (sem EPC) | `ok` | Confirma (fallback) |
| Nenhuma das anteriores | `offline` | Alerta — resposta irreconhecível |

### Regra

**Só marcar `ativo` após read-back confirmar EPC match OU RFID OK.**
Nunca confirmar sem verificação.

## 5. Falhas de gravação

| Falha | Causa provável | Ação do sistema |
|---|---|---|
| `void` | Tag defeituosa ou potência insuficiente | Reverter (delete) + toast "Etiqueta invalidada" |
| `no_tag` | Etiqueta fora de posição ou ausente | Reverter + toast "Nenhuma etiqueta detectada" |
| `divergente` | Colisão (múltiplas tags no campo) | Reverter + toast "Divergência de EPC" |
| `offline` | Impressora desconectada/sem resposta | Toast de erro (não reverte — pode ser conexão) |

## 6. Permissões

| Role | Cadastrar tag | Calibrar (`^HR`) |
|---|---|---|
| `admin` | ✅ | ✅ |
| `desenvolvedor` | ✅ | ✅ |
| `gerente_fabrica` | ✅ | ✅ |
| `estoquista_fabrica` | ✅ | ❌ |
| Outros | ❌ (403) | ❌ (403) |

Definido em `src/lib/rfid/roles.ts`:
- `ROLES_CADASTRAR_RFID` = admin, desenvolvedor, gerente_fabrica, estoquista_fabrica
- `ROLES_CALIBRAR_RFID` = admin, desenvolvedor, gerente_fabrica

## 7. Hardware

- **Modelo:** Zebra ZD500R (desktop RFID printer)
- **Antena:** Single antenna A1 (elemento padrão para desktop)
- **Encoder:** ThingMagic UHF Gen2 V2 / ISO 18000-63 / RAIN
- **Resolução:** 203 dpi (8 dots/mm)
- **Mídia:** 74 × 20 mm jewelry tag
- **Pitch mínimo RFID:** 16 mm
- **Conexão:** USB 2.0 → Browser Print v1.3+ → HTTPS 9101

## 8. Calibração

Disponível em `/rfid/calibrar` (restrito — ver seção 6).

Envia comando `^HR` — a ZD500R executa calibração automática:
- Move a mídia 1 mm por vez para encontrar a posição ideal de programação
- Lê o TID do chip para identificar fabricante/modelo
- Determina níveis ótimos de potência read/write
- Devolve tabela com resultados ao host

**Quando calibrar:**
- Primeiro uso com novo lote/modelo de etiquetas
- Falhas de gravação frequentes (VOID / NO TAG FOUND)
- Alteração no posicionamento da mídia

**Duração:** até ~5 minutos.

**Indicador de sucesso:** seta `<---****` na linha correspondente da tabela
devolvida pela impressora.

## 9. Referências técnicas

- Zebra RFID Programming Guide 3 (P1062165-05EN) — comandos ^RFW, ^RFR, ^HR
- ZPL II Programming Guide — comandos ^XA, ^XZ, ^FD, ^BQ, ^HV, ^PW, ^LL
- ZD500R Specification Sheet — pitch mínimo 16 mm, antena A1
- Browser Print User Guide v1.3 — HTTPS 9101, Accepted Hosts, SDK JavaScript
- GS1 EPC Tag Data Standard (TDS) 2.0 — formato SGTIN-96 (referência, não usado)
