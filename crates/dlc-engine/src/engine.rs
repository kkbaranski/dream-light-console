use std::collections::HashMap;
use std::sync::mpsc;
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
    command_rx: mpsc::Receiver<EngineCommand>,
    tick_interval: Duration,
    tick_count: u64,
    master_dimmer: u8,
    blackout: bool,
}

impl Engine {
    pub fn new(
        output: Box<dyn DmxOutput>,
        command_rx: mpsc::Receiver<EngineCommand>,
    ) -> Self {
        Self {
            universes: HashMap::new(),
            interpolations: HashMap::new(),
            output,
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

            // 2. Tick interpolations
            for (&universe_id, interpolation) in &mut self.interpolations {
                if interpolation.is_fading() {
                    if let Some(universe_buffer) = self.universes.get_mut(&universe_id) {
                        interpolation.tick(universe_buffer);
                    }
                }
            }

            // 3. Send all active universes to output
            self.send_output();

            self.tick_count += 1;

            // 4. Sleep until next anchored tick to prevent drift accumulation
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
    thread: Option<std::thread::JoinHandle<()>>,
}

impl EngineHandle {
    pub fn start(output: Box<dyn DmxOutput>) -> Self {
        let (command_tx, command_rx) = mpsc::sync_channel(COMMAND_CHANNEL_CAPACITY);
        let thread = std::thread::Builder::new()
            .name("dlc-engine".into())
            .spawn(move || {
                let mut engine = Engine::new(output, command_rx);
                engine.run();
            })
            .expect("failed to spawn engine thread");

        Self {
            command_tx,
            thread: Some(thread),
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::output::MockOutput;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    /// Wrap MockOutput in Arc<Mutex<>> so we can inspect it after the engine runs.
    struct SharedMockOutput {
        inner: Arc<Mutex<MockOutput>>,
    }

    impl SharedMockOutput {
        fn new() -> (Self, Arc<Mutex<MockOutput>>) {
            let inner = Arc::new(Mutex::new(MockOutput::new()));
            (Self { inner: inner.clone() }, inner)
        }
    }

    impl DmxOutput for SharedMockOutput {
        fn send_universe(
            &mut self,
            universe_id: u16,
            data: &[u8; 512],
        ) -> Result<(), EngineError> {
            self.inner.lock().unwrap().send_universe(universe_id, data)
        }

        fn label(&self) -> &str {
            "shared-mock"
        }
    }

    #[test]
    fn engine_outputs_at_44hz() {
        let (output, mock) = SharedMockOutput::new();
        let handle = EngineHandle::start(Box::new(output));

        // Set a channel so the engine has a universe to output
        handle
            .send(EngineCommand::SetChannel {
                universe: 1,
                channel: 0,
                value: 1,
            })
            .unwrap();

        // Wait ~100ms → expect ~4 ticks (44Hz × 0.1s ≈ 4.4)
        std::thread::sleep(Duration::from_millis(100));
        handle.shutdown().unwrap();

        let mock = mock.lock().unwrap();
        let count = mock.send_count();
        // Allow tolerance: 3..=6
        assert!(
            (3..=6).contains(&count),
            "expected ~4 frames in 100ms at 44Hz, got {count}"
        );
    }

    #[test]
    fn set_channel_reflected_in_output() {
        let (output, mock) = SharedMockOutput::new();
        let handle = EngineHandle::start(Box::new(output));

        handle
            .send(EngineCommand::SetChannel {
                universe: 1,
                channel: 0,
                value: 255,
            })
            .unwrap();

        // Wait for at least 2 ticks
        std::thread::sleep(Duration::from_millis(60));
        handle.shutdown().unwrap();

        let mock = mock.lock().unwrap();
        let frame = mock.last_frame(1).expect("expected at least one frame");
        assert_eq!(frame[0], 255);
    }

    #[test]
    fn set_universe_replaces_all_channels() {
        let (output, mock) = SharedMockOutput::new();
        let handle = EngineHandle::start(Box::new(output));

        handle
            .send(EngineCommand::SetUniverse {
                universe: 1,
                data: Box::new([128; 512]),
            })
            .unwrap();

        std::thread::sleep(Duration::from_millis(60));
        handle.shutdown().unwrap();

        let mock = mock.lock().unwrap();
        let frame = mock.last_frame(1).expect("expected at least one frame");
        assert!(frame.iter().all(|&v| v == 128));
    }

    #[test]
    fn shutdown_stops_engine() {
        let (output, _mock) = SharedMockOutput::new();
        let handle = EngineHandle::start(Box::new(output));

        let start = Instant::now();
        handle.shutdown().unwrap();
        let elapsed = start.elapsed();

        // Should join within one tick interval + margin
        assert!(
            elapsed < Duration::from_millis(100),
            "shutdown took too long: {elapsed:?}"
        );
    }

    #[test]
    fn multiple_universes() {
        let (output, mock) = SharedMockOutput::new();
        let handle = EngineHandle::start(Box::new(output));

        handle
            .send(EngineCommand::SetChannel {
                universe: 1,
                channel: 0,
                value: 100,
            })
            .unwrap();
        handle
            .send(EngineCommand::SetChannel {
                universe: 2,
                channel: 0,
                value: 200,
            })
            .unwrap();

        std::thread::sleep(Duration::from_millis(60));
        handle.shutdown().unwrap();

        let mock = mock.lock().unwrap();
        assert_eq!(mock.last_frame(1).unwrap()[0], 100);
        assert_eq!(mock.last_frame(2).unwrap()[0], 200);
    }

    #[test]
    fn engine_handle_send_after_shutdown_fails() {
        let (output, _mock) = SharedMockOutput::new();
        let handle = EngineHandle::start(Box::new(output));

        let sender = handle.sender();
        handle.shutdown().unwrap();

        let result = sender.try_send(EngineCommand::Shutdown);
        assert!(result.is_err());
    }

    #[test]
    fn commands_drain_non_blocking() {
        let (output, mock) = SharedMockOutput::new();
        let handle = EngineHandle::start(Box::new(output));

        // Send 1000 commands rapidly — bounded channel may reject some if full,
        // but the engine should still produce frames from what it received
        for i in 0..1000u16 {
            let _ = handle.send(EngineCommand::SetChannel {
                universe: 1,
                channel: (i % 512),
                value: (i % 256) as u8,
            });
        }

        // Wait for engine to process
        std::thread::sleep(Duration::from_millis(60));
        handle.shutdown().unwrap();

        let mock = mock.lock().unwrap();
        assert!(mock.send_count() > 0, "engine should have produced frames");
    }

    #[test]
    fn engine_handle_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<EngineHandle>();
    }

    #[test]
    fn hold_last_look_continues_after_sender_dropped() {
        let (output, mock) = SharedMockOutput::new();
        let (tx, rx) = mpsc::sync_channel(COMMAND_CHANNEL_CAPACITY);

        // Set a value then drop the sender
        tx.send(EngineCommand::SetChannel {
            universe: 1,
            channel: 0,
            value: 42,
        })
        .unwrap();
        drop(tx);

        // Start engine — all senders already dropped
        let _thread = std::thread::spawn(move || {
            let mut engine = Engine::new(Box::new(output), rx);
            engine.run();
        });

        // Wait for several ticks (44Hz → ~150ms ≈ 6-7 frames)
        std::thread::sleep(Duration::from_millis(150));

        let mock = mock.lock().unwrap();
        let count = mock.send_count();
        assert!(
            count >= 4,
            "expected continued output in hold-last-look, got {count} frames"
        );
        let frame = mock.last_frame(1).expect("expected frames for universe 1");
        assert_eq!(frame[0], 42, "channel 0 should hold its last value");
    }

    #[test]
    fn hold_last_look_preserves_all_channels() {
        let (output, mock) = SharedMockOutput::new();
        let (tx, rx) = mpsc::sync_channel(COMMAND_CHANNEL_CAPACITY);

        // Set multiple channels
        tx.send(EngineCommand::SetUniverse {
            universe: 1,
            data: Box::new([128; 512]),
        })
        .unwrap();
        drop(tx);

        let _thread = std::thread::spawn(move || {
            let mut engine = Engine::new(Box::new(output), rx);
            engine.run();
        });

        std::thread::sleep(Duration::from_millis(150));

        let mock = mock.lock().unwrap();
        let frame = mock.last_frame(1).expect("expected frames");
        assert!(
            frame.iter().all(|&v| v == 128),
            "all channels should hold their last value"
        );
    }

    #[test]
    fn hold_last_look_shutdown_still_works() {
        let (output, _mock) = SharedMockOutput::new();
        let handle = EngineHandle::start(Box::new(output));

        handle
            .send(EngineCommand::SetChannel {
                universe: 1,
                channel: 0,
                value: 100,
            })
            .unwrap();

        std::thread::sleep(Duration::from_millis(50));

        // Explicit Shutdown should still stop the engine cleanly
        let start = Instant::now();
        handle.shutdown().unwrap();
        let elapsed = start.elapsed();

        assert!(
            elapsed < Duration::from_millis(100),
            "shutdown should still work promptly: {elapsed:?}"
        );
    }

    #[test]
    fn drop_shuts_down_engine() {
        let (output, _mock) = SharedMockOutput::new();
        let handle = EngineHandle::start(Box::new(output));

        // Dropping the handle should send Shutdown and join the thread
        let start = Instant::now();
        drop(handle);
        let elapsed = start.elapsed();

        assert!(
            elapsed < Duration::from_millis(100),
            "drop should shut down engine promptly: {elapsed:?}"
        );
    }

    #[test]
    fn master_dimmer_scales_output() {
        let (output, mock) = SharedMockOutput::new();
        let handle = EngineHandle::start(Box::new(output));

        handle
            .send(EngineCommand::SetChannel {
                universe: 1,
                channel: 0,
                value: 200,
            })
            .unwrap();
        // Set master dimmer to 50% (128/255)
        handle
            .send(EngineCommand::SetMasterDimmer { value: 128 })
            .unwrap();

        std::thread::sleep(Duration::from_millis(60));
        handle.shutdown().unwrap();

        let mock = mock.lock().unwrap();
        let frame = mock.last_frame(1).expect("expected at least one frame");
        // 200 * 128 / 255 ≈ 100
        let expected = ((200u16 * 128) / 255) as u8;
        assert_eq!(frame[0], expected);
    }

    #[test]
    fn master_dimmer_full_passes_through() {
        let (output, mock) = SharedMockOutput::new();
        let handle = EngineHandle::start(Box::new(output));

        handle
            .send(EngineCommand::SetChannel {
                universe: 1,
                channel: 0,
                value: 200,
            })
            .unwrap();
        // Master dimmer defaults to 255 (full)

        std::thread::sleep(Duration::from_millis(60));
        handle.shutdown().unwrap();

        let mock = mock.lock().unwrap();
        let frame = mock.last_frame(1).expect("expected at least one frame");
        assert_eq!(frame[0], 200);
    }

    #[test]
    fn blackout_overrides_all_output() {
        let (output, mock) = SharedMockOutput::new();
        let handle = EngineHandle::start(Box::new(output));

        handle
            .send(EngineCommand::SetChannel {
                universe: 1,
                channel: 0,
                value: 255,
            })
            .unwrap();
        handle
            .send(EngineCommand::Blackout { active: true })
            .unwrap();

        std::thread::sleep(Duration::from_millis(60));
        handle.shutdown().unwrap();

        let mock = mock.lock().unwrap();
        let frame = mock.last_frame(1).expect("expected at least one frame");
        assert!(
            frame.iter().all(|&v| v == 0),
            "blackout should zero all channels"
        );
    }

    #[test]
    fn blackout_release_restores_output() {
        let (output, mock) = SharedMockOutput::new();
        let handle = EngineHandle::start(Box::new(output));

        handle
            .send(EngineCommand::SetChannel {
                universe: 1,
                channel: 0,
                value: 255,
            })
            .unwrap();
        handle
            .send(EngineCommand::Blackout { active: true })
            .unwrap();

        std::thread::sleep(Duration::from_millis(40));

        handle
            .send(EngineCommand::Blackout { active: false })
            .unwrap();

        std::thread::sleep(Duration::from_millis(60));
        handle.shutdown().unwrap();

        let mock = mock.lock().unwrap();
        let frame = mock.last_frame(1).expect("expected at least one frame");
        assert_eq!(frame[0], 255, "blackout release should restore original values");
    }

    #[test]
    fn bounded_channel_rejects_when_full() {
        // Create a channel with capacity 2
        let (tx, rx) = mpsc::sync_channel(2);
        // Fill it up without consuming
        tx.try_send(EngineCommand::SetMasterDimmer { value: 100 }).unwrap();
        tx.try_send(EngineCommand::SetMasterDimmer { value: 200 }).unwrap();
        // Third should fail
        let result = tx.try_send(EngineCommand::SetMasterDimmer { value: 255 });
        assert!(result.is_err());
        drop(rx);
    }
}
