from sqlmodel import Field, SQLModel


class Universe(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    universe_number: int = Field(unique=True)
    active: bool = True
