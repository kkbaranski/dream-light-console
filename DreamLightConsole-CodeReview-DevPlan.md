# DreamLightConsole — Code Review, Gap Analysis & Development Plan

## Part 1: Codebase Review

### What You've Built (and Built Well)

Your frontend is significantly more advanced than a "first version." Here's what exists:

**Capability System (devices/)** — This is the crown jewel. You've built a composable, data-driven device abstraction that rivals professional console architectures. Each device type is defined declaratively in `registry.ts` with capabilities (dimmer, pan, tilt, rgbColor, colorWheel, dualWhite, beam, transform, etc.) that are composed via `bind()`. Each capability self-describes its DMX channel layout, default state, model mutations, and inspector UI. The `activeCapabilities()` function resolves capabilities per mode with WeakMap caching. DMX channel validation runs at module load time. This is production-grade architecture — it directly supports the reference-based preset model from the architecture design.

**3D Stage Editor (components/stage/)** — Complete with: GLTF model loading and cloning, per-frame model mutation via `useFrame` + `applyToModel`, volumetric beam rendering with custom GLSL shaders (axial + angular falloff, additive blending, clipping planes), drag-and-drop fixture placement with floor raycasting, multi-object drag with group snapping and wall collision, selection wireframe overlay with bounding box, coordinate HUD with fade animation, copy/paste with auto-naming, undo/redo with history pause/resume for continuous drags, field locking per-object per-parameter, PBR material system for floor/wall with texture tiling.

**Inspector System (ObjectInspector + inspectorPrimitives)** — Multi-select aware with shared/mixed value display, lock-aware updates via `applyPatchRespectingLocks`, draggable number fields with pointer capture, full color picker with hex/RGB/presets tabs, mode switching per device. The `InspectorCtx` abstraction is clean and extensible.

**State Management** — Three zustand stores with clear separation: `stageEditorStore` (scene objects, selection, clipboard, undo history), `stagesStore` (stage list CRUD), `dmxStore` (DMX channels, connection status, WebSocket bindings). The history system with pause/resume is particularly well done.

**WebSocket Layer** — `useWebSocket` hook with RAF-throttled message coalescing (the `pendingRef` + `requestAnimationFrame` pattern), auto-reconnect, ping/pong latency measurement. This already implements the throttling pattern from the architecture doc.

**Python Backend (to be replaced)** — FastAPI with: DMX engine (40Hz loop, multi-universe buffers, mock output), WebSocket broadcast of universe state, REST CRUD for fixtures/scenes/universes, SQLite via SQLModel/aiosqlite. This gives us a clear contract for what the Rust backend must replicate.

### Architecture Gaps and Issues

**1. No InstancedMesh for beams** — Each beam is an individual `<mesh>` with its own `ShaderMaterial`. With 200 fixtures, this creates 200+ draw calls. The architecture plan calls for a single `InstancedMesh` for all beams. However, your custom GLSL shader approach (volumetric cone with axial/angular falloff) is superior to plain `ConeGeometry` — we should keep the shader but batch the geometry.

**2. Scene objects are client-only** — `stageEditorStore` holds all objects in memory with no persistence. The Python backend has `Fixture` and `Scene` SQLModel tables, but the frontend never calls those APIs for the stage editor. The bridge between the rich client-side capability model and server-side persistence is missing entirely.

**3. WebSocket protocol is JSON text** — The current protocol (`useWebSocket.ts`) sends JSON text messages and receives JSON universe updates. The architecture calls for binary WebSocket with a 1-byte type tag. The migration path is clear: the current JSON protocol works for development, binary is an optimization for later phases.

**4. DMX channel mapping is declared but unused** — Every capability declares `dmxChannels()` with offsets and encodings, and `validation.ts` checks for collisions — but nothing actually converts scene object state to DMX channel values. The "capability state → DMX buffer" pipeline doesn't exist yet.

**5. No multi-client awareness** — The WebSocket layer is single-client. No user identity, no lock protocol, no fader echo, no topic subscriptions. The Python backend broadcasts to all connected clients but doesn't track who changed what.

**6. Tauri remnants** — `src-tauri/` directory exists with a minimal Tauri config. Since we're moving to web console, this should be removed.

**7. `panTilt.tsx` exists alongside separate `pan.tsx` + `tilt.tsx`** — The registry uses the separate `pan` and `tilt` capabilities (correct), but `panTilt.tsx` is an unused combined capability file that should be removed to avoid confusion.

