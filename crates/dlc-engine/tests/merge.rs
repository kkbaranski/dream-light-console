use dlc_engine::{DmxUniverse, MergeMode, OutputMerger, SourceId, SourceType};

fn make_source(source_type: SourceType, id: u32) -> SourceId {
    SourceId {
        source_type,
        id,
    }
}

#[test]
fn htp_two_sources_takes_higher() {
    let mut merger = OutputMerger::new();

    let mut a = DmxUniverse::new();
    a.set(0, 100).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);

    let mut b = DmxUniverse::new();
    b.set(0, 200).unwrap();
    merger.update_source(make_source(SourceType::Fader, 2), &b);

    let out = merger.compute();
    assert_eq!(out.get(0).unwrap(), 200);
}

#[test]
fn htp_remove_higher_falls_to_lower() {
    let mut merger = OutputMerger::new();

    let mut a = DmxUniverse::new();
    a.set(0, 100).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);

    let mut b = DmxUniverse::new();
    b.set(0, 200).unwrap();
    merger.update_source(make_source(SourceType::Fader, 2), &b);

    merger.remove_source(&make_source(SourceType::Fader, 2));
    let out = merger.compute();
    assert_eq!(out.get(0).unwrap(), 100);
}

#[test]
fn htp_three_sources_max_wins() {
    let mut merger = OutputMerger::new();

    let mut a = DmxUniverse::new();
    a.set(0, 50).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);

    let mut b = DmxUniverse::new();
    b.set(0, 200).unwrap();
    merger.update_source(make_source(SourceType::Cue, 1), &b);

    let mut c = DmxUniverse::new();
    c.set(0, 150).unwrap();
    merger.update_source(make_source(SourceType::Effect, 1), &c);

    let out = merger.compute();
    assert_eq!(out.get(0).unwrap(), 200);
}

#[test]
fn empty_sources_all_zeros() {
    let mut merger = OutputMerger::new();
    let out = merger.compute();
    assert!(out.as_slice().iter().all(|&v| v == 0));
}

#[test]
fn htp_multiple_channels_independent() {
    let mut merger = OutputMerger::new();

    let mut a = DmxUniverse::new();
    a.set(0, 100).unwrap();
    a.set(1, 200).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);

    let mut b = DmxUniverse::new();
    b.set(0, 200).unwrap();
    b.set(1, 50).unwrap();
    merger.update_source(make_source(SourceType::Fader, 2), &b);

    let out = merger.compute();
    assert_eq!(out.get(0).unwrap(), 200);
    assert_eq!(out.get(1).unwrap(), 200);
}

#[test]
fn htp_update_source_recalculates() {
    let mut merger = OutputMerger::new();

    let mut a = DmxUniverse::new();
    a.set(0, 200).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);

    assert_eq!(merger.compute().get(0).unwrap(), 200);

    // Lower the fader
    a.set(0, 50).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);

    assert_eq!(merger.compute().get(0).unwrap(), 50);
}

#[test]
fn ltp_latest_update_wins() {
    let mut merger = OutputMerger::new();
    merger.set_merge_mode(0, MergeMode::Ltp);

    let mut a = DmxUniverse::new();
    a.set(0, 100).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);

    let mut b = DmxUniverse::new();
    b.set(0, 200).unwrap();
    merger.update_source(make_source(SourceType::Fader, 2), &b);

    // Fader 2 was updated last → 200
    assert_eq!(merger.compute().get(0).unwrap(), 200);

    // Update fader 1 again → now it's latest
    a.set(0, 50).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);
    assert_eq!(merger.compute().get(0).unwrap(), 50);
}

#[test]
fn ltp_remove_latest_falls_to_previous() {
    let mut merger = OutputMerger::new();
    merger.set_merge_mode(0, MergeMode::Ltp);

    let mut a = DmxUniverse::new();
    a.set(0, 100).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);

    let mut b = DmxUniverse::new();
    b.set(0, 200).unwrap();
    merger.update_source(make_source(SourceType::Fader, 2), &b);

    merger.remove_source(&make_source(SourceType::Fader, 2));
    assert_eq!(merger.compute().get(0).unwrap(), 100);
}

#[test]
fn mixed_htp_and_ltp_channels() {
    let mut merger = OutputMerger::new();
    // ch0 = HTP (default), ch1 = LTP
    merger.set_merge_mode(1, MergeMode::Ltp);

    let mut a = DmxUniverse::new();
    a.set(0, 100).unwrap();
    a.set(1, 100).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);

    let mut b = DmxUniverse::new();
    b.set(0, 50).unwrap();
    b.set(1, 50).unwrap();
    merger.update_source(make_source(SourceType::Fader, 2), &b);

    let out = merger.compute();
    // HTP: max(100, 50) = 100
    assert_eq!(out.get(0).unwrap(), 100);
    // LTP: fader 2 was last → 50
    assert_eq!(out.get(1).unwrap(), 50);
}

#[test]
fn set_all_htp_and_ltp() {
    let mut merger = OutputMerger::new();
    merger.set_all_ltp();
    // Cannot access merge_mode directly from external tests, so verify behavior
    // Set two sources on ch0 and check LTP behavior
    let mut a = DmxUniverse::new();
    a.set(0, 100).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);

    let mut b = DmxUniverse::new();
    b.set(0, 50).unwrap();
    merger.update_source(make_source(SourceType::Fader, 2), &b);

    // LTP: fader 2 was last → 50 (not HTP which would be 100)
    assert_eq!(merger.compute().get(0).unwrap(), 50);

    merger.set_all_htp();
    // HTP: max(100, 50) = 100
    assert_eq!(merger.compute().get(0).unwrap(), 100);
}

