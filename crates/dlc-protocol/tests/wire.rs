use dlc_protocol::*;
use dlc_protocol::wire::*;

fn roundtrip_client(msg: &ClientMessage) {
    let encoded = msg.encode();
    let decoded = ClientMessage::decode(&encoded).unwrap();
    assert_eq!(&decoded, msg);
}

fn roundtrip_server(msg: &ServerMessage) {
    let encoded = msg.encode();
    let decoded = ServerMessage::decode(&encoded).unwrap();
    assert_eq!(&decoded, msg);
}

#[test]
fn fader_update_roundtrip() {
    let msg = ClientMessage::FaderUpdate(FaderUpdate {
        fixture_id: 42,
        param: 3,
        value: 1000,
    });
    roundtrip_client(&msg);

    let encoded = msg.encode();
    assert_eq!(encoded.len(), 6);
    assert_eq!(encoded[0], TAG_FADER_UPDATE);
}

#[test]
fn go_button_roundtrip() {
    let msg = ClientMessage::GoButton(GoButton { cue_id: 0xABCD });
    roundtrip_client(&msg);

    let encoded = msg.encode();
    assert_eq!(encoded.len(), 3);
}

#[test]
fn batch_faders_empty() {
    let msg = ClientMessage::BatchFaders(BatchFaders { updates: vec![] });
    roundtrip_client(&msg);

    let encoded = msg.encode();
    assert_eq!(encoded.len(), 2);
    assert_eq!(encoded[1], 0);
}

#[test]
fn batch_faders_single() {
    let msg = ClientMessage::BatchFaders(BatchFaders {
        updates: vec![FaderUpdate {
            fixture_id: 1,
            param: 0,
            value: 255,
        }],
    });
    roundtrip_client(&msg);
}

#[test]
fn batch_faders_ten_updates() {
    let updates: Vec<FaderUpdate> = (0..10)
        .map(|i| FaderUpdate {
            fixture_id: i,
            param: (i % 5) as u8,
            value: i * 100,
        })
        .collect();
    let msg = ClientMessage::BatchFaders(BatchFaders { updates });
    roundtrip_client(&msg);

    let encoded = msg.encode();
    assert_eq!(encoded[1], 10);
    assert_eq!(encoded.len(), 2 + 10 * 5);
}

#[test]
fn subscribe_roundtrip() {
    let msg = ClientMessage::Subscribe { topic_id: 500 };
    roundtrip_client(&msg);
}

#[test]
fn unsubscribe_roundtrip() {
    let msg = ClientMessage::Unsubscribe { topic_id: 123 };
    roundtrip_client(&msg);
}

#[test]
fn lock_acquire_roundtrip() {
    let msg = ClientMessage::LockAcquire {
        entity_type: 2,
        entity_id: 0x12345678,
    };
    roundtrip_client(&msg);
}

#[test]
fn lock_release_roundtrip() {
    let msg = ClientMessage::LockRelease {
        entity_type: 1,
        entity_id: 99,
    };
    roundtrip_client(&msg);
}

#[test]
fn sync_request_roundtrip() {
    let msg = ClientMessage::SyncRequest;
    roundtrip_client(&msg);

    let encoded = msg.encode();
    assert_eq!(encoded.len(), 1);
}

#[test]
fn dmx_preview_roundtrip() {
    let data = vec![0u8; DMX_CHANNELS_PER_UNIVERSE];
    let msg = ServerMessage::DmxPreview { universe: 3, data };
    roundtrip_server(&msg);

    let encoded = msg.encode();
    assert_eq!(encoded.len(), 514);
}

#[test]
fn dmx_delta_empty() {
    let msg = ServerMessage::DmxDelta { changes: vec![] };
    roundtrip_server(&msg);
}

#[test]
fn dmx_delta_multiple_changes() {
    let msg = ServerMessage::DmxDelta {
        changes: vec![(0, 255), (100, 128), (511, 0)],
    };
    roundtrip_server(&msg);

    let encoded = msg.encode();
    assert_eq!(encoded.len(), 1 + 2 + 3 * 3);
}

#[test]
fn state_snapshot_roundtrip() {
    let msg = ServerMessage::StateSnapshot {
        payload: vec![1, 2, 3, 4, 5],
    };
    roundtrip_server(&msg);
}

#[test]
fn cue_fired_roundtrip() {
    let msg = ServerMessage::CueFired {
        cue_id: 42,
        timestamp: 1_700_000_000_000,
    };
    roundtrip_server(&msg);

    let encoded = msg.encode();
    assert_eq!(encoded.len(), 11);
}

#[test]
fn fader_echo_roundtrip() {
    let msg = ServerMessage::FaderEcho {
        user_id: 7,
        fixture_id: 200,
        param: 2,
        value: 32000,
    };
    roundtrip_server(&msg);

    let encoded = msg.encode();
    assert_eq!(encoded.len(), 7);
}

#[test]
fn lock_state_roundtrip() {
    let msg = ServerMessage::LockState {
        entity_type: 1,
        entity_id: 0xDEADBEEF,
        holder: 3,
    };
    roundtrip_server(&msg);

    let encoded = msg.encode();
    assert_eq!(encoded.len(), 7);
}

#[test]
fn error_empty_data() {
    let result = ClientMessage::decode(&[]);
    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        ProtocolError::InsufficientData { expected: 1, actual: 0 }
    ));
}

#[test]
fn error_unknown_tag() {
    let result = ClientMessage::decode(&[0xFF]);
    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        ProtocolError::UnknownMessageType(0xFF)
    ));
}

#[test]
fn error_truncated_fader_update() {
    let result = ClientMessage::decode(&[TAG_FADER_UPDATE, 0x01, 0x00]);
    assert!(result.is_err());
}

#[test]
fn error_truncated_go_button() {
    let result = ClientMessage::decode(&[TAG_GO_BUTTON, 0x01]);
    assert!(result.is_err());
}

#[test]
fn error_truncated_lock() {
    let result = ClientMessage::decode(&[TAG_LOCK_ACQUIRE, 0x01, 0x02]);
    assert!(result.is_err());
}

#[test]
fn error_batch_faders_wrong_count() {
    let result = ClientMessage::decode(&[TAG_BATCH_FADERS, 2, 0, 0, 0, 0, 0]);
    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        ProtocolError::InvalidPayload { msg_type: TAG_BATCH_FADERS, .. }
    ));
}

#[test]
fn error_server_unknown_tag() {
    let result = ServerMessage::decode(&[0x00]);
    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        ProtocolError::UnknownMessageType(0x00)
    ));
}

#[test]
fn error_dmx_preview_truncated() {
    let result = ServerMessage::decode(&[TAG_DMX_PREVIEW, 0x01]);
    assert!(result.is_err());
}

#[test]
fn error_cue_fired_truncated() {
    let result = ServerMessage::decode(&[TAG_CUE_FIRED, 0x01, 0x00]);
    assert!(result.is_err());
}

#[test]
fn little_endian_encoding() {
    let msg = ClientMessage::FaderUpdate(FaderUpdate {
        fixture_id: 0x0102,
        param: 0x03,
        value: 0x0405,
    });
    let encoded = msg.encode();
    assert_eq!(encoded[1], 0x02);
    assert_eq!(encoded[2], 0x01);
    assert_eq!(encoded[3], 0x03);
    assert_eq!(encoded[4], 0x05);
    assert_eq!(encoded[5], 0x04);
}
