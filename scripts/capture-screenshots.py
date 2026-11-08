#!/usr/bin/env python3
"""Capturas del README, tomadas de la aplicacion en marcha.

Abre la compilacion web en Chromium, deja que las fuentes reales devuelvan
datos y guarda las pantallas en docs/screenshots. El mismo Chromium que usa el
escritorio (WebView2 es Chromium): lo unico que cambia aqui es el transporte,
que va directo a las API publicas con CORS desactivado porque fuera de Tauri no
hay plugin HTTP.

    VITE_DEMO=1 pnpm --filter @avizor/app build   # opcional: datos de ejemplo
    python3 scripts/capture-screenshots.py        # requiere: pip install playwright
    python3 -m playwright install chromium

Con --sample carga los datos de ejemplo (no necesita red); sin el, espera a que
Hacker News, Bluesky y GitHub respondan.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - depende del entorno
    sys.exit("Falta playwright: pip install playwright && python3 -m playwright install chromium")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "screenshots"
DIST = ROOT / "apps" / "app" / "dist"

VIEWPORT = {"width": 1440, "height": 900}


def serve(directory: Path, port: int) -> socketserver.TCPServer:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    handler.log_message = lambda *args, **kwargs: None
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def click(page, selector: str, text: str | None = None) -> None:
    """Pulsa por selector y texto, con el clic del propio DOM."""
    result = page.evaluate(
        r"""([selector, text]) => {
            const all = [...document.querySelectorAll(selector)];
            const hit = text ? all.find((el) => el.textContent.replace(/\s+/g, ' ').includes(text)) : all[0];
            if (!hit) return false;
            hit.click();
            return true;
        }""",
        [selector, text],
    )
    if not result:
        raise RuntimeError(f"no encontrado: {selector} {text or ''}")


def wait_posts(page, minimum: int, timeout: int = 120_000) -> None:
    page.wait_for_function(
        "(n) => document.querySelectorAll('.post').length >= n", arg=minimum, timeout=timeout
    )


def wait_for(page, expression: str, timeout: int = 60_000) -> None:
    """Espera una condicion del DOM, no un selector.

    React vuelve a pintar la raiz varias veces al arrancar; con selectores,
    Playwright puede quedarse mirando un nodo que ya no existe.
    """
    page.wait_for_function(f"() => Boolean({expression})", timeout=timeout)


def theme(page, platform: str | None = None, appearance: str | None = None) -> None:
    click(page, ".nav__item", "Ajustes")
    wait_for(page, "document.querySelector('.theme-grid')", 30_000)
    if platform:
        click(page, ".theme-card", platform)
    if appearance:
        click(page, ".segmented button", appearance)
    page.wait_for_timeout(250)


def home(page) -> None:
    click(page, ".nav__item", "Inicio")
    wait_for(page, "document.querySelector('.chips')", 30_000)
    page.wait_for_timeout(400)


def shoot(page, name: str) -> None:
    path = OUT / name
    page.screenshot(path=str(path), animations="disabled")
    print(f"  {name}  {path.stat().st_size // 1024} kB")


def main() -> None:
    parser = argparse.ArgumentParser(description="Capturas del README de Avizor")
    parser.add_argument("--sample", action="store_true", help="usar los datos de ejemplo en vez de la red")
    parser.add_argument("--port", type=int, default=4199)
    parser.add_argument("--dist", type=Path, default=DIST)
    args = parser.parse_args()

    step = lambda message: print(f"· {message}", flush=True)

    if not (args.dist / "index.html").exists():
        sys.exit(f"falta la compilacion: {args.dist}")

    OUT.mkdir(parents=True, exist_ok=True)
    httpd = serve(args.dist, args.port)
    base = f"http://127.0.0.1:{args.port}/"
    print(f"sirviendo {args.dist} en {base}")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=[
                "--no-sandbox",
                "--disable-web-security",
                # En un WSL con poca memoria compartida Chromium se queda
                # esperando: /dev/shm pequeno y GPU virtual.
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-first-run",
            ]
        )
        ctx = browser.new_context(viewport=VIEWPORT, device_scale_factor=1, color_scheme="dark")
        page = ctx.new_page()
        page.set_default_timeout(90_000)

        step("cargando")
        page.goto(base, wait_until="domcontentloaded")
        wait_for(page, "document.querySelector('.onboarding') || document.querySelector('.nav')", 90_000)
        step("interfaz lista")
        page.wait_for_timeout(600)

        # El WebView de verdad corre en Windows; aqui Chromium va sobre Linux.
        # Se fija el tema antes de la primera captura para que la bienvenida
        # salga con las mismas formas y tipografia que vera el usuario.
        page.evaluate("document.documentElement.dataset.platform = 'windows'")
        page.wait_for_timeout(300)

        if page.query_selector(".onboarding"):
            step("bienvenida")
            shoot(page, "bienvenida.png")
            click(page, "button", "Empezar a escuchar")
        wait_for(page, "document.querySelector('.nav')", 30_000)
        step("entrando en la aplicacion")

        # Windows es el sistema del autor: el tema por defecto de las capturas.
        theme(page, platform="Windows", appearance="Oscuro")
        step("tema de Windows")
        if args.sample:
            step("datos de ejemplo")
            click(page, "button", "Cargar datos de ejemplo")
            page.wait_for_timeout(1200)

        home(page)
        step("esperando publicaciones")
        wait_posts(page, 6)
        shoot(page, "inicio.png")

        click(page, ".nav__item", "Radar")
        wait_for(page, "document.querySelector('.trend') || document.querySelector('.empty')", 60_000)
        page.wait_for_timeout(600)
        shoot(page, "radar.png")

        theme(page, appearance="Claro")
        home(page)
        shoot(page, "tema-claro.png")

        theme(page, platform="macOS", appearance="Oscuro")
        home(page)
        shoot(page, "tema-macos.png")

        theme(page, platform="Linux")
        home(page)
        shoot(page, "tema-linux.png")

        browser.close()

    httpd.shutdown()
    print("listo")


if __name__ == "__main__":
    main()