**8. BeamRenderer re-creates geometry on angle change** — `useMemo` depends on `coneAngleRad`, so every beam angle slider movement creates a new `CylinderGeometry`. This should use a ref-based approach that updates geometry without re-allocation.

**9. Stage editor state not linked to stages** — `stagesStore` creates stages with UUID + name, and `StageEditorPage` loads a stage by ID, but `stageEditorStore` is a global singleton — switching stages doesn't load/save different object sets.

**10. No TanStack Query** — REST calls use raw `fetch` via `api/client.ts`. The architecture recommends TanStack Query for caching, optimistic updates, and invalidation. This should be added when the Rust API is built.

---

## Part 2: Integration Notes

### Naming Conventions — Keep Yours
Your codebase uses consistent conventions that differ slightly from the architecture doc. We'll adopt yours:

| Aspect | Your Code | Architecture Doc | Decision |
|--------|-----------|-----------------|----------|
| Project name | DreamLightConsole | showctl | **Keep DreamLightConsole** |
| Scene objects | `SceneObject` with capabilities | `Fixture` with presets | **Keep your model** — it's richer |
| Device registry | `DEVICE_REGISTRY` | fixture_types table | **Keep registry** for client, sync to DB |
| Capability system | `CapabilityDef<T>` + `bind()` | Not in architecture | **Keep** — this is better than the plan |
| Store names | `useStageEditorStore` | N/A | **Keep** |
| DMX channel indexing | 0-based offsets in capabilities | 1-based in architecture tables | **Keep 0-based** — matches DMX wire format |
| WebSocket URL | `ws://127.0.0.1:8765/ws` | `ws://host:3000/ws` | **Change to :3000** when Rust server is built |

### Component Structure — Keep Yours, Extend
Your component hierarchy is well-organized. The architecture plan's phases should integrate into it:

```
src/
├── api/client.ts              ← KEEP, add TanStack Query wrappers
├── components/
│   ├── dmx/                   ← KEEP, extend with real-time binary WS
│   ├── layout/                ← KEEP
│   ├── stage/                 ← KEEP all of this (MaterialPanel, PlacedObject, etc.)
│   │   └── ObjectInspector    ← KEEP — already handles multi-select, locks, modes
│   └── ui/                    ← KEEP, add more primitives
├── devices/                   ← KEEP ENTIRE DIRECTORY — this is the core
│   ├── capabilities/          ← KEEP all 12 capabilities
│   ├── capability.ts          ← KEEP — the type system is solid
│   ├── registry.ts            ← KEEP — extend with GDTF-imported types
│   └── validation.ts          ← KEEP
├── hooks/                     ← KEEP useObjectDrag, upgrade useWebSocket
├── materials/                 ← KEEP
├── pages/                     ← KEEP, add CueListPage, ShowControlPage
├── scene/types.ts             ← KEEP
├── stages/registry.ts         ← KEEP
├── store/                     ← KEEP all 3 stores, add cueStore, connectionStore
└── types/index.ts             ← KEEP, will be supplemented by ts-rs generated types
```

### State Architecture — Hybrid Approach
The architecture doc assumes a fresh start. Your code has a well-functioning client-side state model. The integration approach:

- **`stageEditorStore`** stays as the live editing state (fast, in-memory, undo/redo)
- **Server persistence** is added via REST API calls on save/load (not real-time sync of every edit)
- **`dmxStore`** evolves to receive binary WebSocket DMX frames from the Rust engine
- **New `engineStore`** tracks engine state (running/paused/blind, active cue, BPM)
- **The capability system** becomes the shared vocabulary: Rust backend must understand `DmxChannelDef` to map scene objects → DMX output

### What Needs to Change

1. **`useWebSocket.ts`** — Rewrite to support binary messages. Keep the RAF coalescing pattern.
2. **`dmxStore.ts`** — Add `Float32Array` for DMX data (hot path), keep `number[]` for inspector display.
3. **`BeamRenderer`** — Refactor to avoid geometry re-creation on angle change.
4. **`api/client.ts`** — Add TanStack Query. Keep the raw `api` object for imperative calls.
5. **Remove**: `src-tauri/`, `backend/` (Python), `panTilt.tsx`, root `*.db` files, `main.py`, `pyproject.toml` (root), `uv.lock` (root).

---

## Part 3: Updated Development Plan

### Restructured for your existing codebase

Tasks marked ✅ are DONE, 🔶 are PARTIAL (your code covers some of it), and 🆕 are NEW.
Every task produces a verifiable artifact. Dependencies reference task numbers.

