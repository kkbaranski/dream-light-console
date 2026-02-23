from sqlmodel import Field, SQLModel


class Fixture(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    universe: int
    start_channel: int
    channel_count: int
    fixture_type: str = "generic"  # "generic" | "rgb"
    x: float = Field(default=50.0)  # percent of canvas width,  0.0–100.0
    y: float = Field(default=50.0)  # percent of canvas height, 0.0–100.0
