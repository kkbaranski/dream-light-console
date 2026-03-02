use std::collections::HashMap;

use super::DmxOutput;
use crate::EngineError;

pub struct MockOutput {
    frames: HashMap<u16, Vec<[u8; 512]>>,
    send_count: usize,
}

impl MockOutput {
    pub fn new() -> Self {
        Self {
            frames: HashMap::new(),
            send_count: 0,
        }
    }

    /// Total number of `send_universe` calls across all universes.
    pub fn send_count(&self) -> usize {
        self.send_count
    }

    /// Returns all frames sent to a specific universe, in order.
    pub fn frames_for(&self, universe_id: u16) -> &[[u8; 512]] {
        self.frames.get(&universe_id).map_or(&[], |v| v.as_slice())
    }

    /// Returns the last frame sent to a universe, or `None`.
    pub fn last_frame(&self, universe_id: u16) -> Option<&[u8; 512]> {
        self.frames.get(&universe_id).and_then(|v| v.last())
    }

    /// Clears all captured frames.
    pub fn clear(&mut self) {
        self.frames.clear();
        self.send_count = 0;
    }
}

impl Default for MockOutput {
    fn default() -> Self {
        Self::new()
    }
}

impl DmxOutput for MockOutput {
    fn send_universe(&mut self, universe_id: u16, data: &[u8; 512]) -> Result<(), EngineError> {
        self.frames.entry(universe_id).or_default().push(*data);
        self.send_count += 1;
        Ok(())
    }

    fn label(&self) -> &str {
        "mock"
    }
}