---

### Phase 0 — Project Restructure & Cleanup (Tasks 1–8)

| # | Status | Task | Verification | Depends |
|---|--------|------|-------------|---------|
| 1 | 🆕 | **Remove dead code**: Delete `backend/`, `src-tauri/`, root `main.py`, root `pyproject.toml`, root `uv.lock`, root `mise.toml`, all `*.db` files, `devices/capabilities/panTilt.tsx`. Remove panTilt export from `capabilities/index.ts`. | `find . -name '*.db'` returns nothing; `grep -r panTilt src/` returns nothing | — |
| 2 | 🆕 | **Init Cargo workspace**: Create `Cargo.toml` workspace with crates: `dlc-server` (Axum API+WS), `dlc-engine` (DMX logic), `dlc-protocol` (shared binary message types), `dlc-audio` (future audio analyzer). Each crate has a `src/lib.rs` or `src/main.rs` that compiles. | `cargo build --workspace` succeeds | 1 |
| 3 | 🆕 | **Create `CLAUDE.md`**: Project conventions doc covering: Rust naming (snake_case, no abbreviations), TypeScript naming (camelCase components, PascalCase types), directory structure, test commands, commit message format, which stores are reactive vs imperative. | File exists and is reviewed | 1 |
| 4 | 🆕 | **Move frontend**: Move `frontend/` to `web-ui/` (matches architecture doc). Update all import paths. Add `web-ui/dist/` to `.gitignore`. Configure Vite proxy to forward `/api/*` and `/ws` to `localhost:3000`. | `cd web-ui && npm run build` succeeds; `npm run dev` proxies to :3000 | 1 |
| 5 | 🆕 | **Add TanStack Query**: Install `@tanstack/react-query`. Create `QueryClientProvider` in `main.tsx`. Create typed hooks: `useStages()`, `useFixtureLibrary()`. Leave REST calls using existing `api/client.ts` underneath. | `npm run typecheck` passes; React DevTools shows QueryClient | 4 |
| 6 | 🆕 | **Define protocol crate types**: In `dlc-protocol`, define `WsClientMsg` and `WsServerMsg` enums matching binary wire format (0x01 FaderUpdate, 0x02 Go, 0x05 BatchFaders, 0x80 DmxPreview, etc.). Add `ts-rs` derive macros. Run `cargo test` to generate TS types. | `cargo test -p dlc-protocol` generates `bindings/*.ts`; types compile in TS | 2 |
| 7 | 🆕 | **Create Procfile.dev**: Overmind Procfile that starts `cargo run -p dlc-server` and `cd web-ui && npm run dev`. Document in README. | `overmind start -f Procfile.dev` launches both processes | 2, 4 |
| 8 | 🆕 | **CI setup**: GitHub Actions workflow: `cargo build --workspace`, `cargo nextest run`, `cd web-ui && npm ci && npm run build && npm run typecheck`. | Push to branch → green CI | 2, 4 |

---

### Phase 1 — Rust DMX Engine (Tasks 9–18)

