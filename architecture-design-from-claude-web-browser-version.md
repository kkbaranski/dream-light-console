# Web-based stage control system architecture

**A professional show control system built as a Rust-powered web console — not a desktop app — where all backend services run natively on localhost and any browser on the network becomes a fully functional control surface.** This architecture replaces the original Tauri design with a multi-laptop-capable web UI backed by a single authoritative Rust engine. The system outputs DMX lighting data via sACN/Art-Net at 44Hz, captures audio for beat detection, and renders a real-time 3D stage visualizer in React Three Fiber. Every design decision below optimizes for the singular requirement that **when an operator moves a fader, physical lights must respond within one DMX frame (~23ms)**.

---

## 1. System architecture overview

The system comprises three native Rust processes managed by Overmind, a React+R3F web frontend served as static files, and a binary WebSocket protocol connecting them. No Docker. No reverse proxy. No unnecessary abstraction layers.

```
┌─────────────────────────────────────────────────────────────────┐
│                    BROWSER CLIENTS (any laptop on LAN)          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ React + R3F  │  │ React + R3F  │  │ React + R3F  │          │
│  │ 3D Visualizer│  │ Cue Control  │  │ Monitoring   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │ WS (binary)      │ WS (binary)     │ WS (binary)     │
└─────────┼──────────────────┼─────────────────┼─────────────────┘
          │                  │                 │
          ▼                  ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  RUST API SERVER (Axum) — Port 3000                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ REST API     │  │ WebSocket    │  │ Static File Server   │  │
│  │ (CRUD)       │  │ Hub          │  │ (React app)          │  │
│  │ JSON         │  │ Binary proto │  │                      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘  │
│         │                 │                                     │
│         ▼                 ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Show State (in-memory + SQLite persistence)            │   │
│  │  Stages, fixtures, presets, cue lists, song metadata    │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ mpsc channels (in-process)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  RUST DMX ENGINE — (library, same process or separate)          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ 44Hz Output  │  │ Crossfade &  │  │ HTP/LTP Merge        │  │
│  │ Loop         │  │ Interpolation│  │ (multi-operator)      │  │
│  └──────┬───────┘  └──────────────┘  └──────────────────────┘  │
│         │                                                       │
│         ├──── sACN E1.31 (UDP multicast 239.255.x.x)           │
│         ├──── Art-Net (UDP broadcast/unicast)                   │
│         └──── USB Serial (ENTTEC DMX USB Pro /dev/ttyUSB0)     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  RUST AUDIO ANALYZER — Separate process                         │
│  ┌──────────────┐  ┌──────────────┐                             │
│  │ USB Audio    │  │ Beat/BPM     │──→ Engine via UDP/IPC       │
│  │ Capture      │  │ Detection    │                             │
│  └──────────────┘  └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

**The single Axum binary serves everything**: REST API, WebSocket hub, and static frontend files. This eliminates the need for nginx/traefik. The DMX engine runs as a library within the same process (fastest path via mpsc channels) or as a separate process communicating over localhost UDP. The audio analyzer runs as a separate process because it requires independent audio device access.

### Process management with Overmind

All services start via a single `Procfile`:

```
api:    cargo run --release --bin showctl-server
audio:  cargo run --release --bin audio-analyzer
```

Overmind provides individual process restart (`overmind restart api`), interactive debugging (`overmind connect api`), and graceful shutdown — everything Docker Compose offers for development, without the overhead.

---

## 2. Why native processes, not Docker

**Docker is unsuitable for this system's core requirements.** After researching Docker's handling of UDP multicast, USB devices, audio capture, and Rust build performance, the evidence overwhelmingly favors native processes.

The three hardest requirements — **sACN UDP multicast output, USB DMX interface access, and USB audio capture** — all break or degrade significantly in Docker containers. sACN uses multicast groups in the 239.255.x.x range; Docker's bridge networking does not route IGMP packets, forcing `--network=host` mode which negates Docker's primary networking benefit. USB passthrough is reliable only on Linux (`--device /dev/ttyUSB0`); on macOS, Docker Desktop runs inside a LinuxKit VM that blocks direct USB access entirely, with experimental USB/IP support described as "early days with caveats" even in Docker Desktop 4.35. Audio capture via PulseAudio socket sharing works on Linux but requires complex configuration; on macOS it is not viable at all.

Performance overhead is the secondary concern. On Linux, Docker adds **~5µs network latency** (negligible for DMX's 23ms frame time) and near-zero CPU overhead. But on macOS — where most show control development happens — the VM layer adds unpredictable jitter and **2-3x filesystem I/O overhead** with bind mounts. Rust compile times in Docker are **2-30x slower** than native due to this filesystem penalty, with one developer reporting 1-minute rebuilds in Docker versus 2-second rebuilds natively.

**No professional lighting control software uses Docker for its core engine.** QLC+, grandMA3, ETC Eos, Lightkey, and Lightjams all run as native applications with direct hardware access. This is the established industry pattern.

| Requirement | Docker | Native |
|---|---|---|
| sACN UDP multicast | Requires `--network=host`, known issues | Direct, zero config |
| USB DMX passthrough | Linux only; broken on macOS | Works everywhere |
| Audio capture | Linux: complex setup; macOS: not viable | Direct device access |
| Rust rebuild time | 30-60s+ (macOS bind mount penalty) | 2-5s incremental |
| Network latency | ~5µs Linux, unpredictable macOS | Zero overhead |

**Recommendation: Native processes for all services.** Use Docker only for ancillary infrastructure (database if needed) or for building release artifacts for deployment.

---

## 3. Communication protocol design

The system uses two communication layers: **REST for CRUD** (stages, presets, fixtures, songs) and **binary WebSocket for real-time control** (faders, GO buttons, DMX preview). Both run on the same Axum server, same port.

### REST API for CRUD operations

Axum with `serde` handles all configuration and show-data operations. GraphQL was considered but rejected — show control queries are predictable (not ad-hoc like a public API), making GraphQL's flexibility unnecessary overhead. tRPC is TypeScript-only; its Rust equivalent `rspc` exists but has limited maintenance (last npm publish ~2 years ago). REST is the simplest, most mature option.

Type safety across the Rust/TypeScript boundary is achieved with **`ts-rs`** or **`specta`**, which generate TypeScript types directly from Rust structs annotated with `#[derive(TS)]`. The frontend uses **TanStack Query** for REST data fetching with automatic caching, invalidation, and optimistic updates.

