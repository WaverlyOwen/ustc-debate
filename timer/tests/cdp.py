"""A minimal DevTools protocol client for the timer's browser tools (test_keyboard.py, motion.py).

launch() starts a headless Edge (or Chrome) of the caller's own with --remote-debugging-port and returns a CDP
connection to its page; stop() ends that browser only, never one found by name.
"""
import base64
import json
import os
import shutil
import socket
import struct
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request


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


def launch(browser, profiles, size=(1366, 768)):
    """(Popen, profile dir, CDP connection to its page): a headless browser of the caller's own, its throwaway
    profile made under `profiles`, its window `size` (width, height) CSS pixels."""
    port = free_port()
    profiles.mkdir(parents=True, exist_ok=True)
    profile = tempfile.mkdtemp(prefix="edge-", dir=str(profiles))
    proc = subprocess.Popen([
        browser, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={profile}",
        "--allow-file-access-from-files", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
        f"--window-size={size[0]},{size[1]}", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
    shutil.rmtree(profile, ignore_errors=True)
    raise RuntimeError("the browser offered no page to drive")


def stop(proc, profile, cdp=None):
    """Ends the browser launch() started (and only it) and removes its profile."""
    if cdp:
        cdp.close()
    proc.terminate()
    try:
        proc.wait(10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(10)
    shutil.rmtree(profile, ignore_errors=True)
