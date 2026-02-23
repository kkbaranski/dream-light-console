from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DLC_", env_file=".env", extra="ignore")

    host: str = "127.0.0.1"
    port: int = 8765
    db_url: str = "sqlite+aiosqlite:///./dream_light_console.db"
    dmx_output_type: str = "mock"  # "mock" | "ola" | "artnet" | "sacn"
    dmx_fps: int = 40
    log_level: str = "INFO"


settings = Settings()
