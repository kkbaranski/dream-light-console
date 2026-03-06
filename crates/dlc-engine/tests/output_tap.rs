use dlc_engine::{DmxOutput, MockOutput, TapOutput};
use tokio::sync::mpsc;

#[test]
fn tap_forwards_to_inner() {
    let (tx, _rx) = mpsc::channel(16);
    let mut tap = TapOutput::new(Box::new(MockOutput::new()), tx);

    let mut data = [0u8; 512];
    data[0] = 42;
    tap.send_universe(1, &data).unwrap();
}

#[test]
fn tap_sends_frame_to_channel() {
    let (tx, mut rx) = mpsc::channel(16);
    let mut tap = TapOutput::new(Box::new(MockOutput::new()), tx);

    let mut data = [0u8; 512];
    data[0] = 99;
    tap.send_universe(1, &data).unwrap();

    let frame = rx.try_recv().unwrap();
    assert_eq!(frame.universe_id, 1);
    assert_eq!(frame.data[0], 99);
}

#[test]
fn tap_does_not_block_when_channel_full() {
    let (tx, _rx) = mpsc::channel(1);
    let mut tap = TapOutput::new(Box::new(MockOutput::new()), tx);

    // Fill channel
    tap.send_universe(1, &[0; 512]).unwrap();
    // Should not block or error — frame is silently dropped
    tap.send_universe(1, &[1; 512]).unwrap();
}

#[test]
fn tap_delegates_label() {
    let (tx, _rx) = mpsc::channel(1);
    let tap = TapOutput::new(Box::new(MockOutput::new()), tx);
    assert_eq!(tap.label(), "mock");
}
