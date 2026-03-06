use std::collections::HashMap;
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

use dlc_protocol::{EngineCommand, ENGINE_HZ};

use crate::error::EngineError;
use crate::interpolation::InterpolationState;
use crate::output::DmxOutput;
use crate::universe::DmxUniverse;

/// Bounded channel capacity. Large enough to absorb fader sweeps without
/// dropping commands, small enough to bound memory usage.
const COMMAND_CHANNEL_CAPACITY: usize = 1024;

/// Scratch buffer used to apply master dimmer and blackout before output.
static BLACKOUT_FRAME: [u8; 512] = [0u8; 512];

pub struct Engine {
    universes: HashMap<u16, DmxUniverse>,
    interpolations: HashMap<u16, InterpolationState>,
    output: Box<dyn DmxOutput>,
    swap_slot: Arc<Mutex<Option<Box<dyn DmxOutput>>>>,
    command_rx: mpsc::Receiver<EngineCommand>,
    tick_interval: Duration,
    tick_count: u64,
    master_dimmer: u8,
    blackout: bool,
}

impl Engine {
    pub fn new(
        output: Box<dyn DmxOutput>,
        swap_slot: Arc<Mutex<Option<Box<dyn DmxOutput>>>>,
        command_rx: mpsc::Receiver<EngineCommand>,
    ) -> Self {
        Self {
            universes: HashMap::new(),
            interpolations: HashMap::new(),
            output,
            swap_slot,
            command_rx,
            tick_interval: Duration::from_secs_f64(1.0 / ENGINE_HZ as f64),
            tick_count: 0,
            master_dimmer: 255,
            blackout: false,
        }
    }

    pub fn run(&mut self) {
        let mut disconnected = false;
        let mut next_tick = Instant::now();

        loop {
            // 1. Drain all pending commands (non-blocking)
            loop {
                match self.command_rx.try_recv() {
                    Ok(command) => match command {
                        EngineCommand::SetChannel {
                            universe,
                            channel,
                            value,
                        } => {
                            if let Err(e) =
                                self.get_or_create_universe(universe).set(channel, value)
                            {
                                tracing::warn!("SetChannel error: {e}");
                            }
                        }
                        EngineCommand::SetUniverse { universe, data } => {
                            *self.get_or_create_universe(universe).as_mut_slice() = *data;
                        }
                        EngineCommand::FadeChannel {
                            universe,
                            channel,
                            target,
                            frames,
                        } => {
                            let uni = self.universes.entry(universe).or_default();
                            let current = uni.get(channel).unwrap_or(0);
                            self.interpolations
                                .entry(universe)
                                .or_default()
                                .start_fade(channel, current, target, frames, uni);
                        }
                        EngineCommand::SetMasterDimmer { value } => {
                            self.master_dimmer = value;
                            tracing::debug!("Master dimmer set to {value}");
                        }
                        EngineCommand::Blackout { active } => {
                            self.blackout = active;
                            tracing::info!("Blackout {}", if active { "ON" } else { "OFF" });
                        }
                        EngineCommand::Shutdown => return,
                        EngineCommand::FireCue { .. } | EngineCommand::StopCueList { .. } => {
                            tracing::debug!("FireCue/StopCueList resolved server-side, ignoring");
                        }
                    },
                    Err(mpsc::TryRecvError::Empty) => break,
                    Err(mpsc::TryRecvError::Disconnected) => {
                        if !disconnected {
                            tracing::warn!(
                                "All command sources disconnected — holding last look"
                            );
                            disconnected = true;
                        }
                        break;
                    }
                }
            }

            // 2. Check for hot-swapped output
            if let Ok(mut slot) = self.swap_slot.try_lock() {
                if let Some(new_output) = slot.take() {
                    tracing::info!("DMX output swapped to '{}'", new_output.label());
                    self.output = new_output;
                }
            }

            // 3. Tick interpolations
            for (&universe_id, interpolation) in &mut self.interpolations {
                if interpolation.is_fading() {
                    if let Some(universe_buffer) = self.universes.get_mut(&universe_id) {
                        interpolation.tick(universe_buffer);
                    }
                }
            }

            // 4. Send all active universes to output
            self.send_output();

            self.tick_count += 1;

            // 5. Sleep until next anchored tick to prevent drift accumulation
            next_tick += self.tick_interval;
            let now = Instant::now();
            if now < next_tick {
                std::thread::sleep(next_tick - now);
            } else {
                // We're behind schedule — skip ahead to avoid cascading catch-up
                next_tick = now;
            }
        }
    }

