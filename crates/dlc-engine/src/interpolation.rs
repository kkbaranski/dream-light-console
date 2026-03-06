use crate::universe::DmxUniverse;

struct ChannelInterpolation {
    source: u8,
    target: u8,
    progress: f32,
    step: f32,
}

pub struct InterpolationState {
    channels: [Option<ChannelInterpolation>; 512],
}

impl InterpolationState {
    pub fn new() -> Self {
        Self {
            channels: std::array::from_fn(|_| None),
        }
    }

    /// Begin interpolation for one channel. If `frame_count == 0` or
    /// `current == target`, the value is set on the universe immediately.
    pub fn start_fade(
        &mut self,
        channel: u16,
        current: u8,
        target: u8,
        frame_count: u32,
        universe: &mut DmxUniverse,
    ) {
        let idx = channel as usize;
        if idx >= 512 {
            return;
        }

        if frame_count == 0 || current == target {
            let _ = universe.set(channel, target);
            self.channels[idx] = None;
            return;
        }

        self.channels[idx] = Some(ChannelInterpolation {
            source: current,
            target,
            progress: 0.0,
            step: 1.0 / frame_count as f32,
        });
    }

    /// Advance all active interpolations by one step and write current
    /// values to the universe. Completed interpolations are removed.
    pub fn tick(&mut self, universe: &mut DmxUniverse) {
        for (i, slot) in self.channels.iter_mut().enumerate() {
            let Some(interpolation) = slot else { continue };

            interpolation.progress += interpolation.step;

            if interpolation.progress >= 1.0 {
                // Completed — set exact target to avoid floating-point drift
                let _ = universe.set(i as u16, interpolation.target);
                *slot = None;
            } else {
                let value = interpolation.source as f32
                    + (interpolation.target as f32 - interpolation.source as f32) * interpolation.progress;
                let _ = universe.set(i as u16, value.round() as u8);
            }
        }
    }

    /// Returns `true` if any channel is currently fading.
    pub fn is_fading(&self) -> bool {
        self.channels.iter().any(|s| s.is_some())
    }

    /// Stop interpolation on a channel, leaving the universe at its current value.
    pub fn cancel(&mut self, channel: u16) {
        let idx = channel as usize;
        if idx < 512 {
            self.channels[idx] = None;
        }
    }
}

impl Default for InterpolationState {
    fn default() -> Self {
        Self::new()
    }
}