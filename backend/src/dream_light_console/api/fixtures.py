from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from dream_light_console.core.db import get_session
from dream_light_console.models.fixture import Fixture
from dream_light_console.services.fixture_service import (
    create_fixture,
    delete_fixture,
    get_fixture,
    list_fixtures,
    update_fixture,
)

router = APIRouter()


class FixtureCreate(BaseModel):
    name: str
    universe: int
    start_channel: int = Field(ge=1, le=512)
    channel_count: int = Field(ge=1, le=512)
    fixture_type: str = "generic"
    x: float = Field(default=50.0, ge=0.0, le=100.0)
    y: float = Field(default=50.0, ge=0.0, le=100.0)


class FixtureUpdate(BaseModel):
    name: str | None = None
    fixture_type: str | None = None
    x: float | None = Field(default=None, ge=0.0, le=100.0)
    y: float | None = Field(default=None, ge=0.0, le=100.0)


class FixtureRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    universe: int
    start_channel: int
    channel_count: int
    fixture_type: str
    x: float
    y: float


@router.get("/fixtures", response_model=list[FixtureRead])
async def list_fixtures_endpoint(
    session: AsyncSession = Depends(get_session),
) -> list[Fixture]:
    return await list_fixtures(session)


@router.post("/fixtures", response_model=FixtureRead, status_code=201)
async def create_fixture_endpoint(
    body: FixtureCreate,
    session: AsyncSession = Depends(get_session),
) -> Fixture:
    fixture = Fixture(**body.model_dump())
    return await create_fixture(session, fixture)


@router.patch("/fixtures/{fixture_id}", response_model=FixtureRead)
async def update_fixture_endpoint(
    fixture_id: int,
    body: FixtureUpdate,
    session: AsyncSession = Depends(get_session),
) -> Fixture:
    fixture = await get_fixture(session, fixture_id)
    if fixture is None:
        raise HTTPException(status_code=404, detail="Fixture not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(fixture, field, value)
    return await update_fixture(session, fixture)


@router.delete("/fixtures/{fixture_id}", status_code=204)
async def delete_fixture_endpoint(
    fixture_id: int,
    session: AsyncSession = Depends(get_session),
) -> None:
    fixture = await get_fixture(session, fixture_id)
    if fixture is None:
        raise HTTPException(status_code=404, detail="Fixture not found")
    await delete_fixture(session, fixture)
