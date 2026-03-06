use dlc_engine::{DmxUniverse, InterpolationState};

#[test]
fn immediate_set_no_interpolation() {
    let mut state = InterpolationState::new();
    let mut universe = DmxUniverse::new();

    state.start_fade(0, 0, 200, 0, &mut universe);
    assert_eq!(universe.get(0).unwrap(), 200);
    assert!(!state.is_fading());
}

#[test]
fn same_value_no_interpolation() {
    let mut state = InterpolationState::new();
    let mut universe = DmxUniverse::new();
    universe.set(0, 100).unwrap();

    state.start_fade(0, 100, 100, 10, &mut universe);
    assert_eq!(universe.get(0).unwrap(), 100);
    assert!(!state.is_fading());
}

#[test]
fn linear_ramp_three_frames() {
    let mut state = InterpolationState::new();
    let mut universe = DmxUniverse::new();

    state.start_fade(0, 0, 255, 3, &mut universe);
    assert!(state.is_fading());

    // Tick 1: progress=1/3 → 255 * 0.333 ≈ 85
    state.tick(&mut universe);
    assert_eq!(universe.get(0).unwrap(), 85);

    // Tick 2: progress=2/3 → 255 * 0.667 ≈ 170
    state.tick(&mut universe);
    assert_eq!(universe.get(0).unwrap(), 170);

    // Tick 3: progress=1.0 → exact target 255
    state.tick(&mut universe);
    assert_eq!(universe.get(0).unwrap(), 255);
    assert!(!state.is_fading());
}

#[test]
fn fade_down() {
    let mut state = InterpolationState::new();
    let mut universe = DmxUniverse::new();
    universe.set(0, 200).unwrap();

    state.start_fade(0, 200, 0, 4, &mut universe);

    state.tick(&mut universe); // progress=0.25 → 200 * 0.75 = 150
    assert_eq!(universe.get(0).unwrap(), 150);

    state.tick(&mut universe); // progress=0.5 → 200 * 0.5 = 100
    assert_eq!(universe.get(0).unwrap(), 100);

    state.tick(&mut universe); // progress=0.75 → 200 * 0.25 = 50
    assert_eq!(universe.get(0).unwrap(), 50);

    state.tick(&mut universe); // progress=1.0 → exact target 0
    assert_eq!(universe.get(0).unwrap(), 0);
    assert!(!state.is_fading());
}

#[test]
fn fade_overrides_in_progress() {
    let mut state = InterpolationState::new();
    let mut universe = DmxUniverse::new();

    // Start fade 0→255 over 10 frames
    state.start_fade(0, 0, 255, 10, &mut universe);

    // Tick 3 times: progress=0.3, value ≈ 77 (255 * 0.3 = 76.5 → 77)
    state.tick(&mut universe);
    state.tick(&mut universe);
    state.tick(&mut universe);
    let mid_value = universe.get(0).unwrap();
    assert!((74..=80).contains(&mid_value), "mid_value was {mid_value}");

    // Override: fade from current value to 0 over 5 frames
    state.start_fade(0, mid_value, 0, 5, &mut universe);

    // Tick to completion
    for _ in 0..5 {
        state.tick(&mut universe);
    }
    assert_eq!(universe.get(0).unwrap(), 0);
    assert!(!state.is_fading());
}

#[test]
fn multiple_channels_independent() {
    let mut state = InterpolationState::new();
    let mut universe = DmxUniverse::new();

    state.start_fade(0, 0, 100, 3, &mut universe);
    state.start_fade(1, 0, 200, 6, &mut universe);

    // After 3 ticks: ch0 done, ch1 halfway
    for _ in 0..3 {
        state.tick(&mut universe);
    }
    assert_eq!(universe.get(0).unwrap(), 100);
    assert_eq!(universe.get(1).unwrap(), 100); // 200 * 0.5

    // After 3 more ticks: ch1 done
    for _ in 0..3 {
        state.tick(&mut universe);
    }
    assert_eq!(universe.get(1).unwrap(), 200);
    assert!(!state.is_fading());
}

#[test]
fn cancel_stops_at_current() {
    let mut state = InterpolationState::new();
    let mut universe = DmxUniverse::new();

    state.start_fade(0, 0, 255, 10, &mut universe);

    state.tick(&mut universe);
    state.tick(&mut universe);
    let val_at_cancel = universe.get(0).unwrap();

    state.cancel(0);
    assert!(!state.is_fading());

    // Further ticks should not change the value
    state.tick(&mut universe);
    assert_eq!(universe.get(0).unwrap(), val_at_cancel);
}

#[test]
fn is_fading_reflects_state() {
    let mut state = InterpolationState::new();
    let mut universe = DmxUniverse::new();

    assert!(!state.is_fading());

    state.start_fade(0, 0, 100, 2, &mut universe);
    assert!(state.is_fading());

    state.tick(&mut universe);
    assert!(state.is_fading());

    state.tick(&mut universe);
    assert!(!state.is_fading());
}

#[test]
fn out_of_range_channel_ignored() {
    let mut state = InterpolationState::new();
    let mut universe = DmxUniverse::new();

    state.start_fade(512, 0, 255, 3, &mut universe);
    assert!(!state.is_fading());

    state.cancel(600);
}

#[test]
fn single_frame_fade_completes_in_one_tick() {
    let mut state = InterpolationState::new();
    let mut universe = DmxUniverse::new();

    state.start_fade(0, 0, 128, 1, &mut universe);
    assert!(state.is_fading());

    state.tick(&mut universe);
    assert_eq!(universe.get(0).unwrap(), 128);
    assert!(!state.is_fading());
}
