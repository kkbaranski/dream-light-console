use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::EngineError;
use crate::universe::DmxUniverse;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum DmxEncoding {
    #[serde(rename = "linear8")]
    Linear8,
    #[serde(rename = "linear16")]
    Linear16,
    #[serde(rename = "rgbHex")]
    RgbHex,
    #[serde(rename = "step")]
    Step { steps: Vec<StepEntry> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepEntry {
    pub dmx_value: u8,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmxChannelDef {
    pub offset: u16,
    pub label: String,
    pub field: String,
    pub encoding: DmxEncoding,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixtureMapping {
    pub universe: u16,
    pub start_channel: u16,
    pub channels: Vec<DmxChannelDef>,
}

impl FixtureMapping {
    /// Given a scene object's state (as a JSON object), write the fixture's
    /// DMX channel values into the provided universe buffer.
    ///
    /// `start_channel` is 1-based (matching DMX convention); it is converted
    /// internally to a 0-based index before writing.
    pub fn apply_to_universe(
        &self,
        object_state: &serde_json::Map<String, Value>,
        universe: &mut DmxUniverse,
    ) -> Result<(), EngineError> {
        let base = self.start_channel.saturating_sub(1);

        for channel_def in &self.channels {
            let absolute_offset = base + channel_def.offset;
            let field_value = object_state.get(&channel_def.field);

            match &channel_def.encoding {
                DmxEncoding::Linear8 => {
                    let value = field_value
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u8;
                    universe.set(absolute_offset, value)?;
                }
                DmxEncoding::Linear16 => {
                    let value = field_value
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u16;
                    universe.set(absolute_offset, (value >> 8) as u8)?;
                    universe.set(absolute_offset + 1, (value & 0xFF) as u8)?;
                }
                DmxEncoding::RgbHex => {
                    let hex = field_value
                        .and_then(|v| v.as_str())
                        .unwrap_or("#000000");
                    let (r, g, b) = parse_hex_color(hex);
                    universe.set(absolute_offset, r)?;
                    universe.set(absolute_offset + 1, g)?;
                    universe.set(absolute_offset + 2, b)?;
                }
                DmxEncoding::Step { steps } => {
                    let index = field_value
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as usize;
                    let dmx_value = steps.get(index).map(|s| s.dmx_value).unwrap_or(0);
                    universe.set(absolute_offset, dmx_value)?;
                }
            }
        }

        Ok(())
    }

    /// Returns the number of DMX channels this fixture occupies, accounting
    /// for multi-channel encodings (linear16 = 2, rgbHex = 3).
    pub fn channel_count(&self) -> u16 {
        self.channels
            .iter()
            .map(|ch| {
                ch.offset
                    + match &ch.encoding {
                        DmxEncoding::Linear8 | DmxEncoding::Step { .. } => 1,
                        DmxEncoding::Linear16 => 2,
                        DmxEncoding::RgbHex => 3,
                    }
            })
            .max()
            .unwrap_or(0)
    }
}

fn parse_hex_color(hex: &str) -> (u8, u8, u8) {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 {
        return (0, 0, 0);
    }
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
    (r, g, b)
}