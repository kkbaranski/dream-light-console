from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from dream_light_console.core.dmx_engine import engine

router = APIRouter()


class ChannelValue(BaseModel):
    value: int


class UniverseData(BaseModel):
    data: list[int]


@router.get("/universes/{universe_id}/channels")
async def get_channels(universe_id: int) -> list[int]:
    return list(engine.get_universe(universe_id))


@router.put("/universes/{universe_id}/channels/{channel}")
async def set_channel(universe_id: int, channel: int, body: ChannelValue) -> dict[str, int]:
    try:
        engine.set_channel(universe_id, channel, body.value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"channel": channel, "value": body.value}


@router.put("/universes/{universe_id}")
async def set_universe(universe_id: int, body: UniverseData) -> dict[str, object]:
    try:
        engine.set_universe(universe_id, body.data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"universe": universe_id, "channels_set": len(body.data)}
