import asyncio
import logging

from dream_light_console.config import settings
from dream_light_console.core.dmx_output import DMXOutput, create_dmx_output

logger = logging.getLogger(__name__)


class DMXEngine:
    def __init__(self) -> None:
        self._buffers: dict[int, bytearray] = {}
        self._output: DMXOutput = create_dmx_output(settings.dmx_output_type)
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        await self._output.connect()
        self._task = asyncio.create_task(self._loop())
        logger.info("DMX engine started at %d Hz", settings.dmx_fps)

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await self._output.disconnect()
        logger.info("DMX engine stopped")

    async def _loop(self) -> None:
        interval = 1.0 / settings.dmx_fps
        while True:
            for universe, buffer in self._buffers.items():
                await self._output.send_universe(universe, buffer)
            await asyncio.sleep(interval)

    def set_channel(self, universe: int, channel: int, value: int) -> None:
        if channel < 1 or channel > 512:
            raise ValueError(f"Channel must be 1-512, got {channel}")
        if value < 0 or value > 255:
            raise ValueError(f"Value must be 0-255, got {value}")
        buf = self.get_universe(universe)
        buf[channel - 1] = value

    def get_universe(self, universe: int) -> bytearray:
        if universe not in self._buffers:
            self._buffers[universe] = bytearray(512)
        return self._buffers[universe]

    def set_universe(self, universe: int, data: list[int]) -> None:
        if len(data) > 512:
            raise ValueError(f"Universe data must be at most 512 values, got {len(data)}")
        buf = self.get_universe(universe)
        for i, v in enumerate(data):
            buf[i] = v
        for i in range(len(data), 512):
            buf[i] = 0


engine = DMXEngine()
