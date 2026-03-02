use std::collections::HashMap;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use dlc_protocol::{EngineCommand, ENGINE_HZ};

use crate::error::EngineError;
use crate::output::DmxOutput;
use crate::universe::DmxUniverse;

pub struct Engine {
    universes: HashMap<u16, DmxUniverse>,
    output: Box<dyn DmxOutput>,
    command_rx: mpsc::Receiver<EngineCommand>,
    tick_interval: Duration,
    tick_count: u64,
}

impl Engine {
    pub fn new(
        output: Box<dyn DmxOutput>,
        command_rx: mpsc::Receiver<EngineCommand>,
    ) -> Self {
        Self {
            universes: HashMap::new(),
            output,
            command_rx,
            tick_interval: Duration::from_secs_f64(1.0 / ENGINE_HZ as f64),
            tick_count: 0,
        }
    }

    pub fn run(&mut self) {
        loop {
            let tick_start = Instant::now();

            // 1. Drain all pending commands (non-blocking)
            while let Ok(command) = self.command_rx.try_recv() {
                match command {
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
                    EngineCommand::Shutdown => return,
                    _ => {} // FireCue, StopCueList, SetMasterDimmer handled in future tasks
                }
            }

            // 2. Send all active universes to output
            for (&universe_id, universe) in &self.universes {
                if let Err(e) = self.output.send_universe(universe_id, universe.as_slice()) {
                    tracing::warn!("Output error for universe {universe_id}: {e}");
                }
            }

            self.tick_count += 1;

            // 3. Sleep for remainder of tick interval
            let elapsed = tick_start.elapsed();
            if elapsed < self.tick_interval {
                std::thread::sleep(self.tick_interval - elapsed);
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
    command_tx: mpsc::Sender<EngineCommand>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl EngineHandle {
    pub fn start(output: Box<dyn DmxOutput>) -> Self {
        let (command_tx, command_rx) = mpsc::channel();
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

    pub fn send(&self, command: EngineCommand) -> Result<(), EngineError> {
        self.command_tx
            .send(command)
            .map_err(|_| EngineError::SendFailed)
    }

    pub fn shutdown(mut self) -> Result<(), EngineError> {
        let _ = self.command_tx.send(EngineCommand::Shutdown);
        if let Some(thread) = self.thread.take() {
            thread.join().map_err(|_| EngineError::ThreadPanicked)?;
        }
        Ok(())
    }

    pub fn sender(&self) -> mpsc::Sender<EngineCommand> {
        self.command_tx.clone()
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
        // Allow 10% tolerance: 3..=6
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

        let result = sender.send(EngineCommand::Shutdown);
        assert!(result.is_err());
    }

    #[test]
    fn commands_drain_non_blocking() {
        let (output, mock) = SharedMockOutput::new();
        let handle = EngineHandle::start(Box::new(output));

        // Send 1000 commands rapidly
        for i in 0..1000u16 {
            handle
                .send(EngineCommand::SetChannel {
                    universe: 1,
                    channel: (i % 512),
                    value: (i % 256) as u8,
                })
                .unwrap();
        }

        // Wait for engine to process
        std::thread::sleep(Duration::from_millis(60));
        handle.shutdown().unwrap();

        let mock = mock.lock().unwrap();
        assert!(mock.send_count() > 0, "engine should have produced frames");
        // Channel 999 % 512 = 487, value = 999 % 256 = 231
        assert_eq!(mock.last_frame(1).unwrap()[487], 231);
    }

    #[test]
    fn engine_handle_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<EngineHandle>();
    }
}