| # | Status | Task | Verification | Depends |
|---|--------|------|-------------|---------|
| 9 | 🆕 | **`DmxUniverse` struct**: 512-byte array with `get(ch)`, `set(ch, val)`, `as_slice()`, `merge_htp(other)`, `merge_ltp(other, timestamp)`. Unit tests for all methods. | `cargo nextest run -p dlc-engine -E 'test(universe)'` | 2 |
| 10 | 🆕 | **`DmxOutput` trait + `MockOutput`**: Trait with `send_universe(id, &[u8; 512])`. `MockOutput` stores last sent frame for assertion. | `cargo nextest run -p dlc-engine -E 'test(output)'` | 9 |
| 11 | 🆕 | **sACN E1.31 output**: Struct implementing `DmxOutput`, sends UDP multicast to 239.255.0.{universe}. Includes universe sync packet. | `cargo run --example sacn_send` → packets visible in Wireshark or `sacn_recv` example | 10 |
| 12 | 🆕 | **Art-Net output**: Struct implementing `DmxOutput`, sends ArtDmx UDP unicast/broadcast. | `cargo run --example artnet_send` → packets captured by UDP listener | 10 |
| 13 | 🆕 | **Engine loop**: 44Hz fixed-rate loop. Receives commands via `mpsc::Receiver<EngineCommand>`. Calls `output.send_universe()` each tick. Commands: `SetChannel(universe, channel, value)`, `SetUniverse(universe, [u8;512])`, `Shutdown`. | `cargo nextest run -p dlc-engine -E 'test(engine_loop)'` — sends command, asserts output after 2 ticks | 9, 10 |
| 14 | 🆕 | **Linear interpolation**: When a channel value changes, ramp over N frames (configurable, default 3). `InterpolationState` tracks source/target/progress per channel. | `cargo nextest run -p dlc-engine -E 'test(interpolation)'` — set 0→255, verify intermediate frames | 13 |
| 15 | 🆕 | **HTP merge**: `OutputMerger` struct. Multiple sources feed values. Intensity channels use Highest Takes Precedence. | `cargo nextest run -p dlc-engine -E 'test(htp)'` — two sources, correct merge | 13 |
| 16 | 🆕 | **LTP merge**: Non-intensity channels use Latest Takes Precedence (by timestamp). Source attribution stored per channel: `{value, source_type, source_id}`. | `cargo nextest run -p dlc-engine -E 'test(ltp)'` | 13 |
| 17 | 🆕 | **Hold-last-look**: Engine continues outputting last known state when all command senders are dropped. Test: send values, drop sender, verify output continues for 10 ticks. | `cargo nextest run -p dlc-engine -E 'test(hold_last)'` | 13 |
| 18 | 🆕 | **Capability→DMX mapper**: Given a `SceneObject` JSON + `DeviceDef` JSON (matching your TS types), compute DMX channel values using the `dmxChannels()` encoding rules (linear8, linear16, rgbHex, step). This is the Rust equivalent of your `DmxChannelDef` + `DmxEncoding`. | `cargo nextest run -p dlc-engine -E 'test(capability_dmx)'` — moving_head object → correct 7-channel DMX output | 9, 6 |

---

### Phase 2 — Axum API Server (Tasks 19–28)

| # | Status | Task | Verification | Depends |
|---|--------|------|-------------|---------|
| 19 | 🆕 | **Axum skeleton**: Health check at `/health`, serve static files from `web-ui/dist/` at `/`, SPA fallback (all non-API/WS routes serve `index.html`). | `cargo run -p dlc-server & curl localhost:3000/health` returns `{"status":"ok"}` | 2 |
| 20 | 🆕 | **SQLite + sqlx migrations**: Tables: `shows`, `stages`, `stage_objects` (JSON blob per object), `fixture_library` (GDTF cache). Use sqlx with compile-time checked queries. | `cargo sqlx migrate run && sqlite3 dlc.db '.tables'` shows all tables | 19 |
| 21 | 🆕 | **REST: Shows CRUD**: GET/POST/PUT/DELETE `/api/shows`. JSON body matches TS types. | `curl -X POST localhost:3000/api/shows -d '{"name":"My Show"}'` → 201 + created show | 20 |
| 22 | 🆕 | **REST: Stages CRUD**: GET/POST/PUT/DELETE `/api/shows/:show_id/stages`. Each stage has name, floor/wall material IDs, tile sizes, stage model ID. | `curl localhost:3000/api/shows/1/stages` returns stages | 21 |
| 23 | 🆕 | **REST: Stage objects**: GET/PUT `/api/stages/:id/objects`. The GET returns all scene objects as JSON array. PUT replaces the entire array (save operation). Objects are stored as a JSON column — no need to normalize capabilities into SQL. | `curl localhost:3000/api/stages/1/objects` returns objects; PUT saves and GET returns same | 22 |
| 24 | 🆕 | **REST: Fixture library**: GET `/api/fixtures/library` returns all device types (mirrors your `DEVICE_REGISTRY`). POST to add custom types. Initial seed from a JSON file matching your registry format. | `curl localhost:3000/api/fixtures/library \| jq '.[].label'` shows Moving Head, Gobo, Fresnel… | 20 |
| 25 | 🆕 | **REST: Presets CRUD**: GET/POST/PUT/DELETE `/api/presets`. A preset stores: name, fixture_type, mode, capability values (JSON). | `curl localhost:3000/api/presets` returns presets | 20 |
| 26 | 🆕 | **REST: Cue lists + cues**: GET/POST/PUT/DELETE for cue lists and cues. Cue: number (decimal), trigger type, preset references, fade time. Cue list: ordered array of cues. | `curl localhost:3000/api/cuelists/1/cues` returns ordered cues | 20 |
| 27 | 🆕 | **CORS middleware**: Allow all LAN origins (`http://192.168.*`, `http://10.*`, `http://localhost:*`). | Browser on second laptop can fetch `http://192.168.x.x:3000/api/health` | 19 |
| 28 | 🆕 | **Wire engine into server**: `dlc-server` creates an `Engine`, spawns its loop on a dedicated thread, holds the `mpsc::Sender<EngineCommand>` in Axum shared state. REST endpoint `PUT /api/universes/:id/channels/:ch` sends `SetChannel` command. | `curl -X PUT localhost:3000/api/universes/1/channels/1 -d '{"value":255}'` → engine outputs to mock | 13, 19 |

