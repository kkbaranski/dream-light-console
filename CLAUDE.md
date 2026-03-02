# CLAUDE.md — DreamLightConsole Project Conventions

## What This Project Is

DreamLightConsole is a web-based DMX lighting control system for live events. A Rust backend serves a React/Three.js frontend over HTTP and WebSocket. Multiple operators on different laptops connect via LAN to collaboratively control lights in real-time.

## Repository Structure

```
DreamLightConsole/
├── CLAUDE.md                  ← You are here. Read this first.
├── Cargo.toml                 ← Rust workspace root
├── Procfile.dev               ← Overmind process manager (dev)
├── crates/
│   ├── dlc-server/            ← Axum HTTP + WebSocket server
│   ├── dlc-engine/            ← DMX engine: 44Hz loop, merge, fade, cues
│   ├── dlc-protocol/          ← Shared types: binary WS messages, ts-rs bindings
│   └── dlc-audio/             ← Audio capture + beat detection (future)
├── web-ui/                    ← React + Vite + Three.js frontend
│   ├── src/
│   │   ├── api/               ← REST client + TanStack Query hooks
│   │   ├── components/        ← React components (stage/, dmx/, layout/, ui/)
│   │   ├── devices/           ← Capability system (THE core abstraction)
│   │   ├── hooks/             ← useObjectDrag, useWebSocket
│   │   ├── materials/         ← Floor/wall material registry
│   │   ├── pages/             ← Route-level page components
│   │   ├── scene/             ← Scene object type definitions
│   │   ├── stages/            ← Stage model registry
│   │   ├── store/             ← Zustand stores
│   │   └── types/             ← Shared TypeScript types
│   └── public/                ← Static assets (3D models, textures)
├── .ai/
│   └── tasks/                 ← AI agent task cards (markdown)
├── tests/                     ← Integration + E2E tests
└── docs/                      ← User documentation
```

## The Capability System (Critical Context)

The most important abstraction in this project lives in `web-ui/src/devices/`. Every AI agent touching frontend code MUST understand this before making changes.

A **device** (Moving Head, Gobo, Fresnel, Speaker, etc.) is defined in `registry.ts` as a `DeviceDef` with one or more **modes**. Each mode composes **capabilities**: `name`, `dmx`, `power`, `transform`, `dimmer`, `pan`, `tilt`, `rgbColor`, `colorWheel`, `dualWhite`, `innerPole`, `beam`.

Each capability (`CapabilityDef<TConfig>`) self-describes:
- `defaultState(config)` — initial field values for a SceneObject
- `dmxChannels(config)` — DMX channel layout (offsets, encodings)
- `applyToModel(model, obj, config, boundCaps)` — per-frame GLTF mutations (runs in useFrame)
- `Inspector` — React component for the right-side panel
- `headerWidget` — compact control in the inspector header

Capabilities are composed via `bind(cap, config)` and resolved at runtime via `activeCapabilities(def, modeKey)` with WeakMap caching.

**To add a new device**: add an entry to `DEVICE_REGISTRY` in `registry.ts`. No other files need to change.

**To add a new capability**: create a file in `devices/capabilities/`, export from `index.ts`, add to `CAPABILITY_MAP` in `registry.ts`, and add the config type to `FixtureMode`.

## Naming Conventions

### Rust
- `snake_case` for functions, variables, modules
- `PascalCase` for types, traits, enums
- No abbreviations except: `ch` (channel), `ws` (WebSocket), `dmx`, `htp`, `ltp`, `bpm`
- Crate names prefixed with `dlc-`
- Error types named `{Module}Error` (e.g., `EngineError`, `ProtocolError`)
- Use `thiserror` for error definitions, `anyhow` only in binary entry points

### TypeScript
- `camelCase` for functions, variables, hook names
- `PascalCase` for components, types, interfaces, enums
- Zustand stores: `use{Domain}Store` (e.g., `useStageEditorStore`, `useDMXStore`)
- Hooks: `use{Verb}{Noun}` (e.g., `useObjectDrag`, `useWebSocket`)
- Capability types: `{Name}Config` (e.g., `BeamConfig`, `PanConfig`)
- File names: `PascalCase.tsx` for components, `camelCase.ts` for utilities

### Shared
- DMX channels: 0-based in code, 1-based in UI display only
- Universe IDs: 1-based everywhere (matches DMX convention)
- Positions: meters, Y-up coordinate system (Three.js default)
- Angles: degrees in UI/config, radians only at the math boundary
- Colors: `#rrggbb` hex strings in state, `THREE.Color` only in render code
- IDs: UUID v4 strings for scene objects, auto-increment integers for DB records

