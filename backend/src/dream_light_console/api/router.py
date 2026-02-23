from fastapi import APIRouter

from dream_light_console.api import fixtures, health, scenes, universes, ws

router = APIRouter()

router.include_router(health.router)
router.include_router(universes.router, prefix="/api")
router.include_router(fixtures.router, prefix="/api")
router.include_router(scenes.router, prefix="/api")
router.include_router(ws.router)
