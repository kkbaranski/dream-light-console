import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from dream_light_console.core.dmx_engine import engine

router = APIRouter()
logger = logging.getLogger(__name__)

connected_clients: set[WebSocket] = set()


async def _broadcast_loop(websocket: WebSocket) -> None:
    try:
        while True:
            channels = list(engine.get_universe(1))
            message = json.dumps(
                {"type": "universe_update", "universe": 1, "channels": channels}
            )
            await websocket.send_text(message)
            await asyncio.sleep(0.1)
    except Exception:
        pass


def _handle_set_channel(msg: dict[str, Any]) -> None:
    try:
        engine.set_channel(int(msg["universe"]), int(msg["channel"]), int(msg["value"]))
    except Exception as exc:
        logger.debug("set_channel error: %s", exc)


def _handle_set_channels(msg: dict[str, Any]) -> None:
    try:
        universe = int(msg["universe"])
        for ch_str, val in dict(msg["data"]).items():
            engine.set_channel(universe, int(ch_str), int(val))
    except Exception as exc:
        logger.debug("set_channels error: %s", exc)


def _handle_set_universe(msg: dict[str, Any]) -> None:
    try:
        engine.set_universe(int(msg["universe"]), bytearray(int(v) for v in msg["data"]))
    except Exception as exc:
        logger.debug("set_universe error: %s", exc)


async def _handle_message(websocket: WebSocket, text: str) -> None:
    try:
        msg: dict[str, Any] = json.loads(text)
    except json.JSONDecodeError:
        logger.debug("Invalid JSON from WS client: %.200r", text)
        return

    msg_type = msg.get("type")
    if msg_type == "set_channel":
        _handle_set_channel(msg)
    elif msg_type == "set_channels":
        _handle_set_channels(msg)
    elif msg_type == "set_universe":
        _handle_set_universe(msg)
    elif msg_type == "ping":
        await websocket.send_text('{"type":"pong"}')
    else:
        logger.debug("Unknown WS message type: %r", msg_type)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    connected_clients.add(websocket)
    broadcast_task = asyncio.create_task(_broadcast_loop(websocket))
    try:
        while True:
            text = await websocket.receive_text()
            await _handle_message(websocket, text)
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as exc:
        logger.warning("WebSocket error: %s", exc)
    finally:
        broadcast_task.cancel()
        connected_clients.discard(websocket)
