from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from dream_light_console.models.fixture import Fixture


async def list_fixtures(session: AsyncSession) -> list[Fixture]:
    result = await session.exec(select(Fixture))
    return list(result.all())


async def get_fixture(session: AsyncSession, fixture_id: int) -> Fixture | None:
    return await session.get(Fixture, fixture_id)


async def create_fixture(session: AsyncSession, fixture: Fixture) -> Fixture:
    session.add(fixture)
    await session.commit()
    await session.refresh(fixture)
    return fixture


async def update_fixture(session: AsyncSession, fixture: Fixture) -> Fixture:
    session.add(fixture)
    await session.commit()
    await session.refresh(fixture)
    return fixture


async def delete_fixture(session: AsyncSession, fixture: Fixture) -> None:
    await session.delete(fixture)
    await session.commit()