---

### Phase 3 — WebSocket Real-Time Layer (Tasks 29–39)

| # | Status | Task | Verification | Depends |
|---|--------|------|-------------|---------|
| 29 | 🔶 | **WebSocket upgrade endpoint**: Axum handler at `/ws`. Accept connections, echo messages. Your existing `useWebSocket.ts` connects successfully (update URL to `:3000`). | `websocat ws://127.0.0.1:3000/ws` connects | 19 |
| 30 | 🆕 | **Binary message parser**: Parse 1-byte type tag, dispatch. Support both JSON (legacy, for debugging) and binary (production). Client sends binary, server responds binary. | `cargo nextest run -p dlc-server -E 'test(ws_parse)'` — parse FaderUpdate, Go, BatchFaders | 6, 29 |
| 31 | 🆕 | **Client registry + pub/sub**: `ClientRegistry` tracks connected clients. Each client subscribes to topics (`/dmx/1`, `/faders/front-wash`, `/cues/active`). Broadcasts go only to subscribed clients. | `cargo nextest run -p dlc-server -E 'test(pubsub)'` | 29 |
| 32 | 🆕 | **Fader→engine pipeline**: Binary FaderUpdate (0x01) and BatchFaders (0x05) messages from WS → parse → `EngineCommand::SetChannel` via mpsc. | `cargo nextest run -p dlc-server -E 'test(fader_pipeline)'` — send binary fader msg, verify engine received | 28, 30 |
| 33 | 🆕 | **DMX preview broadcast**: Engine emits DMX frames → server broadcasts 0x80 (full) or 0x81 (delta) to subscribed clients at 44Hz. Delta tracks previous frame, sends only changed channels. | Connect with `websocat`, subscribe to `/dmx/1`, verify binary frames arrive | 28, 31 |
| 34 | 🆕 | **GO button handler**: Binary GO (0x02) → advance cue list → fire cue → broadcast 0x83 CueFired to all clients. | Send GO via `websocat`, receive CueFired event | 26, 30, 32 |
| 35 | 🆕 | **State sync**: On connect or reconnect, client sends 0xF0 SyncRequest → server responds with 0x82 StateSnapshot (MessagePack: all fader positions, active cue, engine state). | `cargo nextest run -p dlc-server -E 'test(sync)'` | 31, 33 |
| 36 | 🆕 | **Entity locking**: 0x85 LockAcquire / 0x86 LockRelease. Server tracks locks per entity with 30s timeout. Broadcasts lock state to all clients. | `cargo nextest run -p dlc-server -E 'test(locking)'` | 31 |
| 37 | 🆕 | **User identity**: Assign `user_id` (u8) on WS connect. Include in fader echo messages so clients know who changed what. | Connect two `websocat` instances, verify different user_ids | 29 |
| 38 | 🆕 | **Heartbeat + dead client cleanup**: Server pings every 5s. If no pong within 8s, disconnect client, release their locks, clean up subscriptions. | Kill client abruptly → server logs cleanup within 8s | 31, 36 |
| 39 | 🆕 | **WS load test**: k6 script: 10 clients, each sends 60Hz fader updates, all receive DMX preview. Assert p99 < 50ms, 0 errors. | `k6 run tests/ws-load.js` passes | 33 |

---

### Phase 4 — Frontend: Connect to Rust Backend (Tasks 40–50)

