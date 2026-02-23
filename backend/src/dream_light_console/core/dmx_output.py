import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class DMXOutput(ABC):
    @abstractmethod
    async def connect(self) -> None: ...

    @abstractmethod
    async def send_universe(self, universe: int, data: bytearray) -> None: ...

    @abstractmethod
    async def disconnect(self) -> None: ...


class MockDMXOutput(DMXOutput):
    def __init__(self) -> None:
        self.universes: dict[int, bytearray] = {}

    async def connect(self) -> None:
        logger.info("MockDMXOutput connected")

    async def send_universe(self, universe: int, data: bytearray) -> None:
        self.universes[universe] = data
        logger.debug("MockDMXOutput universe=%d first_10=%s", universe, list(data[:10]))

    async def disconnect(self) -> None:
        logger.info("MockDMXOutput disconnected")


def create_dmx_output(output_type: str) -> DMXOutput:
    if output_type == "mock":
        return MockDMXOutput()
    raise NotImplementedError(f"DMX output type '{output_type}' is not implemented yet")
