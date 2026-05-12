"""
Script de exemplo: Impressao de etiquetas RFID na Zebra ZD500R

Uso:
  python imprimir_rfid_zebra.py --epc AJ2600000001 --sku "1470-6" --nome "Anel Ouro Branco"
  python imprimir_rfid_zebra.py --api http://localhost:3000/api/rfid/imprimir --produto-id 39187

Requisitos:
  - Python 3.6+
  - Nenhuma biblioteca externa necessaria (usa socket nativo)

Conexao:
  - IP: 192.168.15.144
  - Porta: 9100 (Zebra default)
  - Protocolo: TCP/IP raw (Socket)
"""

import socket
import sys
import json
import argparse
from typing import Optional


def epc_to_hex(epc: str) -> str:
    """Converte EPC ASCII para hex (formato de gravacao RFID)"""
    return epc.encode("ascii").hex().upper()


def gerar_zpl(epc: str, sku: str, nome: str) -> str:
    """
    Gera ZPL para etiqueta RFID 74x20mm na Zebra ZD500R.

    Layout:
      - Cabecalho: Nome do produto (fonte 22pt)
      - Linha 2: SKU (fonte 18pt)
      - Linha 3: ID EPC (fonte 15pt)
      - QR Code com o EPC (leitura visual)
      - Comando ^RFW,H grava EPC no chip RFID
    """
    epc_hex = epc_to_hex(epc)

    # Sanitiza caracteres especiais que o ZPL nao aceita
    nome_limpo = nome.replace("^", " ").replace("~", " ").strip()
    sku_limpo = sku.replace("^", " ").replace("~", " ").strip()

    zpl = f"""^XA
^PW580
^LL160
^CI28
^FO10,10^A0N,22,22^FD{nome_limpo}^FS
^FO10,40^A0N,18,18^FDSKU: {sku_limpo}^FS
^FO10,70^A0N,15,15^FDID: {epc}^FS
^FO400,10^BQN,2,5^FDLA,{epc}^FS
^RFW,H^FD{epc_hex}^FS
^XZ
"""
    return zpl


def imprimir_zpl(zpl: str, ip: str = "192.168.15.144", porta: int = 9100) -> None:
    """
    Envia comando ZPL para a impressora via TCP/IP.

    Args:
        zpl: String ZPL completa (com ^XA e ^XZ)
        ip: IP da impressora
        porta: Porta TCP (9100 = Zebra default)

    Raises:
        ConnectionError: Se nao conseguir conectar
        TimeoutError: Se a conexao exceder 10s
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10)

    try:
        sock.connect((ip, porta))
        sock.sendall(zpl.encode("utf-8"))
        print(f"✅ ZPL enviado para {ip}:{porta} ({len(zpl)} bytes)")
    except socket.timeout:
        raise TimeoutError(f"Timeout ao conectar em {ip}:{porta}")
    except ConnectionRefusedError:
        raise ConnectionError(f"Impressora recusou conexao em {ip}:{porta}")
    except OSError as e:
        raise ConnectionError(f"Erro de rede: {e}")
    finally:
        sock.close()


def chamar_api(api_url: str, produto_id: int) -> dict:
    """Chama a API do sistema para gerar e imprimir RFID"""
    import urllib.request

    body = json.dumps({"produto_id": produto_id, "tipo": "imprimir"}).encode("utf-8")
    req = urllib.request.Request(
        api_url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    parser = argparse.ArgumentParser(
        description="Imprime etiquetas RFID na Zebra ZD500R"
    )
    parser.add_argument("--epc", help="EPC da tag (ex: AJ2600000001)")
    parser.add_argument("--sku", help="SKU do produto")
    parser.add_argument("--nome", help="Nome do produto")
    parser.add_argument(
        "--api",
        help="URL da API do sistema (ex: http://localhost:3000/api/rfid/imprimir)",
    )
    parser.add_argument("--produto-id", type=int, help="ID do produto (usado com --api)")
    parser.add_argument("--ip", default="192.168.15.144", help="IP da impressora")
    parser.add_argument("--porta", type=int, default=9100, help="Porta TCP da impressora")
    parser.add_argument("--so-zpl", action="store_true", help="So gera ZPL, nao imprime")

    args = parser.parse_args()

    # Modo API: chama o sistema para gerar + imprimir
    if args.api and args.produto_id:
        print(f"🔗 Chamando API: {args.api}")
        resultado = chamar_api(args.api, args.produto_id)
        if "error" in resultado:
            print(f"❌ Erro da API: {resultado['error']}")
            sys.exit(1)
        print(f"   EPC: {resultado['epc']}")
        print(f"   Status: {resultado.get('status', '?')}")
        if "zpl" in resultado:
            print(f"   ZPL gerado ({len(resultado['zpl'])} chars)")
            if args.so_zpl:
                print("\n--- ZPL ---")
                print(resultado["zpl"])
        if resultado.get("warning"):
            print(f"⚠️  {resultado['warning']}")
        return

    # Modo direto: parametros EPC/SKU/Nome
    if not args.epc:
        parser.error("Informe --epc ou --api")
        return

    zpl = gerar_zpl(args.epc, args.sku or "", args.nome or "")

    if args.so_zpl:
        print("\n--- ZPL ---")
        print(zpl)
        return

    try:
        imprimir_zpl(zpl, args.ip, args.porta)
        print(f"✅ Etiqueta impressa: {args.nome or '?'} ({args.epc})")
    except (ConnectionError, TimeoutError) as e:
        print(f"❌ {e}")
        print("\n💡 Dica: Verifique se a impressora esta ligada e no IP correto.")
        print(f"   Teste: ping {args.ip}")
        print("\n--- ZPL gerado (para impressao manual) ---")
        print(zpl)
        sys.exit(1)


if __name__ == "__main__":
    main()