| # | Status | Task | Verification | Depends |
|---|--------|------|-------------|---------|
| 40 | 🔶 | **Upgrade `useWebSocket`**: Rewrite to send/receive binary ArrayBuffer messages. Keep RAF coalescing. Add binary encoder for FaderUpdate/BatchFaders/Go. Add binary decoder for DmxPreview/CueFired/StateSnapshot. Keep JSON fallback for development. | Browser DevTools Network WS tab shows binary frames | 30 |
| 41 | 🔶 | **Upgrade `dmxStore`**: Add `dmxBuffers: Map<number, Uint8Array>` for binary DMX data (hot path). Keep `channels: number[]` for inspector display. Add `onDmxFrame(universe, data)` that updates the Uint8Array. | `npm run typecheck` passes | 40 |
| 42 | 🆕 | **Stage save/load**: `stageEditorStore.save()` calls `PUT /api/stages/:id/objects` with current objects array. `stageEditorStore.load(stageId)` calls GET and replaces objects. StageEditorPage calls load on mount. Auto-save on significant changes (debounced 2s). | Navigate to stage → objects load from server; edit → reload → changes persisted | 23, 5 |
| 43 | 🆕 | **Stages page with server data**: Replace `stagesStore` (client-only) with TanStack Query hooks calling `/api/shows/:id/stages`. Create/delete stages call the API. | Create stage → reload page → stage still there | 22, 5 |
| 44 | 🆕 | **Connection status upgrade**: Show user_id, connected operators count, ping latency. Use connection store. Green/yellow/red indicator already exists in TopBar — extend with operator count. | TopBar shows "2 operators · 3ms" when two browsers connected | 37, 40 |
| 45 | 🆕 | **Fader echo**: When operator A moves a fader, operator B's inspector slider reflects the change via 0x84 FaderEcho messages. Update `dmxStore` on echo receipt. | Open two browsers, move slider on one, other updates | 32, 40 |
| 46 | 🆕 | **Lock indicators in UI**: When an entity is locked by another operator, show lock icon + operator name. Disable edit controls for non-holder. Use existing `LockIcon` component from `inspectorPrimitives.tsx`. | Two browsers: lock fixture on A, B sees lock icon and can't edit | 36, 40 |
| 47 | 🆕 | **Cue list panel**: New component showing cue list with GO button, active cue highlight, fade progress bar. GO sends binary 0x02. Receives 0x83 CueFired to advance highlight. | Click GO → highlight advances; second browser sees same state | 34, 40 |
| 48 | 🆕 | **Topic subscriptions**: Frontend subscribes only to relevant DMX universes and fixture groups. Switching stage view changes subscriptions. Reduces bandwidth for clients showing subset of show. | Network tab: switching view changes subscription, data volume drops | 31, 40 |
| 49 | 🆕 | **Keyboard shortcuts**: Space=GO, Escape=STOP, Tab=next fixture, Ctrl+S=save stage. Your existing Ctrl+C/V/Z handlers in StageScene stay. Add global handler for show-control shortcuts. | Press Space → cue fires; Ctrl+S → stage saves | 42, 47 |
| 50 | 🆕 | **Error toasts**: Add toast notification system. Show on: API errors, WS disconnect, lock conflicts, save failures. Use a simple zustand toast store + fixed-position toast container. | Trigger error → toast appears and auto-dismisses | 4 |

---

### Phase 5 — 3D Visualizer Performance (Tasks 51–58)

These tasks upgrade your existing R3F code for production-scale performance.

| # | Status | Task | Verification | Depends |
|---|--------|------|-------------|---------|
| 51 | 🔶 | **Beam InstancedMesh**: Refactor `BeamRenderer` to use a single `InstancedMesh` for all beam cones. Keep your GLSL shader but move to `RawShaderMaterial` with instance attributes for color, opacity, position, rotation. Parent component `BeamManager` renders one InstancedMesh, updates all instances in a single `useFrame`. | Draw calls < 50 for 200 fixtures (Chrome DevTools Renderer tab) | 41 |
| 52 | 🆕 | **DMX-driven beam updates via getState**: In the `BeamManager` `useFrame`, read DMX data imperatively via `useDMXStore.getState().dmxBuffers.get(universe)`. Map channel values to beam color/intensity/angle. Zero React re-renders during live playback. | React DevTools Profiler shows 0 re-renders during 10s of DMX playback | 41, 51 |
| 53 | 🔶 | **Fix BeamRenderer geometry re-creation**: Replace `useMemo` keyed on `coneAngleRad` with a `useRef` + `useFrame` that updates the existing geometry's vertices when angle changes. Avoids GC pressure during slider drags. | Profile: no geometry allocations during beam angle slider drag | — |
| 54 | 🆕 | **LOD for fixture models**: Use drei `<Detailed>` at distances [0, 15, 30]. Generate low-poly placeholder (box) for distance > 30. | Add 200 fixtures, orbit far → draw calls stable < 50 | 4 |
| 55 | 🆕 | **PerformanceMonitor + adaptive DPR**: drei `<PerformanceMonitor>` scales DPR from 0.5→2.0 based on frame rate. Shows FPS counter in dev mode. | Add 200 fixtures → DPR drops; remove → DPR recovers | 4 |
| 56 | 🔶 | **Editor/live mode toggle**: Add toggle button. Editor mode: `frameloop="demand"`, TransformControls active, grid visible. Live mode: `frameloop="always"`, DMX-driven beams, no gizmos. Your existing code always uses `frameloop="always"` — the editor doesn't need continuous rendering. | Toggle to editor → canvas stops animating; toggle to live → beams animate | 52 |
| 57 | 🆕 | **Bloom post-processing**: Add `@react-three/postprocessing` `<Bloom>` effect for beam glow. Only in live mode (disabled in editor for performance). | Live mode: beams have soft glow halo | 56 |
| 58 | 🆕 | **Web Worker for binary DMX parsing**: Move binary WS message parsing to a Web Worker. Worker decodes binary → `postMessage` with `Transferable` Uint8Array → main thread calls `dmxStore.setState`. Keeps main thread frame time < 16ms. | Main thread frame time < 16ms with 200 fixtures at 44Hz updates | 41, 52 |

