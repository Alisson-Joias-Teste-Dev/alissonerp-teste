"""
notify.py — Notificacao de aprovacao para o Claude Code
Uso: python scripts/notify.py "Mensagem aqui"
"""
import sys, os, subprocess, urllib.request, json

NTFY_TOPIC = "fabricaaj-jonat-2026"
NTFY_URL   = f"https://ntfy.sh/{NTFY_TOPIC}"

def beep():
    """Toca som de alerta no Windows."""
    try:
        subprocess.run(
            ["powershell", "-Command",
             "[System.Media.SystemSounds]::Exclamation.Play(); Start-Sleep -Milliseconds 800;"
             "[System.Media.SystemSounds]::Exclamation.Play()"],
            capture_output=True, timeout=5
        )
    except Exception as e:
        print(f"[beep] erro: {e}")

def push(title: str, msg: str):
    """Envia notificacao push via ntfy.sh"""
    try:
        data = json.dumps({
            "topic":    NTFY_TOPIC,
            "title":    title,
            "message":  msg,
            "priority": 4,
            "tags":     ["white_check_mark", "alisson"],
        }).encode("utf-8")
        req = urllib.request.Request(
            "https://ntfy.sh",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            print(f"[ntfy] enviado — status {r.status}")
    except Exception as e:
        print(f"[ntfy] erro: {e}")

def notify(msg: str = "Aguardando sua confirmacao para continuar."):
    title = "Claude Code — Aprovacao necessaria"
    print(f"\n{'='*50}")
    print(f"  {title}")
    print(f"  {msg}")
    print(f"{'='*50}\n")
    beep()
    push(title, msg)

if __name__ == "__main__":
    msg = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "Aguardando sua confirmacao para continuar."
    notify(msg)
