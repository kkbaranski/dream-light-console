import pytest

from dream_light_console.core.dmx_engine import DMXEngine
from dream_light_console.core.dmx_output import MockDMXOutput


@pytest.fixture
def eng() -> DMXEngine:
    e = DMXEngine.__new__(DMXEngine)
    e._buffers = {}
    e._output = MockDMXOutput()
    e._task = None
    return e


def test_set_channel_updates_buffer(eng: DMXEngine) -> None:
    eng.set_channel(1, 10, 200)
    assert eng.get_universe(1)[9] == 200


def test_set_channel_rejects_channel_zero(eng: DMXEngine) -> None:
    with pytest.raises(ValueError):
        eng.set_channel(1, 0, 100)


def test_set_channel_rejects_channel_513(eng: DMXEngine) -> None:
    with pytest.raises(ValueError):
        eng.set_channel(1, 513, 100)


def test_set_channel_rejects_value_256(eng: DMXEngine) -> None:
    with pytest.raises(ValueError):
        eng.set_channel(1, 1, 256)


def test_set_channel_rejects_negative_value(eng: DMXEngine) -> None:
    with pytest.raises(ValueError):
        eng.set_channel(1, 1, -1)


def test_get_universe_returns_512_bytearray(eng: DMXEngine) -> None:
    buf = eng.get_universe(1)
    assert isinstance(buf, bytearray)
    assert len(buf) == 512


def test_set_universe_with_valid_data(eng: DMXEngine) -> None:
    data = list(range(256)) + list(range(256))
    eng.set_universe(1, data)
    buf = eng.get_universe(1)
    assert list(buf) == data


def test_set_universe_raises_for_data_too_long(eng: DMXEngine) -> None:
    with pytest.raises(ValueError):
        eng.set_universe(1, [0] * 513)