```
REST Endpoints (JSON):
  GET    /api/shows                    — List shows
  GET    /api/shows/:id/stages         — Get stages for a show
  POST   /api/stages                   — Create stage
  PUT    /api/stages/:id               — Update stage
  GET    /api/fixtures/library         — Fixture type library
  POST   /api/stages/:id/fixtures      — Add fixture to stage
  PUT    /api/presets/:id              — Update preset
  GET    /api/cuelists/:id            — Get cue list
  POST   /api/cuelists/:id/cues       — Add cue
```

### Binary WebSocket protocol for real-time control

A single WebSocket connection per client handles all real-time bidirectional communication. The protocol uses **raw binary messages** with a 1-byte type tag header. This is not premature optimization — at **44Hz × 512 channels**, binary encoding keeps bandwidth under **30 KB/s total** versus ~150 KB/s for JSON, and eliminates serialization/deserialization overhead on the hot path.

WebSocket throughput is not a concern. Benchmarks show a single Rust+Tokio WebSocket connection handles tens of thousands of messages per second. The system's peak demand — 10 simultaneous faders batched into one message at 60Hz — produces **60 messages/sec**, approximately **0.003%** of available capacity.

**Message format specification:**

```
All messages: [1 byte msg_type] [payload...]
Little-endian byte order throughout.

CLIENT → SERVER:
  0x01  Fader Update     [fixture_id: u16] [param: u8] [value: u16]        = 6 bytes
  0x02  GO Button        [cue_id: u16]                                      = 3 bytes
  0x03  STOP             (no payload)                                       = 1 byte
  0x05  Batch Faders     [count: u8] [fixture_id: u16, param: u8, value: u16] × count
  0x10  Subscribe        [topic_id: u16]                                    = 3 bytes
  0x11  Unsubscribe      [topic_id: u16]                                    = 3 bytes
  0xF0  Sync Request     [last_seq: u32]                                    = 5 bytes

SERVER → CLIENT:
  0x80  DMX Preview      [universe: u8] [512 bytes: channel values]         = 514 bytes
  0x81  DMX Delta        [count: u16] [channel: u16, value: u8] × count
  0x82  State Snapshot   [MessagePack-encoded full state]
  0x83  Cue Fired        [cue_id: u16] [timestamp: u64]                    = 11 bytes
  0x84  Fader Echo       [fixture_id: u16] [param: u8] [value: u16]        = 6 bytes
  0x85  Lock Acquired    [entity_type: u8] [entity_id: u16] [user_id: u8]
  0x86  Lock Released    [entity_type: u8] [entity_id: u16]
  0xFF  Error            [MessagePack-encoded error object]
```

**Bandwidth budget** for the entire real-time layer:

| Message | Size | Rate | Bandwidth |
|---|---|---|---|
| Batch fader update (10 faders) | 52 B | 60/sec | 3.1 KB/s |
| DMX preview (1 universe, full) | 514 B | 44/sec | 22.6 KB/s |
| DMX preview (delta, typical) | ~30 B | 44/sec | 1.3 KB/s |
| Cue/state events | variable | occasional | <1 KB/s |
| **Total per client** | | | **<30 KB/s** |

This is negligible — less bandwidth than a low-quality audio stream, comfortable even on congested WiFi.

### Client-side fader throttling

Browser `input` events on range sliders fire at **120-240Hz** on high-refresh displays. The client coalesces all pending fader changes into a single batched WebSocket message per animation frame using `requestAnimationFrame`:

```javascript
let dirtyFaders = new Map();  // faderId → value
let rafScheduled = false;

function onFaderInput(faderId, paramId, value) {
  dirtyFaders.set(`${faderId}:${paramId}`, { faderId, paramId, value });
  if (!rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(() => {
      if (dirtyFaders.size > 0) {
        ws.send(encodeBatchFaders(dirtyFaders));  // Single binary message
        dirtyFaders.clear();
      }
      rafScheduled = false;
    });
  }
}
```

This naturally throttles to **60Hz** (display refresh rate), batches all active faders into one message, and pauses when the tab is backgrounded. Ten simultaneous faders produce **52 bytes at 60Hz = 3.1 KB/s** instead of 600 individual messages.

### Server-side interpolation for smooth output

