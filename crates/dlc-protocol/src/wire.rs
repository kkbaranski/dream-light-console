use thiserror::Error;

pub const TAG_FADER_UPDATE: u8 = 0x01;
pub const TAG_GO_BUTTON: u8 = 0x02;
pub const TAG_BATCH_FADERS: u8 = 0x05;
pub const TAG_SUBSCRIBE: u8 = 0x10;
pub const TAG_UNSUBSCRIBE: u8 = 0x11;
pub const TAG_LOCK_ACQUIRE: u8 = 0x85;
pub const TAG_LOCK_RELEASE: u8 = 0x86;
pub const TAG_SYNC_REQUEST: u8 = 0xF0;

pub const TAG_DMX_PREVIEW: u8 = 0x80;
pub const TAG_DMX_DELTA: u8 = 0x81;
pub const TAG_STATE_SNAPSHOT: u8 = 0x82;
pub const TAG_CUE_FIRED: u8 = 0x83;
pub const TAG_FADER_ECHO: u8 = 0x84;
pub const TAG_LOCK_STATE: u8 = 0x87;

const FADER_UPDATE_PAYLOAD_LEN: usize = 5;
const GO_BUTTON_PAYLOAD_LEN: usize = 2;
const TOPIC_PAYLOAD_LEN: usize = 2;
const LOCK_PAYLOAD_LEN: usize = 5;
const DMX_PREVIEW_PAYLOAD_LEN: usize = 513;
const CUE_FIRED_PAYLOAD_LEN: usize = 10;
const FADER_ECHO_PAYLOAD_LEN: usize = 6;
const LOCK_STATE_PAYLOAD_LEN: usize = 6;

#[derive(Debug, Clone, PartialEq)]
pub struct FaderUpdate {
    pub fixture_id: u16,
    pub param: u8,
    pub value: u16,
}