#[test]
fn different_source_types() {
    let mut merger = OutputMerger::new();

    let mut fader = DmxUniverse::new();
    fader.set(0, 80).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &fader);

    let mut cue = DmxUniverse::new();
    cue.set(0, 120).unwrap();
    merger.update_source(make_source(SourceType::Cue, 1), &cue);

    let mut sub = DmxUniverse::new();
    sub.set(0, 200).unwrap();
    merger.update_source(make_source(SourceType::Submaster, 1), &sub);

    assert_eq!(merger.compute().get(0).unwrap(), 200);
}

#[test]
fn ltp_masked_update_only_bumps_masked_channels() {
    let mut merger = OutputMerger::new();
    merger.set_merge_mode(0, MergeMode::Ltp);
    merger.set_merge_mode(1, MergeMode::Ltp);

    // Source 1: set ch0=100, ch1=100
    let mut a = DmxUniverse::new();
    a.set(0, 100).unwrap();
    a.set(1, 100).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);

    // Source 2: set ch0=50, ch1=50, but only mask ch0
    let mut b = DmxUniverse::new();
    b.set(0, 50).unwrap();
    b.set(1, 50).unwrap();
    let mut mask = [false; 512];
    mask[0] = true;
    merger.update_source_masked(make_source(SourceType::Fader, 2), &b, &mask);

    let out = merger.compute();
    // ch0: LTP, fader 2 masked → 50
    assert_eq!(out.get(0).unwrap(), 50);
    // ch1: LTP, fader 2 NOT masked → fader 1 is latest → 100
    assert_eq!(out.get(1).unwrap(), 100);
}

#[test]
fn ltp_masked_does_not_affect_htp_channels() {
    let mut merger = OutputMerger::new();
    // ch0 = HTP (default), ch1 = LTP
    merger.set_merge_mode(1, MergeMode::Ltp);

    let mut a = DmxUniverse::new();
    a.set(0, 100).unwrap();
    a.set(1, 100).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);

    // Source 2: ch0=200, ch1=50, mask only ch1
    let mut b = DmxUniverse::new();
    b.set(0, 200).unwrap();
    b.set(1, 50).unwrap();
    let mut mask = [false; 512];
    mask[1] = true;
    merger.update_source_masked(make_source(SourceType::Fader, 2), &b, &mask);

    let out = merger.compute();
    // ch0: HTP, max(100, 200) = 200 (full universe stored regardless of mask)
    assert_eq!(out.get(0).unwrap(), 200);
    // ch1: LTP, fader 2 masked → 50
    assert_eq!(out.get(1).unwrap(), 50);
}

#[test]
fn ltp_masked_unchanged_value_no_bump() {
    let mut merger = OutputMerger::new();
    merger.set_merge_mode(0, MergeMode::Ltp);

    // Source 1: ch0=100
    let mut a = DmxUniverse::new();
    a.set(0, 100).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);

    // Source 2: ch0=200
    let mut b = DmxUniverse::new();
    b.set(0, 200).unwrap();
    merger.update_source(make_source(SourceType::Fader, 2), &b);

    // Source 2 is latest → 200
    assert_eq!(merger.compute().get(0).unwrap(), 200);

    // Source 1 masked update with SAME value (100) → no LTP bump
    let mask = [true; 512];
    merger.update_source_masked(make_source(SourceType::Fader, 1), &a, &mask);

    // Source 2 should still be latest → 200
    assert_eq!(merger.compute().get(0).unwrap(), 200);
}

#[test]
fn ltp_multiple_masked_updates_sequence() {
    let mut merger = OutputMerger::new();
    merger.set_merge_mode(0, MergeMode::Ltp);
    merger.set_merge_mode(1, MergeMode::Ltp);

    // Source 1: ch0=100, ch1=100
    let mut a = DmxUniverse::new();
    a.set(0, 100).unwrap();
    a.set(1, 100).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);

    // Source 2: mask only ch0
    let mut b = DmxUniverse::new();
    b.set(0, 50).unwrap();
    let mut mask0 = [false; 512];
    mask0[0] = true;
    merger.update_source_masked(make_source(SourceType::Fader, 2), &b, &mask0);

    // Source 3: mask only ch1
    let mut c = DmxUniverse::new();
    c.set(1, 75).unwrap();
    let mut mask1 = [false; 512];
    mask1[1] = true;
    merger.update_source_masked(make_source(SourceType::Effect, 1), &c, &mask1);

    let out = merger.compute();
    // ch0: source 2 latest → 50
    assert_eq!(out.get(0).unwrap(), 50);
    // ch1: source 3 latest → 75
    assert_eq!(out.get(1).unwrap(), 75);
}

#[test]
fn ltp_remove_masked_source_falls_to_previous() {
    let mut merger = OutputMerger::new();
    merger.set_merge_mode(0, MergeMode::Ltp);

    let mut a = DmxUniverse::new();
    a.set(0, 100).unwrap();
    merger.update_source(make_source(SourceType::Fader, 1), &a);

    // Masked update from source 2
    let mut b = DmxUniverse::new();
    b.set(0, 200).unwrap();
    let mask = [true; 512];
    merger.update_source_masked(make_source(SourceType::Fader, 2), &b, &mask);

    assert_eq!(merger.compute().get(0).unwrap(), 200);

    merger.remove_source(&make_source(SourceType::Fader, 2));
    assert_eq!(merger.compute().get(0).unwrap(), 100);
}
