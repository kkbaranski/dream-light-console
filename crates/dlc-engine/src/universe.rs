use dlc_protocol::DMX_CHANNELS_PER_UNIVERSE;

use crate::EngineError;

const CH_COUNT: usize = DMX_CHANNELS_PER_UNIVERSE;

pub struct DmxUniverse {
    channels: [u8; CH_COUNT],
}

impl DmxUniverse {
    pub fn new() -> Self {
        Self {
            channels: [0u8; CH_COUNT],
        }
    }

    pub fn get(&self, channel: u16) -> Result<u8, EngineError> {
        let idx = channel as usize;
        if idx >= CH_COUNT {
            return Err(EngineError::ChannelOutOfRange { channel });
        }
        Ok(self.channels[idx])
    }

    pub fn set(&mut self, channel: u16, value: u8) -> Result<(), EngineError> {
        let idx = channel as usize;
        if idx >= CH_COUNT {
            return Err(EngineError::ChannelOutOfRange { channel });
        }
        self.channels[idx] = value;
        Ok(())
    }

    pub fn set_range(&mut self, start: u16, values: &[u8]) -> Result<(), EngineError> {
        let start_index = start as usize;
        let end = start_index + values.len();
        if end > CH_COUNT {
            return Err(EngineError::RangeOverflow {
                start,
                length: values.len(),
            });
        }
        self.channels[start_index..end].copy_from_slice(values);
        Ok(())
    }

    pub fn as_slice(&self) -> &[u8; CH_COUNT] {
        &self.channels
    }

    pub fn as_mut_slice(&mut self) -> &mut [u8; CH_COUNT] {
        &mut self.channels
    }

    pub fn clear(&mut self) {
        self.channels.fill(0);
    }

    /// For each channel, keep the higher value (Highest Takes Precedence).
    pub fn merge_htp(&mut self, other: &DmxUniverse) {
        for (dst, &src) in self.channels.iter_mut().zip(other.channels.iter()) {
            *dst = (*dst).max(src);
        }
    }

    /// For each channel where `mask[i]` is true, take the value from `other`.
    pub fn merge_ltp(&mut self, other: &DmxUniverse, mask: &[bool; CH_COUNT]) {
        for ((dst, &src), &active) in self.channels.iter_mut().zip(&other.channels).zip(mask) {
            if active {
                *dst = src;
            }
        }
    }

    /// Returns `(channel_index, new_value)` for every channel that differs.
    pub fn diff(&self, other: &DmxUniverse) -> Vec<(u16, u8)> {
        self.channels
            .iter()
            .zip(other.channels.iter())
            .enumerate()
            .filter(|(_, (a, b))| a != b)
            .map(|(i, (_, &b))| (i as u16, b))
            .collect()
    }

    pub fn copy_from(&mut self, other: &DmxUniverse) {
        self.channels = other.channels;
    }

    pub fn iter(&self) -> impl Iterator<Item = (u16, u8)> + '_ {
        self.channels
            .iter()
            .enumerate()
            .map(|(i, &v)| (i as u16, v))
    }
}

impl Default for DmxUniverse {
    fn default() -> Self {
        Self::new()
    }
}