---

### Phase 6 — Cue Programming & Show Control (Tasks 59–66)

| # | Status | Task | Verification | Depends |
|---|--------|------|-------------|---------|
| 59 | 🆕 | **Preset recording**: "Record" button captures current fixture state (from inspector) as a preset. Saves via REST to `/api/presets`. Preset references a fixture type + mode + capability values. | Record preset → appears in preset list; recall → fixtures return to state | 25, 42 |
| 60 | 🆕 | **Cue programming UI**: In cue list panel, "Record Cue" captures current look as a cue. Cue stores: preset references, fade up/down times, follow trigger. Cue number supports decimal (e.g., 5.5). | Record cue → appears in list with correct number and timing | 26, 59 |
| 61 | 🆕 | **Cue playback engine (Rust)**: Engine processes cue fire commands. Resolves preset references → DMX values. Applies fade timing (linear interpolation over N frames). Tracks active cue per cue list. | `cargo nextest run -p dlc-engine -E 'test(cue_playback)'` — fire cue, verify fade | 14, 18 |
| 62 | 🆕 | **Tracking mode**: Cue processor implements tracking (values persist cue-to-cue until changed). Three modes: Tracking (default), Cue-Only, Assert. Configurable per cue list. | `cargo nextest run -p dlc-engine -E 'test(tracking)'` — cue 1 sets ch1=255, cue 2 sets ch2=128, ch1 stays 255 | 61 |
| 63 | 🆕 | **Submaster faders**: Virtual faders that proportionally scale a group of fixtures' intensity. UI: horizontal fader strip below cue list. Each submaster has a name and fixture group. | Create submaster for "Front Wash", drag fader → those fixtures dim proportionally | 15, 47 |
| 64 | 🆕 | **Effect engine (chase)**: Repeating sequence of states (e.g., fixtures chase left-to-right). Rate in BPM or manual tap tempo. Phase offset per fixture for wave effects. | Create 8-step chase, assign to 8 fixtures → lights sequence in order | 13 |
| 65 | 🆕 | **Show program / setlist**: Create ordered list of songs. Each song links to a cue list. "Next Song" advances to next cue list. | Create 3-song setlist → Next Song advances through them | 26, 47 |
| 66 | 🆕 | **Blind/preview mode**: Engine state machine includes BLIND mode. In blind, engine computes DMX output but sends only to 3D visualizer (no sACN/Art-Net). Operator can preview cues without affecting live output. | Toggle blind → 3D shows cue preview, physical lights unchanged | 56, 61 |

---

### Phase 7 — Audio Analysis (Tasks 67–72)

