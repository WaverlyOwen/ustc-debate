"""Keyboard regressions that only trusted input reproduces (focus, default actions).

Launches its own headless Edge with --remote-debugging-port and drives it with the
DevTools protocol (Input.dispatchMouseEvent / Input.dispatchKeyEvent). Only the
browser this test started is terminated. Skipped when no Edge/Chrome is installed.

The page is the built timer/debate-timer.html opened with ?test=1, which gives it a
read-only window.__dtTest (route(), session()) to read the match back from.
"""
import base64
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from run_js_tests import find_browser  # noqa: E402

PAGE = (HERE.parent / "debate-timer.html").resolve().as_uri()
PROFILES = HERE / "out" / "kbd-tests"

# CDP key descriptions: code, key, Windows virtual key code, and the text a press types.
KEYS = {
    "Space": dict(code="Space", key=" ", windowsVirtualKeyCode=32, text=" "),
    "Enter": dict(code="Enter", key="Enter", windowsVirtualKeyCode=13, text="\r"),
    "Escape": dict(code="Escape", key="Escape", windowsVirtualKeyCode=27),
    "ArrowRight": dict(code="ArrowRight", key="ArrowRight", windowsVirtualKeyCode=39),
}
for _ch in "EPX":
    KEYS["Key" + _ch] = dict(code="Key" + _ch, key=_ch.lower(), windowsVirtualKeyCode=ord(_ch), text=_ch.lower())

# Counts the engine's toggles (space, the 开始 / 暂停 buttons) and keeps whether each keydown was handled.
INSTRUMENT = r"""(() => {
  if (window.__kbd) return;
  window.__kbd = { toggles: 0, prevented: [] };
  const toggle = DT.engine.toggle;
  DT.engine.toggle = function () { window.__kbd.toggles++; return toggle.apply(this, arguments); };
  window.addEventListener('keydown', e => setTimeout(() => window.__kbd.prevented.push([e.code, e.defaultPrevented])));
})()"""


