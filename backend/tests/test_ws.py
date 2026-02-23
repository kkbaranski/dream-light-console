import pytest
from starlette.testclient import TestClient

import dream_light_console.api.ws as ws_module
from dream_light_console.core.dmx_engine import DMXEngine
from dream_light_console.core.dmx_output import MockDMXOutput
from dream_light_console.main import app


@pytest.fixture()
def ws_engine(monkeypatch: pytest.MonkeyPatch) -> DMXEngine:
    """Patch the engine used directly by ws.py with a fresh isolated instance."""
    mock_output = MockDMXOutput()
    fresh: DMXEngine = DMXEngine.__new__(DMXEngine)
    fresh._buffers = {}  # type: ignore[attr-defined]
    fresh._output = mock_output  # type: ignore[attr-defined]
    fresh._task = None  # type: ignore[attr-defined]
    monkeypatch.setattr(ws_module, "engine", fresh)
    return fresh


def _wait_for_pong(ws: object, attempts: int = 30) -> bool:
    """Drain messages until pong arrives. Returns True on success."""
    for _ in range(attempts):
        msg = ws.receive_json()  # type: ignore[union-attr]
        if msg["type"] == "pong":
            return True
    return False


def test_ping_receives_pong(ws_engine: DMXEngine) -> None:
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type": "ping"})
            assert _wait_for_pong(ws), "Never received pong"


def test_set_channel_updates_dmx_buffer(ws_engine: DMXEngine) -> None:
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type": "set_channel", "universe": 1, "channel": 5, "value": 200})
            # ping after to ensure set_channel was processed before we read the buffer
            ws.send_json({"type": "ping"})
            assert _wait_for_pong(ws), "Never received pong"

    channels = list(ws_engine.get_universe(1))
    assert channels[4] == 200  # channel 5 → 0-indexed position 4


def test_malformed_json_keeps_connection_alive(ws_engine: DMXEngine) -> None:
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            ws.send_text("not valid json {{{")
            ws.send_json({"type": "ping"})
            assert _wait_for_pong(ws), "Connection dropped after malformed JSON"


def test_unknown_message_type_is_ignored(ws_engine: DMXEngine) -> None:
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type": "completely_unknown_xyz", "extra": "data"})
            ws.send_json({"type": "ping"})
            assert _wait_for_pong(ws), "Connection dropped after unknown message type"