The DMX engine applies **linear interpolation** between received fader values to eliminate visible stepping on lights. When a fader jumps from 0 to 255 in one message, the engine ramps over 2-3 DMX frames (~50-70ms). This matches how professional consoles (ETC Eos, grandMA3) handle parameter smoothing — crossfade timing is always applied server-side, never client-side.

### WebSocket resilience and hold-last-look

**The DMX engine loop runs independently of WebSocket connections.** This is the most critical architectural decision. If every browser disconnects, the engine continues outputting the last known DMX state at 44Hz — lights stay on, the show continues. WebSocket connections are control surfaces, not the engine itself.

```rust
// Engine loop — always running, independent of WebSocket state
loop {
    while let Ok(update) = control_rx.try_recv() {
        apply_update(&mut dmx_state, update);
    }
    interpolate_faders(&mut dmx_state, delta_time);
    sacn_output.send(&dmx_state)?;
    tokio::time::sleep(Duration::from_millis(23)).await;  // ~44Hz
}
```

Reconnection uses show-critical backoff: **100ms initial retry** (not the standard 1s — the operator needs control back immediately), **5s maximum delay**, infinite retries. On reconnect, the client sends a sync request and receives a full state snapshot before resuming incremental updates. A prominent connection-status indicator (green/yellow/red) keeps the operator informed.

---

## 4. Multi-client concurrency strategy

Multiple operators on different laptops connect via browser to the same Rust backend. The concurrency model uses a **hybrid approach**: last-write-wins for real-time values, pessimistic locking for structured edits, and the engine as the single authoritative source of truth.

### Why not CRDTs or Operational Transformation

OT was designed for character-by-character text editing and requires writing correct transformation functions for every operation-pair combination — extremely complex and a poor fit for show control's coarse-grained operations (set fader to 80%, update cue timing). CRDTs (Automerge, Yrs) guarantee eventual consistency but add unnecessary complexity when **the server is always available** and acts as the single authority. CRDTs shine in peer-to-peer or offline-first scenarios; this system is neither.

Mature Rust CRDT libraries exist — **Yrs** (Rust port of Yjs) has `yrs-axum` integration, and **Automerge 3** has a Rust core with WASM bindings. These remain available if collaborative text editing is needed later (e.g., cue notes), but they are not the right tool for show state synchronization.

### Real-time values: authoritative server with LTP/HTP

For fader movements and live DMX control, the system borrows from **game networking's authoritative server pattern** (Valve Source Engine, Gabriel Gambetta's client-server architecture):

1. **Client sends intent** ("set fixture 5 intensity to 200"), not state
2. **Engine validates and applies** (checks permissions, applies HTP/LTP rules, enforces parameter limits)
3. **Engine broadcasts new state** to all subscribed clients
4. **Optional client-side prediction**: On LAN with 1-5ms round-trip, this is usually unnecessary — the server confirmation arrives fast enough to feel instantaneous

When two operators move the same fader simultaneously, the engine applies **LTP (Latest Takes Precedence)** by default, with **HTP (Highest Takes Precedence)** available for intensity channels (standard in professional lighting). Both clients immediately see the winning value, and a visual indicator shows which operator last touched each control.

### Structured edits: pessimistic locking