| # | Status | Task | Verification | Depends |
|---|--------|------|-------------|---------|
| 67 | 🆕 | **Audio capture crate**: `dlc-audio` binary. Opens USB audio device via `cpal`, captures PCM at 44.1kHz, prints RMS levels to stdout. | `cargo run -p dlc-audio` with music → levels print | 2 |
| 68 | 🆕 | **Beat detection**: FFT via `rustfft`, onset detection, BPM estimation. Outputs beat events via UDP to engine. | Play 120 BPM track → output reads 118–122 BPM | 67 |
| 69 | 🆕 | **Audio→engine→UI pipeline**: Beat events arrive in engine → engine exposes beat state → WS broadcasts to clients → UI shows beat indicator. | UI shows flashing beat dot synced to music | 68, 33 |
| 70 | 🆕 | **BPM-synced chase**: Chase effect rate locks to detected BPM. Falls back to manual rate if audio disconnected. | Chase follows music tempo; stop music → chase holds last rate | 64, 69 |
| 71 | 🆕 | **Audio-reactive effects**: Intensity follows bass RMS, color follows spectral centroid. Configurable sensitivity and mapping curves. | Fixtures pulse with bass, shift color with frequency | 69, 64 |
| 72 | 🆕 | **Audio settings UI**: Device selector (dropdown of available inputs), gain slider, BPM display, beat indicator, effect assignment panel. | Select different audio device → beat detection switches input | 69 |

---

### Phase 8 — Polish & Deployment (Tasks 73–80)

| # | Status | Task | Verification | Depends |
|---|--------|------|-------------|---------|
| 73 | 🆕 | **GDTF import**: Parse GDTF file (ZIP with XML), extract channels/modes, convert to `DeviceDef` format, add to fixture library. | Import Martin MAC Aura GDTF → available in fixture catalog | 24, 18 |
| 74 | 🆕 | **Show file export/import**: Export: bundle SQLite DB + assets into `.dlcshow` ZIP. Import: extract and load. Round-trip without data loss. | Export → delete → import → all data intact | 21–26 |
| 75 | 🆕 | **Performance optimization pass**: Profile with Chrome DevTools. Fix any frame drops. Target: 60fps with 200 fixtures in live mode, < 16ms frame time. | Chrome Performance tab: no frames > 16ms for 30s | 51–58 |
| 76 | 🆕 | **Error handling pass**: All REST endpoints return proper error codes. WS errors don't crash server. Malformed messages logged and ignored. UI shows toast on all errors. | Send malformed requests → proper error responses, no crashes | All |
| 77 | 🆕 | **Release binary**: `cargo build --release` produces single binary. Binary serves web UI, handles REST + WS, outputs DMX. Startup banner with version, port, detected DMX interfaces. | `./dlc-server` prints banner, browser connects, full functionality | All |
| 78 | 🆕 | **Documentation**: Setup guide (install, first run, network config for multi-laptop), fixture patching workflow, cue programming tutorial, keyboard shortcuts reference. | Docs in `docs/` cover all workflows | All |
| 79 | 🆕 | **E2E integration test**: Start server, connect 3 Playwright browsers, patch 50 fixtures via drag-and-drop, create cue list, fire GO on all 3 clients, verify DMX output via sACN listener. | `./tests/e2e-full.sh` passes | All |
| 80 | 🆕 | **Multi-platform build**: GitHub Actions builds release binaries for macOS (arm64 + x86_64), Linux (x86_64), Windows (x86_64). Each includes pre-built web-ui. | All 4 binaries downloadable from GitHub Releases | 77 |

---

## Part 4: Task Prioritization for AI Agents

### Recommended execution order (critical path)

**Sprint 1 (Foundation)**: Tasks 1→2→3→4→5→6→7→8 (parallel: 1-4 can be one session)

**Sprint 2 (Engine + API, parallelizable)**:
- Agent A: 9→10→13→14→15→16→17→18 (Rust engine, no frontend needed)
- Agent B: 19→20→21→22→23→24→25→26→27→28 (Rust API, no frontend needed)

**Sprint 3 (WebSocket bridge)**: 29→30→31→32→33→34→35→36→37→38→39

**Sprint 4 (Frontend integration)**: 40→41→42→43→44→45→46→47→48→49→50

**Sprint 5 (3D performance)**: 51→52→53→54→55→56→57→58

**Sprint 6 (Show control)**: 59→60→61→62→63→64→65→66

**Sprint 7 (Audio + Polish)**: 67–80

### Task card format for AI agents

Each task should be given to an AI coding agent as:

```markdown
# Task XX: [Title]

## Context
- Project: DreamLightConsole — web-based DMX lighting console
- This crate/module: [specific location]
- Read CLAUDE.md first for conventions

## What exists
- [List relevant existing files the agent should read first]

## What to build
- [Specific deliverable]

## Acceptance criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Verification commands
- `cargo nextest run -p dlc-engine -E 'test(universe)'`
- `curl localhost:3000/api/health`

## Do NOT modify
- [Files that should remain unchanged]
```