    fn send_output(&mut self) {
        for (&universe_id, universe) in &self.universes {
            let data = if self.blackout {
                &BLACKOUT_FRAME
            } else if self.master_dimmer == 255 {
                universe.as_slice()
            } else {
                // Apply master dimmer scaling into a scratch buffer on the stack
                let raw = universe.as_slice();
                let scaled = &mut [0u8; 512];
                let scale = self.master_dimmer as u16;
                for (i, &v) in raw.iter().enumerate() {
                    scaled[i] = ((v as u16 * scale) / 255) as u8;
                }
                // We need to send the scaled data, but can't return a reference to a local.
                // Send directly here and continue.
                if let Err(e) = self.output.send_universe(universe_id, scaled) {
                    tracing::warn!("Output error for universe {universe_id}: {e}");
                }
                continue;
            };
            if let Err(e) = self.output.send_universe(universe_id, data) {
                tracing::warn!("Output error for universe {universe_id}: {e}");
            }
        }
    }

    fn get_or_create_universe(&mut self, id: u16) -> &mut DmxUniverse {
        self.universes.entry(id).or_default()
    }

    pub fn tick_count(&self) -> u64 {
        self.tick_count
    }
}

/// Thread-safe handle for sending commands to a running engine.
pub struct EngineHandle {
    command_tx: mpsc::SyncSender<EngineCommand>,
    swap_slot: Arc<Mutex<Option<Box<dyn DmxOutput>>>>,
    output_label: Arc<Mutex<String>>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl EngineHandle {
    pub fn start(output: Box<dyn DmxOutput>, label: &str) -> Self {
        let (command_tx, command_rx) = mpsc::sync_channel(COMMAND_CHANNEL_CAPACITY);
        let swap_slot: Arc<Mutex<Option<Box<dyn DmxOutput>>>> = Arc::new(Mutex::new(None));
        let output_label = Arc::new(Mutex::new(label.to_string()));

        let swap_slot_clone = swap_slot.clone();

        let thread = std::thread::Builder::new()
            .name("dlc-engine".into())
            .spawn(move || {
                let mut engine = Engine::new(output, swap_slot_clone, command_rx);
                engine.run();
            })
            .expect("failed to spawn engine thread");

        Self {
            command_tx,
            swap_slot,
            output_label,
            thread: Some(thread),
        }
    }

    /// Hot-swap the DMX output. The engine thread will pick this up on the next tick.
    pub fn swap_output(&self, output: Box<dyn DmxOutput>, label: &str) {
        if let Ok(mut slot) = self.swap_slot.lock() {
            *slot = Some(output);
        }
        if let Ok(mut l) = self.output_label.lock() {
            *l = label.to_string();
        }
    }

    /// Returns the label of the currently active DMX output.
    pub fn output_label(&self) -> String {
        self.output_label.lock().map(|l| l.clone()).unwrap_or_default()
    }

    /// Send a command to the engine. Returns `Err` if the engine has stopped
    /// or the channel is full (backpressure: try_send to avoid blocking callers).
    pub fn send(&self, command: EngineCommand) -> Result<(), EngineError> {
        self.command_tx.try_send(command).map_err(|e| match e {
            mpsc::TrySendError::Full(_) => EngineError::ChannelFull,
            mpsc::TrySendError::Disconnected(_) => EngineError::SendFailed,
        })
    }

    pub fn shutdown(mut self) -> Result<(), EngineError> {
        // Use blocking send for shutdown to guarantee delivery
        let _ = self.command_tx.send(EngineCommand::Shutdown);
        if let Some(thread) = self.thread.take() {
            thread.join().map_err(|_| EngineError::ThreadPanicked)?;
        }
        Ok(())
    }

    pub fn sender(&self) -> mpsc::SyncSender<EngineCommand> {
        self.command_tx.clone()
    }
}

impl Drop for EngineHandle {
    fn drop(&mut self) {
        let _ = self.command_tx.send(EngineCommand::Shutdown);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}