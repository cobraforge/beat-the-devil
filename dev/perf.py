"""Frame-time measurement under mobile emulation and CPU throttling.

Drives a separate Chrome (its own profile) over the DevTools protocol:
390x844 @ 3x DPR, touch, CPU throttled 1x/4x/6x, optionally with the 2D canvas in software
(--software) so raster cost lands on the throttled thread. For each scenario the game
is warmed up, the ring in BTD_PERF is reset, and frame times are read after a
measurement window during which a finger drags the heart in circles.

    python dev/perf.py [--rates 1,4,6] [--scenes survive,boss] [--url http://127.0.0.1:8080/] [--label before]

Needs: the dev server running, Chrome, `pip install websocket-client`.
"""
import argparse, json, math, os, subprocess, sys, tempfile, time, urllib.request
import websocket

CHROME = [r"C:\Program Files\Google\Chrome\Application\chrome.exe",
          r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"]
PORT = 9333


class CDP:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, suppress_origin=True)
        self.ws.settimeout(30)
        self.id = 0

    def call(self, method, **params):
        self.id += 1
        self.ws.send(json.dumps({"id": self.id, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.id:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    def send(self, method, **params):
        """fire and forget; responses are drained by drain()"""
        self.id += 1
        self.ws.send(json.dumps({"id": self.id, "method": method, "params": params}))

    def drain(self):
        self.ws.settimeout(0.05)
        try:
            while True:
                self.ws.recv()
        except Exception:
            pass
        self.ws.settimeout(30)

    def js(self, expr):
        r = self.call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description", r["exceptionDetails"]))
        return r.get("result", {}).get("value")


def launch(profile, software):
    exe = next((c for c in CHROME if os.path.exists(c)), None)
    if not exe:
        sys.exit("Chrome not found")
    proc = subprocess.Popen([exe, f"--remote-debugging-port={PORT}", f"--user-data-dir={profile}",
                             "--no-first-run", "--no-default-browser-check", "--window-size=520,960",
                             "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling",
                             "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
                             "--disable-features=CalculateNativeWinOcclusion"]
                            + (["--disable-accelerated-2d-canvas"] if software else []) + ["about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
            page = next(t for t in targets if t["type"] == "page")
            return proc, page["webSocketDebuggerUrl"]
        except Exception:
            time.sleep(0.2)
    proc.kill()
    sys.exit("Chrome did not expose a page target")


def touch_drag(cdp, seconds, cx, cy, r=90):
    """a finger circling the heart for `seconds`. Each move waits for the
    renderer's ack, as a real touchscreen coalesces moves to one per frame;
    flooding a throttled page would stall the socket and stretch the window."""
    t0 = time.perf_counter()
    cdp.call("Input.dispatchTouchEvent", type="touchStart", touchPoints=[{"x": cx + r, "y": cy, "id": 1}])
    i = 0
    while time.perf_counter() - t0 < seconds:
        a = (time.perf_counter() - t0) * 2.2
        x, y = cx + r * math.cos(a), cy + r * 0.55 * math.sin(a)
        cdp.call("Input.dispatchTouchEvent", type="touchMove", touchPoints=[{"x": x, "y": y, "id": 1}])
        i += 1
        time.sleep(1 / 60)
    cdp.call("Input.dispatchTouchEvent", type="touchEnd", touchPoints=[])
    return i


def report_profile(prof):
    """self time per function (ms), top 18, from a V8 CPU profile"""
    nodes = {n["id"]: n for n in prof["nodes"]}
    self_us = {}
    for nid, dt in zip(prof["samples"], prof["timeDeltas"]):
        self_us[nid] = self_us.get(nid, 0) + dt
    parent = {}
    for n in prof["nodes"]:
        for c in n.get("children", []):
            parent[c] = n["id"]
    def name(nid):
        cf = nodes[nid]["callFrame"]
        return f"{cf['functionName'] or '(anon)'}  {os.path.basename(cf['url'])}:{cf['lineNumber'] + 1}"
    by_fn = {}
    for nid, us in self_us.items():
        key = name(nid)
        # native canvas calls are charged to the game function that made them
        if not nodes[nid]["callFrame"]["url"] and nid in parent:
            key += "  <- " + name(parent[nid])
        by_fn[key] = by_fn.get(key, 0) + us
    total = sum(by_fn.values()) / 1000
    print(f"    profile: {total:.0f} ms sampled")
    for k, us in sorted(by_fn.items(), key=lambda kv: -kv[1])[:18]:
        print(f"    {us / 1000:7.1f} ms  {100 * us / 1000 / total:4.1f}%  {k}")


SETUP = {
    # dense survive phase: past the jets' 40 % gate, columns, forks and embers all live
    "survive": "BTD_G.surv = BTD_G.SURV * 0.55; BTD_G.lives = 99; 'ok'",
    # the fight: enter, arrive, laugh, volley, then the attack cycle, with columns
    "boss": "BTD_G.surv = BTD_G.SURV - 0.3; BTD_G.lives = 99; 'ok'",
}
WARMUP = {"survive": 5, "boss": 15}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rates", default="1,4,6")
    ap.add_argument("--scenes", default="survive,boss")
    ap.add_argument("--url", default="http://127.0.0.1:8080/")
    ap.add_argument("--label", default="")
    ap.add_argument("--measure", type=float, default=6.0)
    ap.add_argument("--json", default="")
    # software canvas: raster runs on the (throttled) main thread, as a weak GPU would feel
    ap.add_argument("--software", action="store_true")
    # collect a CPU profile over the measurement window and print the top self-time functions
    ap.add_argument("--profile", action="store_true")
    ap.add_argument("--tier", type=int, default=-1, help="pin the quality tier (default: adaptive)")
    ap.add_argument("--noshadow", action="store_true", help="A/B: no shadowBlur anywhere")
    ap.add_argument("--css", default="", help="A/B: 'alpha' = scanlines without mix-blend-mode, 'none' = no CSS overlays at all")
    ap.add_argument("--skip", default="", help="A/B: comma list of drawing blocks to leave out (devil,arms,flames,vignette,hud,mist)")
    a = ap.parse_args()
    rates = [int(x) for x in a.rates.split(",")]
    scenes = a.scenes.split(",")

    profile = tempfile.mkdtemp(prefix="btd-chrome-")
    proc, ws_url = launch(profile, a.software)
    out = []
    try:
        cdp = CDP(ws_url)
        cdp.call("Page.enable"); cdp.call("Runtime.enable")
        cdp.call("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
        cdp.call("Emulation.setTouchEmulationEnabled", enabled=True, maxTouchPoints=5)
        cdp.call("Emulation.setUserAgentOverride", userAgent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36")
        for rate in rates:
            for scene in scenes:
                cdp.call("Emulation.setCPUThrottlingRate", rate=1)
                cdp.call("Page.navigate", url=a.url + "?perf=" + str(time.time()) + "#debug")
                time.sleep(1.5)
                # a tap starts the game the way a thumb would
                cdp.call("Input.dispatchTouchEvent", type="touchStart", touchPoints=[{"x": 195, "y": 700, "id": 1}])
                cdp.call("Input.dispatchTouchEvent", type="touchEnd", touchPoints=[])
                time.sleep(0.3)
                mode = cdp.js("BTD_G.mode")
                if mode != "play":
                    cdp.js("window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true})); 'k'")
                    time.sleep(0.3)
                cdp.js(SETUP[scene])
                if a.tier >= 0:
                    cdp.js(f"window.BTD_LOCK_TIER = true; BTD_TIER({a.tier}); 'tier'")
                if a.noshadow:
                    cdp.js("window.BTD_NOSHADOW = true; 'ns'")
                if a.css:
                    css = "#stage::after,#stage::before{display:none}" if a.css == "none" else "#stage::after{mix-blend-mode:normal}"
                    cdp.js("var st=document.createElement('style'); st.textContent=" + json.dumps(css) + "; document.head.appendChild(st); 'css'")
                if a.skip:
                    cdp.js("window.BTD_SKIP = {" + ",".join(k + ":true" for k in a.skip.split(",")) + "}; 'skip'")
                cdp.call("Emulation.setCPUThrottlingRate", rate=rate)
                # warm up under throttle (a light drag keeps the heart moving and alive)
                touch_drag(cdp, WARMUP[scene], 195, 560, 60)
                info = cdp.js("({mode: BTD_G.mode, phase: BTD_G.phase, devil: BTD_G.devil && BTD_G.devil.state, flames: BTD_G.flames.length, forks: BTD_G.forks.length, parts: BTD_G.parts.length})")
                cdp.js("BTD_PERF(true); 'reset'")
                if a.profile:
                    cdp.call("Profiler.enable"); cdp.call("Profiler.setSamplingInterval", interval=200); cdp.call("Profiler.start")
                n = touch_drag(cdp, a.measure, 195, 560, 90)
                st = cdp.js("BTD_PERF(false)")
                if a.profile:
                    prof = cdp.call("Profiler.stop")["profile"]
                    report_profile(prof)
                cvs = cdp.js("({w: document.getElementById('c').width, h: document.getElementById('c').height, tier: window.BTD_G.tier == null ? '-' : BTD_G.tier})")
                row = {"label": a.label, "rate": rate, "scene": scene, "avg": st["avg"], "p95": st["p95"], "max": st["max"],
                       "work": st["work"], "frames": st["total"], "events": n, "canvas": f"{cvs['w']}x{cvs['h']}", "tier": cvs["tier"], "state": info}
                out.append(row)
                print(f"[{a.label}{'-skip:' + a.skip if a.skip else ''}{'-css:' + a.css if a.css else ''}{'/sw' if a.software else '/gpu'}] {rate}x {scene:8s} frame avg {st['avg']:5.1f}  p95 {st['p95']:5.1f}  max {st['max']:5.0f}  "
                      f"work {st['work']:5.1f}  frames {st['total']:3d}/{a.measure:.0f}s  err {st.get('errors', '?')}  canvas {row['canvas']}  tier {cvs['tier']}  {info}", flush=True)
    finally:
        try:
            cdp.call("Browser.close")
        except Exception:
            pass
        time.sleep(0.5)
        proc.kill()
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=1)


if __name__ == "__main__":
    main()