#[derive(Debug, Clone, PartialEq)]
pub struct GoButton {
    pub cue_id: u16,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BatchFaders {
    pub updates: Vec<FaderUpdate>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ClientMessage {
    FaderUpdate(FaderUpdate),
    GoButton(GoButton),
    BatchFaders(BatchFaders),
    Subscribe { topic_id: u16 },
    Unsubscribe { topic_id: u16 },
    LockAcquire { entity_type: u8, entity_id: u32 },
    LockRelease { entity_type: u8, entity_id: u32 },
    SyncRequest,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ServerMessage {
    DmxPreview { universe: u8, data: Vec<u8> },
    DmxDelta { changes: Vec<(u16, u8)> },
    StateSnapshot { payload: Vec<u8> },
    CueFired { cue_id: u16, timestamp: u64 },
    FaderEcho { user_id: u8, fixture_id: u16, param: u8, value: u16 },
    LockState { entity_type: u8, entity_id: u32, holder: u8 },
}

#[derive(Debug, Error)]
pub enum ProtocolError {
    #[error("insufficient data: expected {expected} bytes, got {actual}")]
    InsufficientData { expected: usize, actual: usize },
    #[error("unknown message type: 0x{0:02x}")]
    UnknownMessageType(u8),
    #[error("invalid payload for message type 0x{msg_type:02x}: {reason}")]
    InvalidPayload { msg_type: u8, reason: String },
}

fn require_len(data: &[u8], expected: usize, msg_type: u8) -> Result<(), ProtocolError> {
    if data.len() < expected {
        return Err(ProtocolError::InsufficientData {
            expected,
            actual: data.len(),
        });
    }
    if data.len() > expected {
        return Err(ProtocolError::InvalidPayload {
            msg_type,
            reason: format!("expected {} bytes, got {}", expected, data.len()),
        });
    }
    Ok(())
}

fn require_min_len(data: &[u8], minimum: usize) -> Result<(), ProtocolError> {
    if data.len() < minimum {
        return Err(ProtocolError::InsufficientData {
            expected: minimum,
            actual: data.len(),
        });
    }
    Ok(())
}

fn decode_fader_update(payload: &[u8]) -> FaderUpdate {
    FaderUpdate {
        fixture_id: u16::from_le_bytes([payload[0], payload[1]]),
        param: payload[2],
        value: u16::from_le_bytes([payload[3], payload[4]]),
    }
}

fn encode_fader_update(update: &FaderUpdate, buf: &mut Vec<u8>) {
    buf.extend_from_slice(&update.fixture_id.to_le_bytes());
    buf.push(update.param);
    buf.extend_from_slice(&update.value.to_le_bytes());
}

impl ClientMessage {
    pub fn decode(data: &[u8]) -> Result<Self, ProtocolError> {
        require_min_len(data, 1)?;
        let tag = data[0];
        let payload = &data[1..];

        match tag {
            TAG_FADER_UPDATE => {
                require_len(payload, FADER_UPDATE_PAYLOAD_LEN, tag)?;
                Ok(Self::FaderUpdate(decode_fader_update(payload)))
            }
            TAG_GO_BUTTON => {
                require_len(payload, GO_BUTTON_PAYLOAD_LEN, tag)?;
                Ok(Self::GoButton(GoButton {
                    cue_id: u16::from_le_bytes([payload[0], payload[1]]),
                }))
            }
            TAG_BATCH_FADERS => {
                require_min_len(payload, 1)?;
                let count = payload[0] as usize;
                let entries = &payload[1..];
                let expected_len = count * FADER_UPDATE_PAYLOAD_LEN;
                if entries.len() != expected_len {
                    return Err(ProtocolError::InvalidPayload {
                        msg_type: tag,
                        reason: format!(
                            "count={count} requires {expected_len} bytes, got {}",
                            entries.len()
                        ),
                    });
                }
                let updates = entries
                    .chunks_exact(FADER_UPDATE_PAYLOAD_LEN)
                    .map(decode_fader_update)
                    .collect();
                Ok(Self::BatchFaders(BatchFaders { updates }))
            }
            TAG_SUBSCRIBE => {
                require_len(payload, TOPIC_PAYLOAD_LEN, tag)?;
                Ok(Self::Subscribe {
                    topic_id: u16::from_le_bytes([payload[0], payload[1]]),
                })
            }
            TAG_UNSUBSCRIBE => {
                require_len(payload, TOPIC_PAYLOAD_LEN, tag)?;
                Ok(Self::Unsubscribe {
                    topic_id: u16::from_le_bytes([payload[0], payload[1]]),
                })
            }
            TAG_LOCK_ACQUIRE => {
                require_len(payload, LOCK_PAYLOAD_LEN, tag)?;
                Ok(Self::LockAcquire {
                    entity_type: payload[0],
                    entity_id: u32::from_le_bytes([
                        payload[1], payload[2], payload[3], payload[4],
                    ]),
                })
            }
            TAG_LOCK_RELEASE => {
                require_len(payload, LOCK_PAYLOAD_LEN, tag)?;
                Ok(Self::LockRelease {
                    entity_type: payload[0],
                    entity_id: u32::from_le_bytes([
                        payload[1], payload[2], payload[3], payload[4],
                    ]),
                })
            }
            TAG_SYNC_REQUEST => {
                require_len(payload, 0, tag)?;
                Ok(Self::SyncRequest)
            }
            _ => Err(ProtocolError::UnknownMessageType(tag)),
        }
    }

    pub fn encode(&self) -> Vec<u8> {
        match self {
            Self::FaderUpdate(update) => {
                let mut buf = vec![TAG_FADER_UPDATE];
                encode_fader_update(update, &mut buf);
                buf
            }
            Self::GoButton(go) => {
                let mut buf = vec![TAG_GO_BUTTON];
                buf.extend_from_slice(&go.cue_id.to_le_bytes());
                buf
            }
            Self::BatchFaders(batch) => {
                let mut buf = vec![TAG_BATCH_FADERS, batch.updates.len() as u8];
                for update in &batch.updates {
                    encode_fader_update(update, &mut buf);
                }
                buf
            }
            Self::Subscribe { topic_id } => {
                let mut buf = vec![TAG_SUBSCRIBE];
                buf.extend_from_slice(&topic_id.to_le_bytes());
                buf
            }
            Self::Unsubscribe { topic_id } => {
                let mut buf = vec![TAG_UNSUBSCRIBE];
                buf.extend_from_slice(&topic_id.to_le_bytes());
                buf
            }
            Self::LockAcquire { entity_type, entity_id } => {
                let mut buf = vec![TAG_LOCK_ACQUIRE, *entity_type];
                buf.extend_from_slice(&entity_id.to_le_bytes());
                buf
            }
            Self::LockRelease { entity_type, entity_id } => {
                let mut buf = vec![TAG_LOCK_RELEASE, *entity_type];
                buf.extend_from_slice(&entity_id.to_le_bytes());
                buf
            }
            Self::SyncRequest => vec![TAG_SYNC_REQUEST],
        }
    }
}

impl ServerMessage {
    pub fn encode(&self) -> Vec<u8> {
        match self {
            Self::DmxPreview { universe, data } => {
                let mut buf = Vec::with_capacity(1 + 1 + data.len());
                buf.push(TAG_DMX_PREVIEW);
                buf.push(*universe);
                buf.extend_from_slice(data);
                buf
            }
            Self::DmxDelta { changes } => {
                let mut buf = Vec::with_capacity(1 + 2 + changes.len() * 3);
                buf.push(TAG_DMX_DELTA);
                buf.extend_from_slice(&(changes.len() as u16).to_le_bytes());
                for &(channel, value) in changes {
                    buf.extend_from_slice(&channel.to_le_bytes());
                    buf.push(value);
                }
                buf
            }
            Self::StateSnapshot { payload } => {
                let mut buf = Vec::with_capacity(1 + payload.len());
                buf.push(TAG_STATE_SNAPSHOT);
                buf.extend_from_slice(payload);
                buf
            }
            Self::CueFired { cue_id, timestamp } => {
                let mut buf = Vec::with_capacity(11);
                buf.push(TAG_CUE_FIRED);
                buf.extend_from_slice(&cue_id.to_le_bytes());
                buf.extend_from_slice(&timestamp.to_le_bytes());
                buf
            }
            Self::FaderEcho { user_id, fixture_id, param, value } => {
                let mut buf = Vec::with_capacity(7);
                buf.push(TAG_FADER_ECHO);
                buf.push(*user_id);
                buf.extend_from_slice(&fixture_id.to_le_bytes());
                buf.push(*param);
                buf.extend_from_slice(&value.to_le_bytes());
                buf
            }
            Self::LockState { entity_type, entity_id, holder } => {
                let mut buf = Vec::with_capacity(7);
                buf.push(TAG_LOCK_STATE);
                buf.push(*entity_type);
                buf.extend_from_slice(&entity_id.to_le_bytes());
                buf.push(*holder);
                buf
            }
        }
    }

    pub fn decode(data: &[u8]) -> Result<Self, ProtocolError> {
        require_min_len(data, 1)?;
        let tag = data[0];
        let payload = &data[1..];

        match tag {
            TAG_DMX_PREVIEW => {
                require_len(payload, DMX_PREVIEW_PAYLOAD_LEN, tag)?;
                Ok(Self::DmxPreview {
                    universe: payload[0],
                    data: payload[1..].to_vec(),
                })
            }
            TAG_DMX_DELTA => {
                require_min_len(payload, 2)?;
                let count = u16::from_le_bytes([payload[0], payload[1]]) as usize;
                let entries = &payload[2..];
                let expected_len = count * 3;
                if entries.len() != expected_len {
                    return Err(ProtocolError::InvalidPayload {
                        msg_type: tag,
                        reason: format!(
                            "count={count} requires {expected_len} bytes, got {}",
                            entries.len()
                        ),
                    });
                }
                let changes = entries
                    .chunks_exact(3)
                    .map(|chunk| {
                        let channel = u16::from_le_bytes([chunk[0], chunk[1]]);
                        (channel, chunk[2])
                    })
                    .collect();
                Ok(Self::DmxDelta { changes })
            }
            TAG_STATE_SNAPSHOT => {
                Ok(Self::StateSnapshot {
                    payload: payload.to_vec(),
                })
            }
            TAG_CUE_FIRED => {
                require_len(payload, CUE_FIRED_PAYLOAD_LEN, tag)?;
                Ok(Self::CueFired {
                    cue_id: u16::from_le_bytes([payload[0], payload[1]]),
                    timestamp: u64::from_le_bytes([
                        payload[2], payload[3], payload[4], payload[5],
                        payload[6], payload[7], payload[8], payload[9],
                    ]),
                })
            }
            TAG_FADER_ECHO => {
                require_len(payload, FADER_ECHO_PAYLOAD_LEN, tag)?;
                Ok(Self::FaderEcho {
                    user_id: payload[0],
                    fixture_id: u16::from_le_bytes([payload[1], payload[2]]),
                    param: payload[3],
                    value: u16::from_le_bytes([payload[4], payload[5]]),
                })
            }
            TAG_LOCK_STATE => {
                require_len(payload, LOCK_STATE_PAYLOAD_LEN, tag)?;
                Ok(Self::LockState {
                    entity_type: payload[0],
                    entity_id: u32::from_le_bytes([
                        payload[1], payload[2], payload[3], payload[4],
                    ]),
                    holder: payload[5],
                })
            }
            _ => Err(ProtocolError::UnknownMessageType(tag)),
        }
    }
}
