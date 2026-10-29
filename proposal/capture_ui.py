"""Capture real local-demo screenshots in an isolated headless Chrome profile.
No app source edits, cloud login, sales, or existing browser storage changes.
Requires the locally installed websocket-client package and Chrome.
"""
import base64
import json
import socket
import subprocess
import time
import urllib.request
from pathlib import Path

import websocket

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
PROFILE = ROOT.parent / ".next" / "proposal-capture-profile"
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
process = subprocess.Popen([
    str(CHROME), "--headless=new", "--no-first-run", "--no-default-browser-check",
    f"--remote-debugging-port={port}", "--remote-debugging-address=127.0.0.1",
    f"--remote-allow-origins=http://127.0.0.1:{port}", f"--user-data-dir={PROFILE}",
    "about:blank",
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
connection = None
counter = 0
exceptions = []

def command(method, params=None):
    global counter
    counter += 1
    request_id = counter
    connection.send(json.dumps({"id": request_id, "method": method, "params": params or {}}))
    while True:
        reply = json.loads(connection.recv())
        if reply.get("method") == "Runtime.exceptionThrown":
            detail = reply["params"]["exceptionDetails"]
            exceptions.append(detail.get("exception", {}).get("description", detail.get("text")))
        if reply.get("id") == request_id:
            if "error" in reply:
                raise RuntimeError(reply["error"])
            return reply.get("result", {})

def evaluate(expression):
    reply = command("Runtime.evaluate", {
        "expression": expression, "returnByValue": True, "awaitPromise": True,
    })
    if "exceptionDetails" in reply:
        raise RuntimeError(reply["exceptionDetails"])
    return reply.get("result", {}).get("value")

def settle():
    for _ in range(60):
        if evaluate("Boolean(document.querySelector('.page-art svg'))"):
            break
        time.sleep(1)
    else:
        raise RuntimeError("Current Laris page header did not load within 60 seconds")
    evaluate("document.fonts.ready.then(() => true)")
    evaluate("document.querySelector('[aria-label=\"Lewati pengenalan\"]')?.click()")
    evaluate("Promise.all(Array.from(document.images).map(i => i.complete ? Promise.resolve() : new Promise(r => {i.onload=r; i.onerror=r; setTimeout(r,5000)}))).then(()=>true)")
    time.sleep(1)

try:
    targets = None
    for _ in range(40):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=1) as response:
                targets = json.load(response)
            if targets:
                break
        except (OSError, ValueError):
            pass
        time.sleep(0.25)
    if not targets:
        raise RuntimeError("Isolated Chrome did not expose its local debugging endpoint")
    target = next(t for t in targets if t.get("type") == "page")
    connection = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=90,
                                             origin=f"http://127.0.0.1:{port}")
    command("Page.enable")
    command("Runtime.enable")
    command("Emulation.setDeviceMetricsOverride", {"width": 1366, "height": 900, "deviceScaleFactor": 1, "mobile": False})
    command("Page.navigate", {"url": "http://localhost:3000/demo"})
    settle()
    if "Demo Laris" not in evaluate("document.title"):
        raise RuntimeError("Expected the local Laris demo, not another application")
    reports = []
    for name, view, width, height in [
        ("overview", "overview", 1366, 900), ("pos", "pos", 1366, 900),
        ("inventory", "inventory", 1366, 900), ("pos-mobile", "pos", 390, 844),
    ]:
        command("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": width < 640})
        evaluate(f"window.location.hash={json.dumps(view)}")
        settle()
        if name == "pos":
            evaluate("document.querySelector('.product-card .add-product')?.click()")
            time.sleep(0.5)
        evaluate("window.scrollTo(0,0)")
        time.sleep(0.3)
        data = command("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
        path = ASSETS / f"{name}.png"
        path.write_bytes(base64.b64decode(data["data"]))
        report = evaluate("({title: document.title, url: location.href, heading: document.querySelector('#page-title')?.textContent, viewport: [innerWidth, innerHeight], documentWidth: document.documentElement.scrollWidth, imageErrors: Array.from(document.images).filter(i=>!i.naturalWidth).map(i=>i.getAttribute('src'))})")
        report["path"] = str(path)
        report["horizontalOverflow"] = report["documentWidth"] > report["viewport"][0]
        reports.append(report)
        print(json.dumps(report, ensure_ascii=True))
    evidence = {"scope": "Local fictional demo only; no checkout submitted; isolated Chrome profile", "screenshots": reports, "runtimeExceptions": exceptions}
    (ROOT / "ui-evidence.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
finally:
    if connection:
        try:
            command("Browser.close")
        except Exception:
            pass
        connection.close()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.terminate()
