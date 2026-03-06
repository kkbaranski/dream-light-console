use dlc_engine::*;
use dlc_protocol::EngineCommand;
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

/// Wrap MockOutput in Arc<Mutex<>> so we can inspect it after the engine runs.
struct SharedMockOutput {
    inner: Arc<Mutex<MockOutput>>,
}

impl SharedMockOutput {
    fn new() -> (Self, Arc<Mutex<MockOutput>>) {
        let inner = Arc::new(Mutex::new(MockOutput::new()));
        (Self { inner: inner.clone() }, inner)
    }
}

impl DmxOutput for SharedMockOutput {
    fn send_universe(
        &mut self,
        universe_id: u16,
        data: &[u8; 512],
    ) -> Result<(), EngineError> {
        self.inner.lock().unwrap().send_universe(universe_id, data)
    }

    fn label(&self) -> &str {
        "shared-mock"
    }
}

#[test]
fn engine_outputs_at_44hz() {
    let (output, mock) = SharedMockOutput::new();
    let handle = EngineHandle::start(Box::new(output), "shared-mock");

    // Set a channel so the engine has a universe to output
    handle
        .send(EngineCommand::SetChannel {
            universe: 1,
            channel: 0,
            value: 1,
        })
        .unwrap();

    // Wait ~100ms → expect ~4 ticks (44Hz × 0.1s ≈ 4.4)
    std::thread::sleep(Duration::from_millis(100));
    handle.shutdown().unwrap();

    let mock = mock.lock().unwrap();
    let count = mock.send_count();
    // Allow tolerance: 3..=6
    assert!(
        (3..=6).contains(&count),
        "expected ~4 frames in 100ms at 44Hz, got {count}"
    );
}

#[test]
fn set_channel_reflected_in_output() {
    let (output, mock) = SharedMockOutput::new();
    let handle = EngineHandle::start(Box::new(output), "shared-mock");

    handle
        .send(EngineCommand::SetChannel {
            universe: 1,
            channel: 0,
            value: 255,
        })
        .unwrap();

    // Wait for at least 2 ticks
    std::thread::sleep(Duration::from_millis(60));
    handle.shutdown().unwrap();

    let mock = mock.lock().unwrap();
    let frame = mock.last_frame(1).expect("expected at least one frame");
    assert_eq!(frame[0], 255);
}

#[test]
fn set_universe_replaces_all_channels() {
    let (output, mock) = SharedMockOutput::new();
    let handle = EngineHandle::start(Box::new(output), "shared-mock");

    handle
        .send(EngineCommand::SetUniverse {
            universe: 1,
            data: Box::new([128; 512]),
        })
        .unwrap();

    std::thread::sleep(Duration::from_millis(60));
    handle.shutdown().unwrap();

    let mock = mock.lock().unwrap();
    let frame = mock.last_frame(1).expect("expected at least one frame");
    assert!(frame.iter().all(|&v| v == 128));
}

#[test]
fn shutdown_stops_engine() {
    let (output, _mock) = SharedMockOutput::new();
    let handle = EngineHandle::start(Box::new(output), "shared-mock");

    let start = Instant::now();
    handle.shutdown().unwrap();
    let elapsed = start.elapsed();

    // Should join within one tick interval + margin
    assert!(
        elapsed < Duration::from_millis(100),
        "shutdown took too long: {elapsed:?}"
    );
}

#[test]
fn multiple_universes() {
    let (output, mock) = SharedMockOutput::new();
    let handle = EngineHandle::start(Box::new(output), "shared-mock");

    handle
        .send(EngineCommand::SetChannel {
            universe: 1,
            channel: 0,
            value: 100,
        })
        .unwrap();
    handle
        .send(EngineCommand::SetChannel {
            universe: 2,
            channel: 0,
            value: 200,
        })
        .unwrap();

    std::thread::sleep(Duration::from_millis(60));
    handle.shutdown().unwrap();

    let mock = mock.lock().unwrap();
    assert_eq!(mock.last_frame(1).unwrap()[0], 100);
    assert_eq!(mock.last_frame(2).unwrap()[0], 200);
}

