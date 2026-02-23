import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel

from dream_light_console.api.router import router
from dream_light_console.config import settings
from dream_light_console.core.dmx_engine import engine

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    from dream_light_console.models import fixture, scene, universe  # noqa: F401 — register models

    # SQLModel uses the default sync engine for create_all; for aiosqlite we use a sync URL
    from sqlalchemy import create_engine as _sync_create_engine

    sync_url = settings.db_url.replace("sqlite+aiosqlite", "sqlite")
    sync_engine = _sync_create_engine(sync_url)
    SQLModel.metadata.create_all(sync_engine)
    sync_engine.dispose()

    await engine.start()
    logger.info("Dream Light Console backend started")
    yield
    await engine.stop()
    logger.info("Dream Light Console backend stopped")


app = FastAPI(title="Dream Light Console", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


def run() -> None:
    uvicorn.run(
        "dream_light_console.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
        reload=False,
    )