## Rust Conventions

### Error Handling
```rust
// Use Result for all fallible operations
fn parse_fader_update(data: &[u8]) -> Result<FaderUpdate, ProtocolError> {
    if data.len() < 6 {
        return Err(ProtocolError::InsufficientData {
            expected: 6,
            actual: data.len(),
        });
    }
    // ...
}

// Engine commands return Result, never panic
// Use .expect() ONLY for programmer errors (invariants that truly can't fail)
```

### Async
- Axum handlers: `async fn`
- Engine loop: dedicated `std::thread` with sync code (no async in the hot path)
- Communication: `tokio::sync::mpsc` for API→Engine, `tokio::sync::broadcast` for Engine→WS clients
- Audio analyzer: separate binary, communicates via UDP

### Testing
```bash
cargo nextest run                                        # all tests
cargo nextest run -p dlc-engine                          # one crate
cargo nextest run -p dlc-engine -E 'test(interpolation)' # pattern match
cargo nextest run --no-capture                           # with stdout
```

### Dependencies Policy
- `axum` for HTTP/WS, `sqlx` for SQLite, `tokio` for async runtime
- `serde` + `serde_json` for JSON, `rmp-serde` for MessagePack
- `ts-rs` for TypeScript type generation from Rust structs
- No `unsafe` without a comment explaining why and what invariant is maintained

## TypeScript Conventions

### State Management Categories

1. **Reactive stores** (trigger re-renders): `stageEditorStore`, `stagesStore`
   - Subscribe via `useStore((s) => s.field)` — React re-renders on change
   - Used for UI state: selection, objects, materials

2. **Imperative stores** (bypass React): `dmxStore` for live DMX data
   - Written via `store.setState()` from WebSocket handler
   - Read in `useFrame` via `store.getState()` — never triggers React
   - Critical for 60fps with 200+ fixtures

3. **Connection stores**: WebSocket status, user identity, latency

### React Three Fiber Rules
- NEVER allocate objects inside `useFrame`
- NEVER subscribe to zustand reactively for per-frame data — use `getState()`
- Use `InstancedMesh` for any geometry with > 10 instances
- Cache GLTF node lookups in `model.userData` (see `getCachedNode`)
- Dispose geometries and materials in cleanup functions

## Binary WebSocket Protocol

```
Client→Server:
  0x01  FaderUpdate     [fixture_id:u16][param:u8][value:u16]       = 6 bytes
  0x02  GoButton        [cue_id:u16]                                = 3 bytes
  0x05  BatchFaders     [count:u8][fixture_id:u16,param:u8,value:u16]×N
  0x10  Subscribe       [topic_id:u16]                              = 3 bytes
  0x11  Unsubscribe     [topic_id:u16]                              = 3 bytes
  0x85  LockAcquire     [entity_type:u8][entity_id:u32]             = 6 bytes
  0x86  LockRelease     [entity_type:u8][entity_id:u32]             = 6 bytes
  0xF0  SyncRequest     (empty)                                     = 1 byte

Server→Client:
  0x80  DmxPreview      [universe:u8][512 bytes]                    = 514 bytes
  0x81  DmxDelta        [count:u16][channel:u16,value:u8]×N
  0x82  StateSnapshot   [MessagePack payload]
  0x83  CueFired        [cue_id:u16][timestamp:u64]                 = 11 bytes
  0x84  FaderEcho       [user_id:u8][fixture_id:u16][param:u8][value:u16] = 7 bytes
  0x87  LockState       [entity_type:u8][entity_id:u32][holder:u8]  = 7 bytes
```

All multi-byte integers are little-endian.

## Build & Run

```bash
# Development (both processes)
overmind start -f Procfile.dev

# Or separately:
cargo run -p dlc-server                    # Rust on :3000
cd web-ui && npm run dev                   # Vite on :5173, proxies to :3000

# Production
cd web-ui && npm run build
cargo build --release -p dlc-server        # Single binary serves everything

# Tests
cargo nextest run                          # Rust
cd web-ui && npx tsc --noEmit              # TypeScript
cd web-ui && npm run lint                  # ESLint
```

## Critical Files (understand before modifying)

- `web-ui/src/devices/capability.ts` — Core type system. Changes cascade everywhere.
- `web-ui/src/devices/registry.ts` — Device definitions + capability resolution.
- `web-ui/src/store/stageEditorStore.ts` — Complex undo/redo + history pause.
- `crates/dlc-protocol/src/lib.rs` — Wire protocol types. Changes require updating both Rust and TS.
