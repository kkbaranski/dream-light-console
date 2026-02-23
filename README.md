# Dream Light Console

A production-ready DMX lighting controller with a real-time web UI and optional desktop shell.

## Architecture

```
Tauri 2 (desktop shell)
  └─► React 18 + TypeScript + Vite (frontend, port 5173)
        └─► FastAPI + asyncio (backend, port 8765)
              └─► MockDMXOutput / OLA / ArtNet / sACN
                    └─► DMX hardware (fixtures, dimmers)
```

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.12+ | `pyenv` or `mise` recommended |
| Node.js | 20+ | LTS recommended |
| Rust | stable | Required for Tauri desktop build |
| mise | latest | Task runner (`brew install mise`) |
| OLA | optional | For real hardware output |

## Quick Start

```bash
# One-time setup
mise run setup

# Web development (backend + frontend, no Tauri)
mise run dev

# Full desktop app (requires Rust + Tauri CLI)
mise run tauri-dev
```

## Development Workflow

### Web mode (recommended for most development)

```bash
mise run dev
# Backend:  http://127.0.0.1:8765
# Frontend: http://localhost:5173
# API docs: http://127.0.0.1:8765/docs
```

### Desktop mode (Tauri)

```bash
mise run tauri-dev
# Tauri manages the frontend dev server.
# The Python backend must be running separately:
mise run backend-dev
```

### Individual services

```bash
mise run backend-dev    # FastAPI only
mise run frontend-dev   # Vite only
```

## mise Task Reference

| Task | Description |
|------|-------------|
| `setup` | One-time project setup |
| `install` | Install all dependencies |
| `dev` | Start backend + frontend (web mode) |
| `tauri-dev` | Start full desktop app |
| `tauri-build` | Build desktop app for distribution |
| `backend-install` | Install Python deps |
| `backend-dev` | FastAPI dev server with reload |
| `backend-test` | Run pytest |
| `backend-test-watch` | pytest in watch mode |
| `backend-lint` | ruff check + format check |
| `backend-fmt` | ruff format |
| `frontend-install` | npm install |
| `frontend-dev` | Vite dev server |
| `frontend-build` | Production build |
| `frontend-lint` | ESLint |
| `check` | Run all linters + tests |
| `clean` | Remove all build artifacts |
| `logs` | Show SQLite schema |

## Project Structure

```
dream-light-console/
├── backend/                # Python FastAPI backend
│   └── src/dream_light_console/
│       ├── api/            # REST + WebSocket endpoints
│       ├── core/           # DMX engine + output drivers
│       ├── models/         # SQLModel database models
│       └── services/       # Business logic layer
├── frontend/               # React + TypeScript UI
│   └── src/
│       ├── components/     # UI components
│       ├── hooks/          # useWebSocket, useApi
│       ├── pages/          # Dashboard, StageEditor
│       ├── store/          # Zustand DMX state
│       └── api/            # Typed fetch client
└── src-tauri/              # Tauri 2 desktop shell (Rust)
```
