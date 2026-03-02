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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn moving_head_mapping() -> FixtureMapping {
        FixtureMapping {
            universe: 1,
            start_channel: 1,
            channels: vec![
                DmxChannelDef {
                    offset: 0,
                    label: "Dimmer".into(),
                    field: "dimmer".into(),
                    encoding: DmxEncoding::Linear8,
                },
                DmxChannelDef {
                    offset: 1,
                    label: "Pan".into(),
                    field: "pan".into(),
                    encoding: DmxEncoding::Linear8,
                },
                DmxChannelDef {
                    offset: 2,
                    label: "Tilt".into(),
                    field: "tilt".into(),
                    encoding: DmxEncoding::Linear8,
                },
                DmxChannelDef {
                    offset: 3,
                    label: "Color (RGB)".into(),
                    field: "color".into(),
                    encoding: DmxEncoding::RgbHex,
                },
                DmxChannelDef {
                    offset: 6,
                    label: "Beam Angle".into(),
                    field: "coneAngle".into(),
                    encoding: DmxEncoding::Linear8,
                },
            ],
        }
    }

    #[test]
    fn fixture_mapper_moving_head_full_state() {
        let mapping = moving_head_mapping();
        let state = json!({
            "dimmer": 200,
            "pan": 128,
            "tilt": 64,
            "color": "#ff0000",
            "coneAngle": 15,
        });
        let mut universe = DmxUniverse::new();
        mapping
            .apply_to_universe(state.as_object().unwrap(), &mut universe)
            .unwrap();

        assert_eq!(universe.get(0).unwrap(), 200); // dimmer
        assert_eq!(universe.get(1).unwrap(), 128); // pan
        assert_eq!(universe.get(2).unwrap(), 64); // tilt
        assert_eq!(universe.get(3).unwrap(), 255); // red
        assert_eq!(universe.get(4).unwrap(), 0); // green
        assert_eq!(universe.get(5).unwrap(), 0); // blue
        assert_eq!(universe.get(6).unwrap(), 15); // beam angle
    }

    #[test]
    fn fixture_mapper_rgb_hex_parsing() {
        assert_eq!(parse_hex_color("#ff8040"), (255, 128, 64));
        assert_eq!(parse_hex_color("#000000"), (0, 0, 0));
        assert_eq!(parse_hex_color("#FFFFFF"), (255, 255, 255));
        assert_eq!(parse_hex_color("invalid"), (0, 0, 0));
        assert_eq!(parse_hex_color("#abc"), (0, 0, 0)); // wrong length
        assert_eq!(parse_hex_color(""), (0, 0, 0));
        assert_eq!(parse_hex_color("#1a2b3c"), (26, 43, 60));
    }

    #[test]
    fn fixture_mapper_start_channel_offset() {
        let mapping = FixtureMapping {
            universe: 1,
            start_channel: 10,
            channels: vec![DmxChannelDef {
                offset: 0,
                label: "Dimmer".into(),
                field: "dimmer".into(),
                encoding: DmxEncoding::Linear8,
            }],
        };
        let state = json!({ "dimmer": 255 });
        let mut universe = DmxUniverse::new();
        mapping
            .apply_to_universe(state.as_object().unwrap(), &mut universe)
            .unwrap();
        assert_eq!(universe.get(9).unwrap(), 255); // channel 10 → index 9
    }

    #[test]
    fn fixture_mapper_missing_field_defaults_to_zero() {
        let mapping = moving_head_mapping();
        let state = json!({});
        let mut universe = DmxUniverse::new();
        mapping
            .apply_to_universe(state.as_object().unwrap(), &mut universe)
            .unwrap();
        assert_eq!(universe.get(0).unwrap(), 0); // missing dimmer → 0
        assert_eq!(universe.get(3).unwrap(), 0); // missing color → black R
        assert_eq!(universe.get(4).unwrap(), 0); // missing color → black G
        assert_eq!(universe.get(5).unwrap(), 0); // missing color → black B
    }

    #[test]
    fn fixture_mapper_step_encoding() {
        let mapping = FixtureMapping {
            universe: 1,
            start_channel: 1,
            channels: vec![DmxChannelDef {
                offset: 0,
                label: "Color Wheel".into(),
                field: "colorWheelIndex".into(),
                encoding: DmxEncoding::Step {
                    steps: vec![
                        StepEntry {
                            dmx_value: 0,
                            label: "White".into(),
                        },
                        StepEntry {
                            dmx_value: 32,
                            label: "Red".into(),
                        },
                        StepEntry {
                            dmx_value: 64,
                            label: "Blue".into(),
                        },
                    ],
                },
            }],
        };
        let state = json!({ "colorWheelIndex": 2 });
        let mut universe = DmxUniverse::new();
        mapping
            .apply_to_universe(state.as_object().unwrap(), &mut universe)
            .unwrap();
        assert_eq!(universe.get(0).unwrap(), 64); // Blue
    }

    #[test]
    fn fixture_mapper_step_out_of_range_defaults_to_zero() {
        let mapping = FixtureMapping {
            universe: 1,
            start_channel: 1,
            channels: vec![DmxChannelDef {
                offset: 0,
                label: "Color Wheel".into(),
                field: "colorWheelIndex".into(),
                encoding: DmxEncoding::Step {
                    steps: vec![StepEntry {
                        dmx_value: 42,
                        label: "Only".into(),
                    }],
                },
            }],
        };
        let state = json!({ "colorWheelIndex": 99 });
        let mut universe = DmxUniverse::new();
        mapping
            .apply_to_universe(state.as_object().unwrap(), &mut universe)
            .unwrap();
        assert_eq!(universe.get(0).unwrap(), 0); // out of range → 0
    }

    #[test]
    fn fixture_mapper_linear16_encoding() {
        let mapping = FixtureMapping {
            universe: 1,
            start_channel: 1,
            channels: vec![DmxChannelDef {
                offset: 0,
                label: "Pan Fine".into(),
                field: "pan".into(),
                encoding: DmxEncoding::Linear16,
            }],
        };
        let state = json!({ "pan": 32768 }); // 0x8000
        let mut universe = DmxUniverse::new();
        mapping
            .apply_to_universe(state.as_object().unwrap(), &mut universe)
            .unwrap();
        assert_eq!(universe.get(0).unwrap(), 128); // coarse: 0x80
        assert_eq!(universe.get(1).unwrap(), 0); // fine: 0x00
    }

    #[test]
    fn fixture_mapper_linear16_full_range() {
        let mapping = FixtureMapping {
            universe: 1,
            start_channel: 1,
            channels: vec![DmxChannelDef {
                offset: 0,
                label: "Pan".into(),
                field: "pan".into(),
                encoding: DmxEncoding::Linear16,
            }],
        };
        // 0xFFFF = 65535
        let state = json!({ "pan": 65535 });
        let mut universe = DmxUniverse::new();
        mapping
            .apply_to_universe(state.as_object().unwrap(), &mut universe)
            .unwrap();
        assert_eq!(universe.get(0).unwrap(), 255); // coarse: 0xFF
        assert_eq!(universe.get(1).unwrap(), 255); // fine: 0xFF

        // 0x1234 = 4660
        let state2 = json!({ "pan": 4660 });
        let mut universe2 = DmxUniverse::new();
        mapping
            .apply_to_universe(state2.as_object().unwrap(), &mut universe2)
            .unwrap();
        assert_eq!(universe2.get(0).unwrap(), 0x12); // coarse
        assert_eq!(universe2.get(1).unwrap(), 0x34); // fine
    }

    #[test]
    fn fixture_mapper_channel_count() {
        let mapping = moving_head_mapping();
        // offsets: 0(1), 1(1), 2(1), 3(3=rgbHex), 6(1) → max is 6+1=7
        assert_eq!(mapping.channel_count(), 7);
    }

    #[test]
    fn fixture_mapper_channel_count_with_linear16() {
        let mapping = FixtureMapping {
            universe: 1,
            start_channel: 1,
            channels: vec![DmxChannelDef {
                offset: 0,
                label: "Pan".into(),
                field: "pan".into(),
                encoding: DmxEncoding::Linear16,
            }],
        };
        assert_eq!(mapping.channel_count(), 2);
    }

    #[test]
    fn fixture_mapper_deserialize_from_json() {
        let json_str = r#"{
            "universe": 1,
            "start_channel": 1,
            "channels": [
                {
                    "offset": 0,
                    "label": "Dimmer",
                    "field": "dimmer",
                    "encoding": { "kind": "linear8" }
                },
                {
                    "offset": 1,
                    "label": "Color",
                    "field": "color",
                    "encoding": { "kind": "rgbHex" }
                },
                {
                    "offset": 4,
                    "label": "Gobo",
                    "field": "goboIndex",
                    "encoding": {
                        "kind": "step",
                        "steps": [
                            { "dmx_value": 0, "label": "Open" },
                            { "dmx_value": 10, "label": "Star" }
                        ]
                    }
                }
            ]
        }"#;
        let mapping: FixtureMapping = serde_json::from_str(json_str).unwrap();
        assert_eq!(mapping.universe, 1);
        assert_eq!(mapping.channels.len(), 3);

        let state = json!({ "dimmer": 128, "color": "#00ff00", "goboIndex": 1 });
        let mut universe = DmxUniverse::new();
        mapping
            .apply_to_universe(state.as_object().unwrap(), &mut universe)
            .unwrap();
        assert_eq!(universe.get(0).unwrap(), 128); // dimmer
        assert_eq!(universe.get(1).unwrap(), 0); // R
        assert_eq!(universe.get(2).unwrap(), 255); // G
        assert_eq!(universe.get(3).unwrap(), 0); // B
        assert_eq!(universe.get(4).unwrap(), 10); // Gobo: Star
    }

    #[test]
    fn fixture_mapper_multiple_fixtures_same_universe() {
        let fixture_a = FixtureMapping {
            universe: 1,
            start_channel: 1,
            channels: vec![DmxChannelDef {
                offset: 0,
                label: "Dimmer".into(),
                field: "dimmer".into(),
                encoding: DmxEncoding::Linear8,
            }],
        };
        let fixture_b = FixtureMapping {
            universe: 1,
            start_channel: 10,
            channels: vec![DmxChannelDef {
                offset: 0,
                label: "Dimmer".into(),
                field: "dimmer".into(),
                encoding: DmxEncoding::Linear8,
            }],
        };

        let mut universe = DmxUniverse::new();
        let state_a = json!({ "dimmer": 100 });
        let state_b = json!({ "dimmer": 200 });
        fixture_a
            .apply_to_universe(state_a.as_object().unwrap(), &mut universe)
            .unwrap();
        fixture_b
            .apply_to_universe(state_b.as_object().unwrap(), &mut universe)
            .unwrap();

        assert_eq!(universe.get(0).unwrap(), 100); // fixture A at ch 1
        assert_eq!(universe.get(9).unwrap(), 200); // fixture B at ch 10
    }

    #[test]
    fn fixture_mapper_channel_out_of_range_returns_error() {
        let mapping = FixtureMapping {
            universe: 1,
            start_channel: 512, // 0-based index 511
            channels: vec![DmxChannelDef {
                offset: 1, // absolute = 512 → out of range
                label: "Bad".into(),
                field: "val".into(),
                encoding: DmxEncoding::Linear8,
            }],
        };
        let state = json!({ "val": 42 });
        let mut universe = DmxUniverse::new();
        let result = mapping.apply_to_universe(state.as_object().unwrap(), &mut universe);
        assert!(result.is_err());
    }
}
