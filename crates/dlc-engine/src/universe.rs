use dlc_protocol::DMX_CHANNELS_PER_UNIVERSE;

pub struct DmxUniverse {
    channels: [u8; DMX_CHANNELS_PER_UNIVERSE],
}

impl DmxUniverse {
    pub fn new() -> Self {
        Self {
            channels: [0u8; DMX_CHANNELS_PER_UNIVERSE],
        }
    }

    pub fn get_channel(&self, channel: usize) -> u8 {
        self.channels[channel]
    }

    pub fn set_channel(&mut self, channel: usize, value: u8) {
        self.channels[channel] = value;
    }

    pub fn channels(&self) -> &[u8; DMX_CHANNELS_PER_UNIVERSE] {
        &self.channels
    }
}

impl Default for DmxUniverse {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_universe_is_zeroed() {
        let universe = DmxUniverse::new();
        assert!(universe.channels.iter().all(|&ch| ch == 0));
    }
}
