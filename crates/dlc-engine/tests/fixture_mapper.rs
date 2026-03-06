use dlc_engine::{DmxChannelDef, DmxEncoding, DmxUniverse, FixtureMapping, StepEntry};
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
