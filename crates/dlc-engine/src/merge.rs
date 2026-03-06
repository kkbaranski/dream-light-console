use std::collections::HashMap;

use crate::universe::DmxUniverse;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SourceType {
    Fader,
    Cue,
    Effect,
    Submaster,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct SourceId {
    pub source_type: SourceType,
    pub id: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MergeMode {
    Htp,
    Ltp,
}

struct LtpEntry {
    value: u8,
    sequence: u64,
}

pub struct OutputMerger {
    sources: HashMap<SourceId, DmxUniverse>,
    merge_mode: [MergeMode; 512],
    /// Per-channel LTP tracking: for each (channel, source), store the value
    /// and a sequence number indicating recency.
    ltp_state: HashMap<(u16, SourceId), LtpEntry>,
    ltp_sequence: u64,
    output: DmxUniverse,
}

impl OutputMerger {
    pub fn new() -> Self {
        Self {
            sources: HashMap::new(),
            merge_mode: [MergeMode::Htp; 512],
            ltp_state: HashMap::new(),
            ltp_sequence: 0,
            output: DmxUniverse::new(),
        }
    }

    /// Store or update a source's contribution.
    pub fn update_source(&mut self, source: SourceId, universe: &DmxUniverse) {
        // Track LTP updates: for channels that changed, bump sequence
        if let Some(prev) = self.sources.get(&source) {
            for i in 0..512u16 {
                let new_val = universe.get(i).unwrap_or(0);
                let old_val = prev.get(i).unwrap_or(0);
                if new_val != old_val {
                    self.ltp_sequence += 1;
                    self.ltp_state.insert(
                        (i, source),
                        LtpEntry {
                            value: new_val,
                            sequence: self.ltp_sequence,
                        },
                    );
                }
            }
        } else {
            // New source — all non-zero channels are "updates"
            for i in 0..512u16 {
                let val = universe.get(i).unwrap_or(0);
                if val != 0 {
                    self.ltp_sequence += 1;
                    self.ltp_state.insert(
                        (i, source),
                        LtpEntry {
                            value: val,
                            sequence: self.ltp_sequence,
                        },
                    );
                }
            }
        }

        let mut copy = DmxUniverse::new();
        copy.copy_from(universe);
        self.sources.insert(source, copy);
    }

    /// Store or update a source's contribution, only bumping LTP for masked channels.
    ///
    /// The `mask` array indicates which channels were explicitly changed by the caller.
    /// All 512 channel values are stored (for HTP), but only masked channels participate
    /// in LTP sequence tracking.
    pub fn update_source_masked(
        &mut self,
        source: SourceId,
        universe: &DmxUniverse,
        mask: &[bool; 512],
    ) {
        for i in 0..512u16 {
            if !mask[i as usize] {
                continue;
            }
            let new_val = universe.get(i).unwrap_or(0);
            let should_bump = if let Some(prev) = self.sources.get(&source) {
                prev.get(i).unwrap_or(0) != new_val
            } else {
                new_val != 0
            };
            if should_bump {
                self.ltp_sequence += 1;
                self.ltp_state.insert(
                    (i, source),
                    LtpEntry {
                        value: new_val,
                        sequence: self.ltp_sequence,
                    },
                );
            }
        }

        let mut copy = DmxUniverse::new();
        copy.copy_from(universe);
        self.sources.insert(source, copy);
    }

    /// Remove a source (e.g., effect stopped).
    pub fn remove_source(&mut self, source: &SourceId) {
        self.sources.remove(source);
        self.ltp_state.retain(|&(_, sid), _| sid != *source);
    }

    /// Configure merge mode for a single channel.
    pub fn set_merge_mode(&mut self, channel: u16, mode: MergeMode) {
        if (channel as usize) < 512 {
            self.merge_mode[channel as usize] = mode;
        }
    }

    /// Set all channels to HTP mode.
    pub fn set_all_htp(&mut self) {
        self.merge_mode.fill(MergeMode::Htp);
    }

    /// Set all channels to LTP mode.
    pub fn set_all_ltp(&mut self) {
        self.merge_mode.fill(MergeMode::Ltp);
    }

    /// Merge all sources into the output universe and return it.
    pub fn compute(&mut self) -> &DmxUniverse {
        self.output.clear();

        for i in 0..512u16 {
            let idx = i as usize;
            match self.merge_mode[idx] {
                MergeMode::Htp => {
                    let mut max = 0u8;
                    for src in self.sources.values() {
                        max = max.max(src.get(i).unwrap_or(0));
                    }
                    let _ = self.output.set(i, max);
                }
                MergeMode::Ltp => {
                    // Find the most recently updated source for this channel
                    let mut best_seq = 0u64;
                    let mut best_val = 0u8;
                    for (&(ch, _), entry) in &self.ltp_state {
                        if ch == i && entry.sequence > best_seq {
                            best_seq = entry.sequence;
                            best_val = entry.value;
                        }
                    }
                    let _ = self.output.set(i, best_val);
                }
            }
        }

        &self.output
    }
}

impl Default for OutputMerger {
    fn default() -> Self {
        Self::new()
    }
}