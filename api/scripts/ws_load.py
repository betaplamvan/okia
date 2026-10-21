"""Đo tải WebSocket (docs/02 — Tải): mở N kết nối khách, giữ, đo RSS uvicorn và thời gian welcome.

Chạy trong container API production (cùng máy, không qua Cloudflare):

    b64=$(base64 -w0 api/scripts/ws_load.py)
    docker exec okia-api sh -c "echo $b64 | base64 -d > /tmp/ws_load_run.py"
    docker exec okia-api python -u /tmp/ws_load_run.py 300 20

(`docker cp` từ stdin tạo symlink tới /proc/self/fd/0 trong container — đừng dùng.) Chạy nhiều lần
thì xóa bộ đếm `rl:guest:*` trong Redis giữa các lần (30 khách/giờ/IP).

Tham số: N kết nối (mặc định 300), K tài khoản khách (mặc định 20; `/auth/guest` giới hạn
30/giờ/IP — mỗi khách mở N/K kết nối, tối đa `ws_max_conn_per_user` × số worker). Không đi nước,
không tạo phòng: chỉ nối, nhận welcome, ping mỗi 5 giây rồi đóng. Mỗi kết nối chiếm một fd ở
server — đây là cách kiểm tra `--ulimit nofile` của deploy/deploy-container.sh.
"""

import asyncio
import json
import os
import sys
import time
import urllib.request
import uuid

import websockets

N = int(sys.argv[1]) if len(sys.argv) > 1 else 300
K = int(sys.argv[2]) if len(sys.argv) > 2 else 20
HOLD_SECONDS = float(os.environ.get("HOLD_SECONDS", "15"))
BASE = os.environ.get("BASE", "http://127.0.0.1:8000")
WS = BASE.replace("http://", "ws://").replace("https://", "wss://") + "/ws"


def rss_kb() -> int:
    """Tổng VmRSS của mọi tiến trình uvicorn trong container (nhiều worker thì cộng lại)."""
    total = 0
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as f:
                cmd = f.read()
            # Worker của uvicorn --workers có cmdline "python -c from multiprocessing.spawn …".
            if b"uvicorn" not in cmd and b"multiprocessing.spawn" not in cmd:
                continue
            with open(f"/proc/{pid}/status") as f:
                for line in f:
                    if line.startswith("VmRSS:"):
                        total += int(line.split()[1])
        except OSError:
            pass
    return total


def guest_token() -> str:
    body = json.dumps({"deviceId": str(uuid.uuid4()), "locale": "vi"}).encode()
    req = urllib.request.Request(
        f"{BASE}/auth/guest", data=body, headers={"content-type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)["accessToken"]


async def hold(token: str, stats: dict, stop: asyncio.Event) -> None:
    t0 = time.perf_counter()
    try:
        async with websockets.connect(f"{WS}?token={token}", open_timeout=30, max_size=2**20) as ws:
            await asyncio.wait_for(ws.recv(), 30)  # welcome
            stats["welcome_ms"].append((time.perf_counter() - t0) * 1000)
            stats["ok"] += 1
            while not stop.is_set():
                await ws.send('{"t":"ping"}')
                try:
                    await asyncio.wait_for(ws.recv(), 5)
                except TimeoutError:
                    pass
                await asyncio.sleep(5)
    except Exception as e:  # noqa: BLE001
        stats["fail"] += 1
        name = f"{type(e).__name__}:{getattr(e, 'rcvd', None) and e.rcvd.code}"
        stats["errors"][name] = stats["errors"].get(name, 0) + 1


async def main() -> None:
    before = rss_kb()
    t0 = time.perf_counter()
    base = [guest_token() for _ in range(K)]
    print(f"tạo {K} khách: {time.perf_counter() - t0:.1f}s; mỗi khách mở {N // K} kết nối")
    tokens = [base[i % K] for i in range(N)]
    stats: dict = {"ok": 0, "fail": 0, "welcome_ms": [], "errors": {}}
    stop = asyncio.Event()
    t1 = time.perf_counter()
    tasks = [asyncio.create_task(hold(t, stats, stop)) for t in tokens]
    await asyncio.sleep(HOLD_SECONDS)
    during = rss_kb()
    stop.set()
    await asyncio.gather(*tasks)
    after = rss_kb()
    ms = sorted(stats["welcome_ms"])

    def pct(q: float) -> float:
        return ms[min(len(ms) - 1, int(len(ms) * q))] if ms else 0

    print(f"kết nối ok={stats['ok']} fail={stats['fail']} lỗi={stats['errors']}")
    print(f"welcome p50={pct(0.5):.0f}ms p95={pct(0.95):.0f}ms max={ms[-1] if ms else 0:.0f}ms")
    print(
        f"RSS uvicorn: trước {before / 1024:.0f}MB, đang giữ {during / 1024:.0f}MB, "
        f"sau {after / 1024:.0f}MB"
    )
    if stats["ok"]:
        print(f"≈ {(during - before) / stats['ok']:.0f} KB mỗi kết nối")
    print(f"tổng thời gian {time.perf_counter() - t1:.1f}s")


asyncio.run(main())