#[test]
fn engine_handle_send_after_shutdown_fails() {
    let (output, _mock) = SharedMockOutput::new();
    let handle = EngineHandle::start(Box::new(output), "shared-mock");

    let sender = handle.sender();
    handle.shutdown().unwrap();

    let result = sender.try_send(EngineCommand::Shutdown);
    assert!(result.is_err());
}

#[test]
fn commands_drain_non_blocking() {
    let (output, mock) = SharedMockOutput::new();
    let handle = EngineHandle::start(Box::new(output), "shared-mock");

    // Send 1000 commands rapidly — bounded channel may reject some if full,
    // but the engine should still produce frames from what it received
    for i in 0..1000u16 {
        let _ = handle.send(EngineCommand::SetChannel {
            universe: 1,
            channel: (i % 512),
            value: (i % 256) as u8,
        });
    }

    // Wait for engine to process
    std::thread::sleep(Duration::from_millis(60));
    handle.shutdown().unwrap();

    let mock = mock.lock().unwrap();
    assert!(mock.send_count() > 0, "engine should have produced frames");
}

#[test]
fn engine_handle_is_send_and_sync() {
    fn assert_send_sync<T: Send + Sync>() {}
    assert_send_sync::<EngineHandle>();
}

#[test]
fn hold_last_look_continues_after_sender_dropped() {
    let (output, mock) = SharedMockOutput::new();
    let (tx, rx) = mpsc::sync_channel(1024);

    // Set a value then drop the sender
    tx.send(EngineCommand::SetChannel {
        universe: 1,
        channel: 0,
        value: 42,
    })
    .unwrap();
    drop(tx);

    // Start engine — all senders already dropped
    let _thread = std::thread::spawn(move || {
        let mut engine = Engine::new(
            Box::new(output),
            Arc::new(Mutex::new(None)),
            rx,
        );
        engine.run();
    });

    // Wait for several ticks (44Hz → ~150ms ≈ 6-7 frames)
    std::thread::sleep(Duration::from_millis(150));

    let mock = mock.lock().unwrap();
    let count = mock.send_count();
    assert!(
        count >= 4,
        "expected continued output in hold-last-look, got {count} frames"
    );
    let frame = mock.last_frame(1).expect("expected frames for universe 1");
    assert_eq!(frame[0], 42, "channel 0 should hold its last value");
}

#[test]
fn hold_last_look_preserves_all_channels() {
    let (output, mock) = SharedMockOutput::new();
    let (tx, rx) = mpsc::sync_channel(1024);

    // Set multiple channels
    tx.send(EngineCommand::SetUniverse {
        universe: 1,
        data: Box::new([128; 512]),
    })
    .unwrap();
    drop(tx);

    let _thread = std::thread::spawn(move || {
        let mut engine = Engine::new(
            Box::new(output),
            Arc::new(Mutex::new(None)),
            rx,
        );
        engine.run();
    });

    std::thread::sleep(Duration::from_millis(150));

    let mock = mock.lock().unwrap();
    let frame = mock.last_frame(1).expect("expected frames");
    assert!(
        frame.iter().all(|&v| v == 128),
        "all channels should hold their last value"
    );
}

#[test]
fn hold_last_look_shutdown_still_works() {
    let (output, _mock) = SharedMockOutput::new();
    let handle = EngineHandle::start(Box::new(output), "shared-mock");

    handle
        .send(EngineCommand::SetChannel {
            universe: 1,
            channel: 0,
            value: 100,
        })
        .unwrap();

    std::thread::sleep(Duration::from_millis(50));

    // Explicit Shutdown should still stop the engine cleanly
    let start = Instant::now();
    handle.shutdown().unwrap();
    let elapsed = start.elapsed();

    assert!(
        elapsed < Duration::from_millis(100),
        "shutdown should still work promptly: {elapsed:?}"
    );
}