For multi-step edits (editing a cue's parameters, rearranging a cue list, patching fixtures), the system uses **pessimistic locking per entity**. When an operator starts editing Cue 5, other operators see "Cue 5 — editing by Operator B" with a lock icon. The lock has a **30-second inactivity timeout** and releases on save, cancel, or disconnect.

This mirrors how professional consoles handle multi-user operation. grandMA3's multi-user mode gives each user their own programmer (independent working space) with session-level collision resolution. ETC Eos uses a Primary/Backup/Client architecture where one console is authoritative. The common principle: **separate working spaces that merge at the output**.

### Topic-based pub/sub for state distribution

Each WebSocket client subscribes to topics matching their current view:

```
/dmx/{universe}        — Live DMX output (44Hz binary frames)
/faders/{group}        — Fader positions for a fixture group
/cues/active           — Currently active cue + progress
/programmer/{user_id}  — Per-user programmer state
/show/metadata         — Show-level changes (event-driven)
```

A client showing only the fader view for "Front Wash" subscribes to `/faders/front-wash` and `/cues/active` — it never receives DMX data for universes it isn't visualizing. The 3D visualizer subscribes to `/dmx/1`, `/dmx/2`, etc. for the universes it renders. This **reduces per-client bandwidth by 60-90%** compared to broadcasting everything.

Implementation uses Tokio broadcast channels per topic — a `HashMap<Topic, broadcast::Sender<Bytes>>` in the server state. When a client subscribes, it receives a `broadcast::Receiver` for that topic. When the engine updates a universe, it sends to the corresponding broadcast channel, and all subscribed clients receive the message with zero copying.

---

## 5. React Three Fiber architecture for the 3D stage visualizer

The 3D stage editor and live DMX visualizer must update **200+ light fixture visuals at 30-44fps** from WebSocket data without triggering React re-renders. This requires a specific architecture: **zustand store with imperative `getState()` reads inside `useFrame`**, raw Three.js `InstancedMesh` for beams, and a Web Worker for DMX data parsing.

### Zero-rerender data pipeline

The R3F documentation is explicit: **never use `setState` inside `useFrame`**. The `useFrame` hook runs outside React's reconciliation cycle, directly before each Three.js render. The correct pattern reads from zustand imperatively:

```
WebSocket (binary) → zustand.setState({ dmxChannels }) → useFrame reads getState() → mutates InstancedMesh refs
```

The zustand store holds DMX channel data as a `Float32Array`. The WebSocket `onmessage` handler calls `setState` (synchronous, fast). Inside `useFrame`, the beam component calls `useDMXStore.getState()` — which **bypasses React's subscription system entirely** — reads the channel values, and directly mutates Three.js objects via refs. React never knows the data changed. Zero re-renders, 60fps maintained.

For the editor UI panels (inspector, fixture list, cue list), standard reactive zustand subscriptions with selectors trigger normal React re-renders. These panels update at event-driven rates (user actions), not 44Hz, so re-renders are infrequent and cheap.

### InstancedMesh for 200+ light beams

All beam cones render in a **single draw call** using `THREE.InstancedMesh`. Without instancing, 200 individual mesh objects produce 200 draw calls and drop below 60fps. With instancing, even 100,000 instances maintain smooth framerates.

Each beam is a `ConeGeometry` (radius-top=0, open-ended) with additive blending and transparency — a "fake volumetric" effect that is visually convincing and computationally trivial. The alternative — raymarched volumetric lighting — would be prohibitively expensive for 200+ beams.

Inside `useFrame`, the component iterates all fixtures, reads their DMX channel values from the zustand store, computes position/rotation/scale from pan/tilt/zoom channels, and updates the instance matrix and color. Pre-allocated temporary objects (`THREE.Object3D`, `THREE.Color`) outside the component prevent garbage collection pressure.

**Draw call budget for the entire scene:**

- Beam cones: **1 draw call** (InstancedMesh)
- Fixture bodies: **1-5 draw calls** (InstancedMesh per fixture type)
- Stage geometry: 5-20 draw calls
- Truss/rigging: 5-10 draw calls
- **Total: ~30-50 draw calls** (well under R3F's recommended maximum of 1000)

### Essential drei utilities

The stage editor uses these drei components:

- **`TransformControls`** with `makeDefault` on `OrbitControls` for automatic conflict resolution (orbit disabled while gizmo is active) — modes: translate, rotate, scale for fixture positioning
- **`Grid`** with `infiniteGrid` for the stage floor reference plane
- **`Html`** with `occlude` and `distanceFactor` for fixture labels and DMX address overlays
- **`Detailed`** (LOD) at distances [0, 15, 30] for fixture 3D models — improves frame rates by 30-40% in large scenes
- **`PerformanceMonitor`** with adaptive DPR scaling for broad hardware support
- **`GizmoHelper` + `GizmoViewport`** for 3D navigation cube
- **`Select`** for multi-fixture selection in the editor
- **`BakeShadows`** for static stage geometry shadows
- **`Environment`** preset="warehouse" for realistic stage ambient lighting

### Editor mode vs. live mode

The canvas switches between `frameloop="demand"` (editor — renders only when something changes) and `frameloop="always"` (live — continuous rendering for DMX visualization). Editor mode adds TransformControls, fixture labels, grid, and gizmo. Live mode adds the DMX receiver component that feeds the beam InstancedMesh. This separation keeps editor interactions snappy (no wasted frames when idle) while live visualization runs at full framerate.

---

## 6. Lessons from existing professional tools

No production-grade, fully web-based DMX lighting console exists. This system would be genuinely novel. The closest references are:

**QLC+** serves a web interface on port 9999 using a custom WebSocket protocol (`ws://[IP]:9999/qlcplusWS`) with text-based commands (`QLC+API|command|param1|param2`). It demonstrates web-based DMX control is viable but is limited to remote-controlling a running instance — no collaborative editing.

**Bitfocus Companion** is the most architecturally relevant reference: a Node.js monorepo with React web UI communicating via tRPC + WebSocket, supporting 500+ device control modules each running in its own child process. It proves the "central server + WebSocket browser clients + modular device control" pattern at production scale.

**grandMA3** multi-user sessions share a show file over MA-Net3, with each user having their own programmer and output merging via HTP. WiFi is explicitly prohibited for session data — wired Ethernet only. Maximum 32 sessions per network. The web remote (port 8080) is limited to monitoring, not full editing.

**ETC Eos** uses Primary/Backup/Client architecture where one console is authoritative and others synchronize. This validates the authoritative-server model this system uses.

**ASLS Studio** (open-source, GitHub) is the only web-based DMX visualizer using Three.js with universe patching, fixture grouping, and scene generation. It uses WebRTC data channels (unusual) and Vue.js. Beta quality, but demonstrates the full concept works.

**Open Lighting Architecture (OLA)** provides a C++ daemon with a plugin system for Art-Net, sACN, USB devices, and a web interface on port 9090 with a JSON REST API. Its architecture — daemon + protocol plugins + web UI — directly parallels this system's design. OLA is a DMX distribution layer, not a control application; cues, presets, and show files would be built on top.

In Rust, **demex** (265 commits, MIT license) implements a command-based DMX control app with EGUI and GDTF support, and **rust_dmx** provides a DMX port abstraction crate. No Rust project combines web UI + 3D visualization + show control.

---

## 7. Development plan: 80 tasks across 8 phases

Each task is designed for completion by an AI coding agent (Cursor, Claude Code, Aider) in a single session. Tasks produce a verifiable artifact, list dependencies, and include specific verification commands. The project uses a `CLAUDE.md` at the repository root with conventions, and each task gets a markdown file in `.ai/tasks/`.

**Task description format:**
```markdown
# Task XX: [Title]
## Depends on: Task(s) N
## Description: [What to build]
## Acceptance criteria:
- [ ] Specific verifiable outcome
## Verification:
- `command to run`
```

### Phase 0 — Project scaffolding (Tasks 1-6)

| # | Task | Artifact | Verification | Depends |
|---|---|---|---|---|
| 1 | Initialize Cargo workspace with `showctl-server`, `dmx-engine`, `audio-analyzer` crates | `cargo build` succeeds | `cargo build --workspace` | — |
| 2 | Initialize React+Vite+TypeScript project in `web-ui/` with R3F, drei, zustand | `npm run build` succeeds | `npm run build && ls dist/index.html` | — |
| 3 | Create `CLAUDE.md` with project conventions: Rust style, TS style, naming, directory structure, test commands | File exists, validated by review | `cat CLAUDE.md` | — |
| 4 | Define shared types: `WebSocketMessage` enum in Rust (`showctl-protocol` crate), generate TS types with `ts-rs` | Types compile in both Rust and TS | `cargo test -p showctl-protocol && npm run typecheck` | 1 |
| 5 | Set up cargo-nextest config (`.config/nextest.toml`), GitHub Actions CI for Rust tests + npm tests + Playwright | CI pipeline green | Push to branch, check Actions | 1, 2 |
| 6 | Create `Procfile` for Overmind with `api` and `audio` processes, document dev setup in README | `overmind start` launches both | `overmind start -f Procfile.dev` | 1 |

### Phase 1 — DMX engine core logic (Tasks 7-16)

| # | Task | Artifact | Verification | Depends |
|---|---|---|---|---|
| 7 | Implement `DmxUniverse` struct: 512-channel byte array with get/set/fade methods | Unit tests pass | `cargo nextest run -p dmx-engine -E 'test(universe)'` | 1 |
| 8 | Implement `DmxOutput` trait with `send_universe(&self, universe: u16, data: &[u8; 512])` | Trait compiles, mock impl passes test | `cargo nextest run -p dmx-engine -E 'test(output)'` | 7 |
| 9 | Implement `MockDmxOutput` using mockall for test capture of sent DMX frames | Mock captures and asserts frame content | `cargo nextest run -p dmx-engine -E 'test(mock)'` | 8 |
| 10 | Implement sACN E1.31 output adapter (struct implementing `DmxOutput`, sends UDP multicast) | sACN packets visible in Wireshark/listener | `cargo run --example sacn_send & cargo run --example sacn_listen` | 8 |
| 11 | Implement Art-Net output adapter (struct implementing `DmxOutput`, sends UDP unicast/broadcast) | Art-Net packets captured by UDP listener | `cargo run --example artnet_send & cargo run --example udp_listen` | 8 |
| 12 | Implement engine loop: 44Hz tick, reads commands from mpsc channel, outputs DMX via trait object | Loop runs at stable 44Hz, responds to commands | `cargo nextest run -p dmx-engine -E 'test(engine_loop)'` | 7, 8 |
| 13 | Implement linear interpolation/crossfade: when parameter changes, ramp over N frames | Fade from 0→255 over 5 frames verified | `cargo nextest run -p dmx-engine -E 'test(interpolation)'` | 12 |
| 14 | Implement HTP (Highest Takes Precedence) merge for intensity channels across multiple sources | Two sources, HTP merge correct | `cargo nextest run -p dmx-engine -E 'test(htp)'` | 12 |
| 15 | Implement LTP (Latest Takes Precedence) merge for color/position channels | Two sources, LTP with timestamp wins | `cargo nextest run -p dmx-engine -E 'test(ltp)'` | 12 |
| 16 | Implement hold-last-look: engine continues outputting after all control sources disconnect | Engine output stable after channel close | `cargo nextest run -p dmx-engine -E 'test(hold_last_look)'` | 12 |

### Phase 2 — Axum API server foundation (Tasks 17-25)

| # | Task | Artifact | Verification | Depends |
|---|---|---|---|---|
| 17 | Set up Axum server skeleton: health check endpoint, static file serving from `web-ui/dist/` | Server starts, serves health and static | `cargo run -p showctl-server & curl localhost:3000/health` | 1, 2 |
| 18 | Set up SQLite with sqlx: migrations for `shows`, `stages`, `fixtures`, `presets`, `cuelists`, `cues` tables | Migrations run, tables created | `cargo sqlx migrate run && sqlite3 showctl.db ".tables"` | 17 |
| 19 | Implement REST CRUD for shows: GET/POST/PUT/DELETE `/api/shows` | All CRUD operations work | `curl -X POST localhost:3000/api/shows -d '{"name":"test"}'` then GET | 18 |
| 20 | Implement REST CRUD for stages: GET/POST/PUT/DELETE `/api/shows/:id/stages` with fixture positions | Stages CRUD verified | `curl localhost:3000/api/shows/1/stages` | 19 |
| 21 | Implement REST CRUD for fixture library: GET `/api/fixtures/library`, POST to add custom types | Fixture library populated and queryable | `curl localhost:3000/api/fixtures/library \| jq '.[] \| .name'` | 18 |
| 22 | Implement REST CRUD for presets: GET/POST/PUT/DELETE `/api/presets` linked to fixtures and channels | Preset CRUD verified | `curl localhost:3000/api/presets` | 20 |
| 23 | Implement REST CRUD for cue lists and cues: ordered cue list with cue insert/delete/reorder | Cue list with 5 cues, reorder verified | `curl localhost:3000/api/cuelists/1/cues` | 20, 22 |
| 24 | Add CORS middleware for multi-laptop access (allow LAN IP origins) | Browser on another machine can fetch API | Browser console: `fetch('http://192.168.x.x:3000/api/health')` | 17 |
| 25 | Generate TypeScript types from all Rust API structs using ts-rs, set up npm script `generate-types` | TS types match Rust structs | `npm run generate-types && npm run typecheck` | 4, 19-23 |

### Phase 3 — WebSocket real-time layer (Tasks 26-36)

| # | Task | Artifact | Verification | Depends |
|---|---|---|---|---|
| 26 | Implement WebSocket upgrade endpoint in Axum at `/ws`, accept binary messages | WebSocket connects and echoes | `websocat ws://127.0.0.1:3000/ws` | 17 |
| 27 | Implement binary message parser: read 1-byte type tag, dispatch to handlers | Parse fader update (0x01) and GO (0x02) messages | `cargo nextest run -p showctl-server -E 'test(ws_parse)'` | 4, 26 |
| 28 | Implement client registry with topic-based pub/sub: subscribe/unsubscribe messages (0x10/0x11) | Client subscribes to topic, receives messages on that topic only | `cargo nextest run -p showctl-server -E 'test(pubsub)'` | 26, 27 |
| 29 | Wire fader update messages (0x05 batch) from WebSocket to engine command channel | Fader WS message → engine receives command | `cargo nextest run -p showctl-server -E 'test(fader_to_engine)'` | 12, 27 |
| 30 | Wire engine DMX output to WebSocket broadcast: universe data → 0x80 DMX Preview messages to subscribed clients | Client receives DMX frames at ~44Hz | Connect with `websocat`, subscribe, verify binary frames | 12, 28 |
| 31 | Implement delta encoding (0x81): track previous frame, send only changed channels | Delta messages smaller than full frames | `cargo nextest run -p showctl-server -E 'test(delta)'` | 30 |
| 32 | Implement GO button handler (0x02): trigger cue, advance cue list, broadcast cue-fired event | GO → cue fires → all clients receive 0x83 | `websocat` send GO, verify cue-fired response | 23, 27, 29 |
| 33 | Implement full state sync (0xF0 request → 0x82 snapshot): MessagePack-encoded complete state | Sync request returns all fader positions, active cue, DMX state | `cargo nextest run -p showctl-server -E 'test(sync)'` | 28, 30 |
| 34 | Implement connection resilience: heartbeat ping every 5s, detect dead connections, clean up subscriptions | Dead client cleaned up within 8s | Kill client, verify server logs cleanup | 26, 28 |
| 35 | Implement pessimistic entity locking: lock acquire (0x85), release (0x86), 30s inactivity timeout | Lock prevents second client edit, timeout releases | `cargo nextest run -p showctl-server -E 'test(locking)'` | 28 |
| 36 | WebSocket load test with k6: 10 clients, 60Hz fader updates, verify all receive DMX preview | k6 reports 0 errors, p99 latency < 50ms | `k6 run tests/ws-load.js` | 30, 31 |

### Phase 4 — Frontend foundation and state management (Tasks 37-45)

| # | Task | Artifact | Verification | Depends |
|---|---|---|---|---|
| 37 | Set up zustand stores: `useShowStore` (reactive, REST data), `useDMXStore` (non-reactive, Float32Array for DMX), `useConnectionStore` (WS status) | Stores created with TypeScript types | `npm run typecheck` | 2, 25 |
| 38 | Implement WebSocket connection manager: connect, binary message parsing, auto-reconnect (100ms initial, 5s max), connection status indicator | Connection status shown in UI header | Start app, verify WS connects; kill server, verify reconnect | 37, 26 |
| 39 | Implement fader component with rAF-throttled batching: range input → dirty map → requestAnimationFrame → binary WebSocket send | Fader sends batched binary messages at ≤60Hz | Browser DevTools Network WS tab shows binary frames | 38, 27 |
| 40 | Implement TanStack Query hooks for all REST endpoints: `useShows()`, `useStages()`, `useFixtures()`, `usePresets()`, `useCueLists()` | Hooks return typed data, loading states work | React DevTools shows query cache populated | 37, 25 |
| 41 | Build show browser page: list shows, create show, select show, navigate to stage editor | Shows list renders, create works, navigation works | Playwright: `npx playwright test tests/show-browser.spec.ts` | 40 |
| 42 | Build cue list panel: display cues in order, GO button fires WebSocket 0x02, active cue highlighted | GO button triggers cue, highlight advances | Playwright: click GO, verify highlight moves | 40, 32, 38 |
| 43 | Build fixture inspector panel: select fixture, show parameters as sliders, sliders send fader updates via WS | Select fixture, move slider, verify WS message sent | Playwright: select fixture, adjust slider, verify | 39, 40 |
| 44 | Build fixture library browser: search/filter fixture types, drag-to-add-to-stage | Library displays types, search filters correctly | Playwright: `tests/fixture-library.spec.ts` | 40, 21 |
| 45 | Implement connection status indicator: green (connected), yellow (reconnecting), red (disconnected) with latency display | Status indicator visible in header, changes on disconnect | Kill server, verify indicator turns red within 8s | 38 |

### Phase 5 — React Three Fiber 3D stage editor (Tasks 46-58)

| # | Task | Artifact | Verification | Depends |
|---|---|---|---|---|
| 46 | Set up R3F Canvas with OrbitControls, Grid (infinite, 1m cells, 5m sections), ambient+directional light, GizmoHelper | 3D viewport renders with grid and navigation cube | Visual check: `npm run dev`, navigate 3D viewport | 2 |
| 47 | Create fixture body InstancedMesh: one InstancedMesh per fixture type (moving head, par, etc.), positioned from stage data | Fixtures render at correct positions | `@react-three/test-renderer`: verify instance count matches fixtures | 46, 40 |
| 48 | Create beam cone InstancedMesh: single InstancedMesh for all 200 beams, ConeGeometry with additive blending, depthWrite=false | Beam cones visible, additive blending works | Visual check: beams glow and overlap correctly | 46 |
| 49 | Connect DMX store to beam InstancedMesh via useFrame+getState: read RGBW+pan/tilt/zoom/intensity, update matrix and color per instance | Beams update colors from DMX data without React re-renders | Performance check: React DevTools shows 0 re-renders during playback | 37, 48 |
| 50 | Implement TransformControls for fixture positioning: click to select, translate/rotate gizmo, update fixture position in store | Drag fixture, position persists to REST API | Playwright: drag fixture, reload, verify position | 46, 47, 43 |
| 51 | Implement Html overlays for fixture labels: name + DMX address, `distanceFactor` for auto-scaling, `occlude` for depth | Labels visible, scale with distance, hide behind objects | Visual check | 47 |
| 52 | Implement multi-select with drei Select: shift+click to add, box select, bulk operations (copy, delete, group) | Select 5 fixtures, delete all at once | Playwright: shift+click 5 fixtures, press Delete | 50 |
| 53 | Implement fixture copy/paste: copy selected fixtures with offset, paste at cursor position | Copy 3 fixtures, paste, verify 3 new fixtures created | Playwright: copy, paste, verify fixture count | 52, 43 |
| 54 | Implement LOD with drei Detailed: high/medium/low poly fixture models at distances [0, 15, 30] | Far fixtures use low-poly model | Performance check: draw calls stable at <50 | 47 |
| 55 | Implement PerformanceMonitor with adaptive DPR: scale from 0.5-2.0 based on frame rate | DPR drops when scene is heavy, recovers when light | Add 200 fixtures, verify DPR adapts | 46 |
| 56 | Implement editor/live mode toggle: editor = `frameloop="demand"` with TransformControls; live = `frameloop="always"` with DMX receiver | Editor mode: no animation; Live mode: beams animate | Toggle mode, verify behavior changes | 49, 50 |
| 57 | Add bloom post-processing pass (three/examples/jsm/postprocessing) for beam glow enhancement | Beams have soft glow halo | Visual check: beams look more realistic | 48 |
| 58 | Implement Web Worker for DMX binary parsing: WS binary → Worker (parse) → postMessage (transfer) → zustand setState | Worker offloads parsing from main thread | Performance: main thread frame time < 16ms with 200 fixtures | 37, 38, 49 |

### Phase 6 — Multi-client and concurrency (Tasks 59-66)

| # | Task | Artifact | Verification | Depends |
|---|---|---|---|---|
| 59 | Implement user identity: assign user_id on WS connect, display connected operators list | UI shows "2 operators connected" | Connect two browsers, verify both shown | 26, 38 |
| 60 | Implement fader echo: when operator A moves fader, operator B's UI reflects the change via 0x84 echo | Fader on second browser moves in sync | Open two browsers, move fader on one, verify other updates | 29, 39 |
| 61 | Implement lock indicator UI: show lock icon + operator name on locked entities, prevent edit by non-holder | Lock visible, edit blocked for non-holder | Two browsers: lock cue on A, verify B sees lock and cannot edit | 35, 42 |
| 62 | Implement per-user programmer: each operator's fixture selections and parameter edits are independent until "record" | Two operators edit different fixtures independently | Two browsers: each selects different fixture, edits don't conflict | 59, 43 |
| 63 | Implement topic-based subscription in frontend: subscribe only to visible fixture groups and active universes | Switching fixture group changes subscription, reduces incoming data | Network tab: verify only subscribed topic data received | 28, 37 |
| 64 | Implement cue snapshot isolation: editing a cue works on a copy; "Update" commits, "Revert" discards; triggering plays committed version | Edit cue, trigger plays old version, update commits changes | Playwright: edit cue timing, GO plays original, Update applies edit | 23, 42, 35 |
| 65 | Implement HTP/LTP mode toggle per fixture group in UI | UI toggle switches merge mode, engine applies correct strategy | Two browsers send different values, verify HTP/LTP behavior | 14, 15, 60 |
| 66 | Multi-client integration test: 5 browser instances, concurrent fader moves, cue triggers, verify no data corruption | Playwright test with 5 browser contexts passes | `npx playwright test tests/multi-client.spec.ts` | 59-65 |

### Phase 7 — Audio analysis and effects (Tasks 67-72)

| # | Task | Artifact | Verification | Depends |
|---|---|---|---|---|
| 67 | Implement audio capture in `audio-analyzer` crate: open USB audio device, capture PCM stream via cpal | Audio levels print to stdout | `cargo run -p audio-analyzer` with music playing | 1 |
| 68 | Implement beat detection: FFT analysis, onset detection, BPM estimation | BPM output matches music tempo ±5% | Play 120 BPM track, verify output reads 118-122 | 67 |
| 69 | Implement audio→engine bridge: beat events sent via UDP to engine, engine exposes beat state to WebSocket clients | Beat events arrive in browser via WS | UI shows beat indicator flashing on beat | 68, 30 |
| 70 | Implement chase effect in engine: sequence of DMX states, rate synced to BPM or manual | Chase runs through states at BPM rate | Preset chase, play music, verify lights sequence on beat | 12, 69 |
| 71 | Implement audio-reactive effects: intensity follows bass, color follows frequency spectrum | Fixtures react to music | Visual check: lights pulse with bass | 69, 12 |
| 72 | Build audio settings UI: device selection, gain, BPM display, beat indicator, effect assignment | UI shows audio controls | Playwright: `tests/audio-settings.spec.ts` | 69, 40 |

### Phase 8 — Polish, optimization, and deployment (Tasks 73-80)

| # | Task | Artifact | Verification | Depends |
|---|---|---|---|---|
| 73 | Implement show file save/load: export show as JSON file, import from file | Export → import round-trips without data loss | Export, delete, import, verify all data present | 19-23 |
| 74 | Add GDTF fixture file import: parse GDTF XML, extract channels/modes, add to fixture library | Import real GDTF file (e.g., Martin MAC Aura), fixture available in library | Import GDTF, verify channels match spec | 21 |
| 75 | Performance optimization pass: profile with Chrome DevTools, fix any frame drops, verify <16ms frame time with 200 fixtures | Consistent 60fps with 200 fixtures in live mode | Chrome Performance tab: no frames >16ms | 49, 58 |
| 76 | Error handling pass: all REST endpoints return proper error codes, WebSocket errors don't crash server, UI shows error toasts | Intentional errors (invalid fixture ID, malformed WS message) handled gracefully | Send malformed requests, verify error responses | All |
| 77 | Build release binary: `cargo build --release`, single binary serves everything, startup banner with version and port | Single executable runs entire backend | `./showctl-server` prints banner, serves UI | 17 |
| 78 | Write user documentation: setup guide, network configuration for multi-laptop, fixture patching workflow | Markdown docs in `docs/` | Review docs cover all core workflows | All |
| 79 | Implement keyboard shortcuts: Space=GO, Escape=STOP, Tab=next fixture, number keys for preset recall | All shortcuts work | Playwright: keyboard events trigger correct actions | 42, 43 |
| 80 | Final end-to-end integration test: start server, connect 3 browsers, patch 50 fixtures, create cue list, run show with GO buttons, verify sACN output | Full E2E test passes | `./tests/e2e-full.sh` | All |

---

## 8. Testing strategy at each layer

The project uses **three testing tiers** that run in CI and verify the system without physical DMX hardware.

**Tier 1: Unit tests (cargo nextest)** cover all pure logic — DMX universe manipulation, interpolation math, HTP/LTP merge, binary message parsing, cue list ordering. These are fast (<5s total), run on every commit, and require no I/O. The `DmxOutput` trait with `MockDmxOutput` (via mockall) allows testing the engine loop without network access. Filter tests by package: `cargo nextest run -p dmx-engine -E 'test(interpolation)'`.

**Tier 2: Integration tests** verify service boundaries. A test Axum server spawns on port 0 (OS-assigned), and `tokio-tungstenite` acts as the test WebSocket client. Tests verify: fader message → DMX output change, GO button → cue advance, subscribe → receive topic updates, disconnect → hold last look. A custom UDP listener binary in `test-tools/sacn-listener` captures sACN packets and asserts channel values match expectations. REST endpoint tests use `reqwest` against the test server.

**Tier 3: E2E tests (Playwright)** launch the real server and real browser. Tests use Playwright's `toHaveScreenshot()` for visual regression of the 3D viewport (with `--use-angle=gl` for headless GPU rendering). Multi-client tests use multiple browser contexts within one Playwright test. The `tests/e2e-full.sh` script starts the server, runs Playwright, and a parallel sACN listener that verifies DMX packets match expected values when cues fire.

**Load testing with k6** validates WebSocket performance: 10-50 simultaneous connections sending fader updates at 60Hz, verifying p99 latency stays under 50ms and all clients receive DMX preview frames at ~44Hz.

---

## Conclusion

This architecture makes three decisive choices that define the system. **Native processes over Docker** eliminates an entire category of USB/multicast/audio problems that Docker introduces on macOS. **Binary WebSocket with an authoritative engine** keeps the total real-time bandwidth under 30 KB/s while guaranteeing that lights never go dark — the engine's hold-last-look pattern ensures DMX output continues regardless of browser state. **Zustand `getState()` inside `useFrame` with InstancedMesh** achieves zero React re-renders during live playback, keeping 200+ fixture visualization at 60fps in a single draw call.

The 80-task development plan is structured so each task produces a testable artifact that an AI coding agent can complete in one session. The dependency graph ensures no task requires context from more than 2-3 preceding tasks. Phase 1 (engine core) and Phase 2 (API server) can be developed in parallel by different agents, converging at Phase 3 (WebSocket integration). The entire system compiles to a single Rust binary that serves the web UI, handles REST and WebSocket, and outputs DMX — one executable to run a show.