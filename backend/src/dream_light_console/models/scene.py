from sqlmodel import Field, SQLModel


class Scene(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    data: str = "{}"  # JSON-encoded channel values