#[test]
fn drop_shuts_down_engine() {
    let (output, _mock) = SharedMockOutput::new();
    let handle = EngineHandle::start(Box::new(output), "shared-mock");

    // Dropping the handle should send Shutdown and join the thread
    let start = Instant::now();
    drop(handle);
    let elapsed = start.elapsed();

    assert!(
        elapsed < Duration::from_millis(100),
        "drop should shut down engine promptly: {elapsed:?}"
    );
}

#[test]
fn master_dimmer_scales_output() {
    let (output, mock) = SharedMockOutput::new();
    let handle = EngineHandle::start(Box::new(output), "shared-mock");

    handle
        .send(EngineCommand::SetChannel {
            universe: 1,
            channel: 0,
            value: 200,
        })
        .unwrap();
    // Set master dimmer to 50% (128/255)
    handle
        .send(EngineCommand::SetMasterDimmer { value: 128 })
        .unwrap();

    std::thread::sleep(Duration::from_millis(60));
    handle.shutdown().unwrap();

    let mock = mock.lock().unwrap();
    let frame = mock.last_frame(1).expect("expected at least one frame");
    // 200 * 128 / 255 ≈ 100
    let expected = ((200u16 * 128) / 255) as u8;
    assert_eq!(frame[0], expected);
}

#[test]
fn master_dimmer_full_passes_through() {
    let (output, mock) = SharedMockOutput::new();
    let handle = EngineHandle::start(Box::new(output), "shared-mock");

    handle
        .send(EngineCommand::SetChannel {
            universe: 1,
            channel: 0,
            value: 200,
        })
        .unwrap();
    // Master dimmer defaults to 255 (full)

    std::thread::sleep(Duration::from_millis(60));
    handle.shutdown().unwrap();

    let mock = mock.lock().unwrap();
    let frame = mock.last_frame(1).expect("expected at least one frame");
    assert_eq!(frame[0], 200);
}

#[test]
fn blackout_overrides_all_output() {
    let (output, mock) = SharedMockOutput::new();
    let handle = EngineHandle::start(Box::new(output), "shared-mock");

    handle
        .send(EngineCommand::SetChannel {
            universe: 1,
            channel: 0,
            value: 255,
        })
        .unwrap();
    handle
        .send(EngineCommand::Blackout { active: true })
        .unwrap();

    std::thread::sleep(Duration::from_millis(60));
    handle.shutdown().unwrap();

    let mock = mock.lock().unwrap();
    let frame = mock.last_frame(1).expect("expected at least one frame");
    assert!(
        frame.iter().all(|&v| v == 0),
        "blackout should zero all channels"
    );
}

#[test]
fn blackout_release_restores_output() {
    let (output, mock) = SharedMockOutput::new();
    let handle = EngineHandle::start(Box::new(output), "shared-mock");

    handle
        .send(EngineCommand::SetChannel {
            universe: 1,
            channel: 0,
            value: 255,
        })
        .unwrap();
    handle
        .send(EngineCommand::Blackout { active: true })
        .unwrap();

    std::thread::sleep(Duration::from_millis(40));

    handle
        .send(EngineCommand::Blackout { active: false })
        .unwrap();

    std::thread::sleep(Duration::from_millis(60));
    handle.shutdown().unwrap();

    let mock = mock.lock().unwrap();
    let frame = mock.last_frame(1).expect("expected at least one frame");
    assert_eq!(frame[0], 255, "blackout release should restore original values");
}

#[test]
fn bounded_channel_rejects_when_full() {
    // Create a channel with capacity 2
    let (tx, rx) = mpsc::sync_channel(2);
    // Fill it up without consuming
    tx.try_send(EngineCommand::SetMasterDimmer { value: 100 }).unwrap();
    tx.try_send(EngineCommand::SetMasterDimmer { value: 200 }).unwrap();
    // Third should fail
    let result = tx.try_send(EngineCommand::SetMasterDimmer { value: 255 });
    assert!(result.is_err());
    drop(rx);
}
