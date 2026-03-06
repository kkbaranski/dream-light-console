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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::output::MockOutput;

    #[test]
    fn tap_forwards_to_inner() {
        let (tx, _rx) = mpsc::channel(16);
        let mut tap = TapOutput::new(Box::new(MockOutput::new()), tx);

        let mut data = [0u8; 512];
        data[0] = 42;
        tap.send_universe(1, &data).unwrap();
    }

    #[test]
    fn tap_sends_frame_to_channel() {
        let (tx, mut rx) = mpsc::channel(16);
        let mut tap = TapOutput::new(Box::new(MockOutput::new()), tx);

        let mut data = [0u8; 512];
        data[0] = 99;
        tap.send_universe(1, &data).unwrap();

        let frame = rx.try_recv().unwrap();
        assert_eq!(frame.universe_id, 1);
        assert_eq!(frame.data[0], 99);
    }

    #[test]
    fn tap_does_not_block_when_channel_full() {
        let (tx, _rx) = mpsc::channel(1);
        let mut tap = TapOutput::new(Box::new(MockOutput::new()), tx);

        // Fill channel
        tap.send_universe(1, &[0; 512]).unwrap();
        // Should not block or error — frame is silently dropped
        tap.send_universe(1, &[1; 512]).unwrap();
    }

    #[test]
    fn tap_delegates_label() {
        let (tx, _rx) = mpsc::channel(1);
        let tap = TapOutput::new(Box::new(MockOutput::new()), tx);
        assert_eq!(tap.label(), "mock");
    }
}
