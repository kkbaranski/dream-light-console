import pytest
from httpx import ASGITransport, AsyncClient

from dream_light_console.core.dmx_engine import DMXEngine
from dream_light_console.core.dmx_output import MockDMXOutput
from dream_light_console.main import app


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
def engine_mock(monkeypatch: pytest.MonkeyPatch) -> MockDMXOutput:
    mock_output = MockDMXOutput()
    import dream_light_console.core.dmx_engine as engine_module

    new_engine = DMXEngine.__new__(DMXEngine)
    new_engine._buffers = {}
    new_engine._output = mock_output
    new_engine._task = None
    monkeypatch.setattr(engine_module, "engine", new_engine)
    return mock_output
