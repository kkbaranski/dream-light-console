# DreamLightConsole

Web-based DMX lighting control for live events. Rust backend + React/Three.js frontend.

## Quick Start

### Prerequisites
- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) (v20+)
- [Overmind](https://github.com/DarthSim/overmind) (optional, for running both processes)

### Development

**Option A — Overmind (recommended):**
```bash
npm install --prefix web-ui
overmind start -f Procfile.dev
```
Then open http://localhost:5173

**Option B — Two terminals:**
```bash
# Terminal 1: Rust backend
cargo run -p dlc-server

# Terminal 2: Frontend dev server
cd web-ui && npm run dev
```

### Production Build
```bash
cd web-ui && npm run build
cargo build --release -p dlc-server
./target/release/dlc-server
```
Then open http://localhost:3000

## Architecture
See `CLAUDE.md` for full project conventions and architecture details.
