# Dream Light Console — Backend

FastAPI backend providing DMX control via REST and WebSocket.

## Development

```bash
# Install deps
pip install -e ".[dev]"

# Run dev server
uvicorn dream_light_console.main:app --host 127.0.0.1 --port 8765 --reload --reload-dir src

# Run tests
pytest -v
```
