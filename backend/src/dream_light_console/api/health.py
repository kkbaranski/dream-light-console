from fastapi import APIRouter

from dream_light_console.config import settings

router = APIRouter()


@router.get("/health")
async def get_health() -> dict[str, object]:
    return {"status": "ok", "version": "0.1.0", "dmx_fps": settings.dmx_fps}
