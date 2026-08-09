from __future__ import annotations

import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

import uvicorn


BACKEND_DIR = Path(__file__).resolve().parent
URL = "http://127.0.0.1:8000"


def open_when_ready() -> None:
    for _ in range(60):
        try:
            with urllib.request.urlopen(f"{URL}/api/health", timeout=0.5):
                webbrowser.open(URL)
                return
        except OSError:
            time.sleep(0.25)


if __name__ == "__main__":
    threading.Thread(target=open_when_ready, daemon=True).start()
    uvicorn.run(
        "app.main:app",
        app_dir=str(BACKEND_DIR),
        host="127.0.0.1",
        port=8000,
        log_level="info",
    )
