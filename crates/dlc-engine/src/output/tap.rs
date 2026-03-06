use tokio::sync::mpsc;

use crate::EngineError;

use super::DmxOutput;

/// A frame captured by `TapOutput` for relay to WebSocket clients.
pub struct TapFrame {
    pub universe_id: u16,
    pub data: Box<[u8; 512]>,
}

/// Wraps any `DmxOutput` and copies each frame to a bounded channel.
///
/// Uses `try_send` so the engine thread never blocks — if the channel is full,
/// frames are silently dropped (the relay task will catch up on the next drain).
pub struct TapOutput {
    inner: Box<dyn DmxOutput>,
    tap_tx: mpsc::Sender<TapFrame>,
}

impl TapOutput {
    pub fn new(inner: Box<dyn DmxOutput>, tap_tx: mpsc::Sender<TapFrame>) -> Self {
        Self { inner, tap_tx }
    }
}

impl DmxOutput for TapOutput {
    fn send_universe(&mut self, universe_id: u16, data: &[u8; 512]) -> Result<(), EngineError> {
        self.inner.send_universe(universe_id, data)?;

        let _ = self.tap_tx.try_send(TapFrame {
            universe_id,
            data: Box::new(*data),
        });

        Ok(())
    }

    fn label(&self) -> &str {
        self.inner.label()
    }
}