class CDP:
    """A minimal websocket client (RFC 6455: HTTP Upgrade, masked client frames) speaking the DevTools protocol."""

    def __init__(self, ws_url):
        u = urllib.parse.urlparse(ws_url)
        self.sock = socket.create_connection((u.hostname, u.port), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f"GET {u.path} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\nUpgrade: websocket\r\n"
                           f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("the browser closed the connection during the handshake")
            buf += chunk
        head, self.rest = buf.split(b"\r\n\r\n", 1)
        if b" 101 " not in head.split(b"\r\n")[0]:
            raise ConnectionError(head.decode(errors="replace"))
        self.next_id = 0

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass

    def _frame(self, opcode, data):
        mask = os.urandom(4)
        head = bytearray([0x80 | opcode])
        n = len(data)
        if n < 126:
            head.append(0x80 | n)
        elif n < 65536:
            head.append(0x80 | 126)
            head += struct.pack(">H", n)
        else:
            head.append(0x80 | 127)
            head += struct.pack(">Q", n)
        head += mask
        self.sock.sendall(bytes(head) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _read(self, n):
        while len(self.rest) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("the browser closed the connection")
            self.rest += chunk
        out, self.rest = self.rest[:n], self.rest[n:]
        return out

    def _message(self):
        """The next text message; pings are answered on the way."""
        msg = b""
        while True:
            b0, b1 = self._read(2)
            opcode, n = b0 & 0x0F, b1 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            mask = self._read(4) if b1 & 0x80 else None
            payload = self._read(n)
            if mask:
                payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            if opcode == 0x9:
                self._frame(0xA, payload)
            elif opcode == 0x8:
                raise ConnectionError("the browser closed the connection")
            elif opcode in (0x0, 0x1, 0x2):
                msg += payload
                if b0 & 0x80:
                    return msg.decode("utf-8")

    def send(self, method, params=None):
        """Sends one command and returns its result; events that arrive meanwhile are dropped."""
        self.next_id += 1
        mid = self.next_id
        self._frame(0x1, json.dumps({"id": mid, "method": method, "params": params or {}}).encode())
        while True:
            m = json.loads(self._message())
            if m.get("id") == mid:
                if "error" in m:
                    raise RuntimeError(f"{method}: {m['error']}")
                return m.get("result", {})

    def evaluate(self, js):
        r = self.send("Runtime.evaluate", {"expression": js, "returnByValue": True, "awaitPromise": True})
        if "exceptionDetails" in r:
            raise RuntimeError(json.dumps(r["exceptionDetails"], ensure_ascii=False)[:600])
        return r["result"].get("value")


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def launch(browser):
    """(Popen, profile dir, CDP connection to its page): a headless browser of this test's own."""
    port = free_port()
    PROFILES.mkdir(parents=True, exist_ok=True)
    profile = tempfile.mkdtemp(prefix="edge-", dir=str(PROFILES))
    proc = subprocess.Popen([
        browser, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={profile}",
        "--allow-file-access-from-files", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
        "--window-size=1366,768", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=1) as r:
                pages = [t for t in json.load(r) if t.get("type") == "page"]
            if pages:
                return proc, profile, CDP(pages[0]["webSocketDebuggerUrl"])
        except OSError:
            pass
        time.sleep(0.1)
    proc.terminate()
    proc.wait(10)
    raise RuntimeError("the browser offered no page to drive")


@unittest.skipUnless(find_browser(), "no Edge or Chrome installed")
class TrustedKeyboardTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.proc, cls.profile, cls.cdp = launch(find_browser())
        cls.cdp.send("Page.enable")
        cls.cdp.send("Runtime.enable")
        # The editor's close animation must really run (scenario 4), whatever the machine prefers.
        cls.cdp.send("Emulation.setEmulatedMedia",
                     {"features": [{"name": "prefers-reduced-motion", "value": "no-preference"}]})

    @classmethod
    def tearDownClass(cls):
        cls.cdp.close()
        cls.proc.terminate()   # only the browser this test started
        try:
            cls.proc.wait(10)
        except subprocess.TimeoutExpired:
            cls.proc.kill()
            cls.proc.wait(10)
        shutil.rmtree(cls.profile, ignore_errors=True)

    # ---- driving the page ----

    def js(self, expr):
        return self.cdp.evaluate(expr)

    def wait(self, cond, timeout=5.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.js(f"!!({cond})"):
                return
            time.sleep(0.05)
        self.fail("timed out waiting for " + cond)

    def open(self, query):
        """Opens the built timer with ?test=1&<query> on a clean slate: nothing saved from an earlier scenario."""
        self.cdp.send("Page.navigate", {"url": PAGE + "?test=1"})
        self.wait("window.__dtTest")
        self.js("localStorage.clear(); sessionStorage.clear()")
        self.cdp.send("Page.navigate", {"url": PAGE + "?test=1" + ("&" + query if query else "")})
        self.wait("window.__dtTest && document.readyState === 'complete'")
        self.js(INSTRUMENT)

    def start_match(self, format_id="ustc-freshman-cup"):
        """From the setup page: choose the format and 开始这一场, which lands on the title card."""
        self.click(f"[data-format-id='{format_id}']")
        self.click("button[data-action='start']")
        self.wait("window.__dtTest.route() === 'timer'")

    def rect(self, selector):
        r = self.js("(() => { const e = document.querySelector(%s); if (!e) return null;"
                    " const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()"
                    % json.dumps(selector))
        self.assertIsNotNone(r, "no element " + selector)
        return r

    def mouse(self, kind, x, y, buttons):
        params = {"type": kind, "x": x, "y": y, "buttons": buttons}
        if kind != "mouseMoved":
            params.update(button="left", clickCount=1)
        self.cdp.send("Input.dispatchMouseEvent", params)

    def click_at(self, x, y):
        self.mouse("mouseMoved", x, y, 0)
        self.mouse("mousePressed", x, y, 1)
        time.sleep(0.03)
        self.mouse("mouseReleased", x, y, 0)
        time.sleep(0.1)

    def click(self, selector, fx=0.5, fy=0.5):
        left, top, width, height = self.rect(selector)
        self.click_at(left + width * fx, top + height * fy)

    def key(self, name, hold=0.02, settle=0.15):
        d = dict(KEYS[name])
        text = d.pop("text", None)
        if text is None:
            self.cdp.send("Input.dispatchKeyEvent", dict(type="rawKeyDown", **d))
        else:
            self.cdp.send("Input.dispatchKeyEvent", dict(type="keyDown", text=text, unmodifiedText=text, **d))
        time.sleep(hold)
        self.cdp.send("Input.dispatchKeyEvent", dict(type="keyUp", **d))
        time.sleep(settle)

    def session(self):
        return self.js("window.__dtTest.session()")

    def running(self):
        s = self.session()
        stage = s["timeline"][s["cursor"]] if 0 <= s["cursor"] < len(s["timeline"]) else None
        return bool(stage and s["runs"].get(stage["id"], {}).get("running"))

    def toggles(self):
        return self.js("window.__kbd.toggles")

    def volume(self):
        return self.js("document.querySelector('input[name=volume]').value")

    # ---- the six scenarios of the spec (2026-10-03 §4), and a seventh for §2 ----

    def test_1_console_volume_label_keeps_the_timer_keys(self):
        self.open("demo=console")
        self.wait("document.querySelector('.dt-console-controls input[name=volume]')")
        was_running, cursor, volume = self.running(), self.session()["cursor"], self.volume()
        self.click(".dt-console-controls .dt-volume span")   # the word 音量
        self.key("Space")
        self.assertEqual(self.toggles(), 1, "one space, one toggle")
        self.assertNotEqual(self.running(), was_running)
        self.assertEqual(self.js("window.__kbd.prevented.pop()"), ["Space", True], "the page's own space is held back")
        self.key("ArrowRight")
        self.assertEqual(self.session()["cursor"], cursor + 1, "→ goes to the next stage")
        self.assertEqual(self.volume(), volume, "and does not move the volume")
        # On the slider itself: the click sets the volume, and the keys still belong to the timer.
        self.click(".dt-console-controls input[name=volume]", fx=0.25)
        volume = self.volume()
        self.key("ArrowRight")
        self.assertEqual(self.session()["cursor"], cursor + 2)
        self.assertEqual(self.volume(), volume)

    def test_2_console_stage_list_row_does_not_take_enter(self):
        self.open("demo=console")
        self.wait("document.querySelector('.dt-console-list button[data-index]')")
        self.click(".dt-console-list button[data-index='0']")
        self.assertEqual(self.session()["cursor"], 0)
        self.key("ArrowRight")
        self.key("ArrowRight")
        self.assertEqual(self.session()["cursor"], 2)
        self.key("Enter")
        self.assertEqual(self.session()["cursor"], 2, "Enter does not click the row again")

    def test_3_refused_insert_is_not_done_by_enter(self):
        self.open("")
        self.start_match("ustc-school-cup")
        self.key("ArrowRight")
        self.key("Space")
        self.assertTrue(self.running())
        self.key("KeyX")
        self.wait("document.querySelector('.dt-overlay[data-name=insert]')")
        stages = len(self.session()["timeline"])
        self.click(".dt-overlay[data-name=insert] button[data-side='con'][data-variant='0']")
        self.assertEqual(len(self.session()["timeline"]), stages, "refused: 先暂停再插入")
        self.key("Space")
        self.assertFalse(self.running())
        self.key("Enter")
        self.assertEqual(len(self.session()["timeline"]), stages, "Enter does not press the insert button again")

    def test_4_space_right_after_closing_the_editor_counts(self):
        self.open("")
        self.start_match()
        self.key("ArrowRight")
        self.key("KeyE")
        self.wait("document.querySelector('.dt-editor')")
        time.sleep(0.5)   # fully risen
        self.key("Escape", hold=0.01, settle=0)
        self.key("Space", hold=0.01, settle=0)   # well inside the 260 ms the editor takes to sink away
        time.sleep(0.6)
        self.assertFalse(self.js("!!document.querySelector('.dt-editor')"))
        self.assertEqual(self.toggles(), 1, "exactly one toggle")
        self.assertTrue(self.running())

    def test_5_single_screen_start_button_then_space_twice(self):
        self.open("")
        self.start_match()
        self.key("ArrowRight")
        self.mouse("mouseMoved", 600, 300, 0)
        self.mouse("mouseMoved", 610, 310, 0)   # the dock shows on pointer movement
        self.wait("document.querySelector('.dt-dock[data-shown]')")
        self.click(".dt-dock button[data-act='toggle']")
        self.assertEqual(self.toggles(), 1)
        self.assertTrue(self.running())
        self.key("Space")
        self.assertEqual(self.toggles(), 2)
        self.assertFalse(self.running(), "the first space pauses")
        self.key("Space")
        self.assertEqual(self.toggles(), 3)
        self.assertTrue(self.running(), "the second starts again")

    def test_6_title_card_space_starts_the_first_stage(self):
        self.open("")
        self.start_match()
        self.assertEqual(self.session()["cursor"], -1)
        self.key("Space")
        self.assertEqual(self.session()["cursor"], 0)
        self.assertTrue(self.running())
        self.assertEqual(self.toggles(), 1)

    # ---- reset and exit (2026-10-03 §2) ----

    def double_click(self, selector):
        """A real double-click: two presses about 20 ms apart, as a shaky hand gives them."""
        left, top, width, height = self.rect(selector)
        x, y = left + width / 2, top + height / 2
        self.mouse("mouseMoved", x, y, 0)
        for count in (1, 2):
            self.cdp.send("Input.dispatchMouseEvent",
                          {"type": "mousePressed", "x": x, "y": y, "button": "left", "buttons": 1, "clickCount": count})
            self.cdp.send("Input.dispatchMouseEvent",
                          {"type": "mouseReleased", "x": x, "y": y, "button": "left", "buttons": 0, "clickCount": count})
            time.sleep(0.02)
        time.sleep(0.1)

    def test_7_dock_exit_takes_two_deliberate_clicks_and_keeps_the_match(self):
        self.open("")
        self.start_match()
        self.key("Space")
        self.assertTrue(self.running())
        self.mouse("mouseMoved", 600, 300, 0)
        self.mouse("mouseMoved", 610, 310, 0)   # the dock shows on pointer movement
        self.wait("document.querySelector('.dt-dock[data-shown]')")
        exit_button = ".dt-dock button[data-act='exit']"
        self.double_click(exit_button)
        self.assertEqual(self.js("window.__dtTest.route()"), "timer", "a double-click does not confirm")
        time.sleep(1.7)   # the armed button gives up
        self.click(exit_button)
        time.sleep(0.35)
        self.click(exit_button)
        self.wait("window.__dtTest.route() === 'setup'")
        self.assertIn("上一场还没打完", self.js("document.querySelector('.dt-setup-resume').textContent"))
        saved = self.js("JSON.parse(localStorage.getItem('dt.session.v1'))")
        stage = saved["timeline"][saved["cursor"]]
        self.assertEqual(saved["cursor"], 0)
        self.assertFalse(saved["runs"][stage["id"]]["running"], "the clock stopped on the way out")


if __name__ == "__main__":
    unittest.main()
