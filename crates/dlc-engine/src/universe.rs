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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_zeroed() {
        let u = DmxUniverse::default();
        assert!(u.as_slice().iter().all(|&ch| ch == 0));
    }

    #[test]
    fn get_set_round_trip() {
        let mut u = DmxUniverse::new();
        u.set(0, 255).unwrap();
        assert_eq!(u.get(0).unwrap(), 255);
    }

    #[test]
    fn get_out_of_range() {
        let u = DmxUniverse::new();
        assert!(u.get(512).is_err());
        assert!(u.get(u16::MAX).is_err());
    }

    #[test]
    fn set_out_of_range() {
        let mut u = DmxUniverse::new();
        assert!(u.set(512, 100).is_err());
        assert!(u.set(u16::MAX, 100).is_err());
    }

    #[test]
    fn get_set_boundary_channel() {
        let mut u = DmxUniverse::new();
        u.set(511, 42).unwrap();
        assert_eq!(u.get(511).unwrap(), 42);
    }

    #[test]
    fn set_range_basic() {
        let mut u = DmxUniverse::new();
        u.set_range(0, &[10, 20, 30]).unwrap();
        assert_eq!(u.get(0).unwrap(), 10);
        assert_eq!(u.get(1).unwrap(), 20);
        assert_eq!(u.get(2).unwrap(), 30);
        assert_eq!(u.get(3).unwrap(), 0);
    }

    #[test]
    fn set_range_at_end() {
        let mut u = DmxUniverse::new();
        u.set_range(510, &[77, 88]).unwrap();
        assert_eq!(u.get(510).unwrap(), 77);
        assert_eq!(u.get(511).unwrap(), 88);
    }

    #[test]
    fn set_range_overflow() {
        let mut u = DmxUniverse::new();
        let result = u.set_range(510, &[1, 2, 3, 4]);
        assert!(result.is_err());
    }

    #[test]
    fn set_range_empty_is_ok() {
        let mut u = DmxUniverse::new();
        u.set_range(511, &[]).unwrap();
    }

    #[test]
    fn merge_htp_takes_higher() {
        let mut a = DmxUniverse::new();
        a.set(0, 100).unwrap();
        a.set(1, 200).unwrap();

        let mut b = DmxUniverse::new();
        b.set(0, 150).unwrap();
        b.set(1, 50).unwrap();

        a.merge_htp(&b);
        assert_eq!(a.get(0).unwrap(), 150);
        assert_eq!(a.get(1).unwrap(), 200);
    }

    #[test]
    fn merge_htp_with_zeroes() {
        let mut a = DmxUniverse::new();
        a.set(0, 100).unwrap();
        a.set(1, 200).unwrap();

        let b = DmxUniverse::new();
        a.merge_htp(&b);

        assert_eq!(a.get(0).unwrap(), 100);
        assert_eq!(a.get(1).unwrap(), 200);
    }

    #[test]
    fn merge_ltp_respects_mask() {
        let mut a = DmxUniverse::new();
        a.set(0, 100).unwrap();
        a.set(1, 200).unwrap();

        let mut b = DmxUniverse::new();
        b.set(0, 50).unwrap();
        b.set(1, 255).unwrap();

        let mut mask = [false; 512];
        mask[0] = true; // only ch0 updated in other

        a.merge_ltp(&b, &mask);
        assert_eq!(a.get(0).unwrap(), 50);  // taken from b
        assert_eq!(a.get(1).unwrap(), 200); // kept from a
    }

    #[test]
    fn diff_detects_changes() {
        let mut a = DmxUniverse::new();
        a.set(0, 0).unwrap();
        a.set(1, 100).unwrap();
        a.set(2, 200).unwrap();

        let mut b = DmxUniverse::new();
        b.set(0, 0).unwrap();
        b.set(1, 150).unwrap();
        b.set(2, 200).unwrap();

        let delta = a.diff(&b);
        assert_eq!(delta, vec![(1, 150)]);
    }

    #[test]
    fn diff_empty_when_identical() {
        let a = DmxUniverse::new();
        let b = DmxUniverse::new();
        assert!(a.diff(&b).is_empty());
    }

    #[test]
    fn clear_zeros_all() {
        let mut u = DmxUniverse::new();
        u.set(0, 255).unwrap();
        u.set(511, 128).unwrap();
        u.clear();
        assert!(u.as_slice().iter().all(|&ch| ch == 0));
    }

    #[test]
    fn copy_from_replaces_all() {
        let mut a = DmxUniverse::new();
        let mut b = DmxUniverse::new();
        b.set(100, 42).unwrap();
        b.set(200, 99).unwrap();

        a.copy_from(&b);
        assert_eq!(a.get(100).unwrap(), 42);
        assert_eq!(a.get(200).unwrap(), 99);
        assert_eq!(a.as_slice(), b.as_slice());
    }

    #[test]
    fn as_mut_slice_allows_direct_write() {
        let mut u = DmxUniverse::new();
        u.as_mut_slice()[0] = 77;
        assert_eq!(u.get(0).unwrap(), 77);
    }

    #[test]
    fn iter_yields_all_channels() {
        let mut u = DmxUniverse::new();
        u.set(0, 10).unwrap();
        u.set(511, 20).unwrap();

        let items: Vec<(u16, u8)> = u.iter().collect();
        assert_eq!(items.len(), 512);
        assert_eq!(items[0], (0, 10));
        assert_eq!(items[511], (511, 20));
        assert_eq!(items[1], (1, 0));
    }
}
