"""Xuất JSON Schema của tin nhắn WS (docs/04, P1-11) → shared/ws-schema.json.

    uv run python -m scripts.export_ws_schema
Web sinh type TS từ file này bằng `pnpm gen:ws` (json-schema-to-typescript).
"""

import json
from pathlib import Path

from pydantic import TypeAdapter

from app.ws.messages import ClientMsg, ServerMsg

OUT = Path(__file__).resolve().parents[2] / "shared" / "ws-schema.json"


def main() -> None:
    schema = TypeAdapter(dict[str, ClientMsg | ServerMsg]).json_schema(by_alias=True)
    defs = schema["$defs"]
    client = TypeAdapter(ClientMsg).json_schema(by_alias=True)
    server = TypeAdapter(ServerMsg).json_schema(by_alias=True)
    for s in (client, server):
        s.pop("$defs", None)
    doc = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "OkiaWs",
        "type": "object",
        "properties": {"client": client, "server": server},
        "required": ["client", "server"],
        "additionalProperties": False,
        "definitions": defs,
    }
    text = json.dumps(doc, ensure_ascii=False, indent=2).replace("#/$defs/", "#/definitions/")
    OUT.write_text(text + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(OUT.parents[1])}")


if __name__ == "__main__":
    main()
