use std::sync::Arc;

use dlc_protocol::{EngineCommand, ENGINE_HZ};
use dlc_server::cue_executor::CueExecutor;
use dlc_server::fixture_types;

fn ms_to_frames(ms: i64) -> u32 {
    if ms <= 0 {
        return 0;
    }
    ((ms as u64 * ENGINE_HZ as u64) / 1000) as u32
}

async fn setup_executor_with_db() -> (CueExecutor, sqlx::SqlitePool, std::sync::mpsc::Receiver<EngineCommand>) {
    use sqlx::sqlite::SqlitePoolOptions;

    let db = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&db)
        .await
        .unwrap();
    sqlx::migrate!("./migrations").run(&db).await.unwrap();

    let fixture_types = Arc::new(fixture_types::load_embedded());
    let (engine_tx, engine_rx) = std::sync::mpsc::sync_channel(1024);
    let executor = CueExecutor::new(db.clone(), engine_tx, fixture_types);
    (executor, db, engine_rx)
}

/// Seed the DB with a stage, concert, cue list, and cues using scene_json.
/// Returns (cue_list_id, cue1_id, cue2_id).
async fn seed_fade_test_data(
    db: &sqlx::SqlitePool,
    cue1_fade_ms: i64,
    cue2_fade_ms: i64,
) -> (String, String, String) {
    // Create stage
    let stage_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO stages (id, name) VALUES (?, 'Test Stage')")
        .bind(&stage_id)
        .execute(db)
        .await
        .unwrap();

    // Create concert
    let concert_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO concerts (id, name, stage_id) VALUES (?, 'Test Concert', ?)")
        .bind(&concert_id)
        .bind(&stage_id)
        .execute(db)
        .await
        .unwrap();

    // Cue list
    let cue_list_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO cue_lists (id, concert_id, name) VALUES (?, ?, 'Test List')")
        .bind(&cue_list_id)
        .bind(&concert_id)
        .execute(db)
        .await
        .unwrap();

    // Cue 1: dimmer at 200
    let cue1_id = uuid::Uuid::new_v4().to_string();
    let scene1 = serde_json::json!({
        "fixtures": [{
            "fixture_type_id": "moving_head",
            "dmx_mode": "sevenChannel",
            "universe": 1,
            "dmx_address": 1,
            "values": {"dimmer": 200}
        }]
    });
    sqlx::query("INSERT INTO cues (id, cue_list_id, number, fade_time_ms, scene_json) VALUES (?, ?, 1.0, ?, ?)")
        .bind(&cue1_id)
        .bind(&cue_list_id)
        .bind(cue1_fade_ms)
        .bind(scene1.to_string())
        .execute(db)
        .await
        .unwrap();

    // Cue 2: dimmer at 50
    let cue2_id = uuid::Uuid::new_v4().to_string();
    let scene2 = serde_json::json!({
        "fixtures": [{
            "fixture_type_id": "moving_head",
            "dmx_mode": "sevenChannel",
            "universe": 1,
            "dmx_address": 1,
            "values": {"dimmer": 50}
        }]
    });
    sqlx::query("INSERT INTO cues (id, cue_list_id, number, fade_time_ms, scene_json) VALUES (?, ?, 2.0, ?, ?)")
        .bind(&cue2_id)
        .bind(&cue_list_id)
        .bind(cue2_fade_ms)
        .bind(scene2.to_string())
        .execute(db)
        .await
        .unwrap();

    (cue_list_id, cue1_id, cue2_id)
}

fn drain_fade_commands(rx: &std::sync::mpsc::Receiver<EngineCommand>) -> Vec<(u16, u16, u8, u32)> {
    let mut commands = Vec::new();
    while let Ok(cmd) = rx.try_recv() {
        if let EngineCommand::FadeChannel { universe, channel, target, frames } = cmd {
            commands.push((universe, channel, target, frames));
        }
    }
    commands
}

#[tokio::test]
async fn first_cue_uses_fade_for_changing_channels() {
    let (executor, db, rx) = setup_executor_with_db().await;
    let (cue_list_id, _, _) = seed_fade_test_data(&db, 3000, 1000).await;

    // Fire cue 1 (from zero → 200 = changing)
    executor.go(&cue_list_id).await.unwrap();

    let cmds = drain_fade_commands(&rx);
    assert!(!cmds.is_empty(), "expected FadeChannel commands");

    let fade_frames = ms_to_frames(3000);
    for &(_, _, target, frames) in &cmds {
        if target > 0 {
            assert_eq!(frames, fade_frames, "channel changing should use fade_frames");
        }
    }
}

#[tokio::test]
async fn second_cue_uses_fade_for_decreasing_channels() {
    let (executor, db, rx) = setup_executor_with_db().await;
    let (cue_list_id, _, _) = seed_fade_test_data(&db, 1000, 5000).await;

    // Fire cue 1 (0 → 200)
    executor.go(&cue_list_id).await.unwrap();
    drain_fade_commands(&rx);

    // Fire cue 2 (200 → 50 = decrease)
    executor.go(&cue_list_id).await.unwrap();

    let cmds = drain_fade_commands(&rx);
    assert!(!cmds.is_empty(), "expected FadeChannel commands");

    let fade_frames = ms_to_frames(5000);
    let dimmer_cmd = cmds.iter().find(|&&(_, ch, _, _)| ch == 0).unwrap();
    assert_eq!(dimmer_cmd.3, fade_frames, "dimmer going down should use fade_frames");
}

#[tokio::test]
async fn equal_value_uses_zero_frames() {
    let (executor, db, rx) = setup_executor_with_db().await;

    // Create stage + concert + cue list
    let stage_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO stages (id, name) VALUES (?, 'Stage')")
        .bind(&stage_id)
        .execute(&db)
        .await
        .unwrap();
    let concert_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO concerts (id, name, stage_id) VALUES (?, 'Concert', ?)")
        .bind(&concert_id)
        .bind(&stage_id)
        .execute(&db)
        .await
        .unwrap();
    let cue_list_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO cue_lists (id, concert_id, name) VALUES (?, ?, 'List')")
        .bind(&cue_list_id)
        .bind(&concert_id)
        .execute(&db)
        .await
        .unwrap();

    let scene = serde_json::json!({
        "fixtures": [{
            "fixture_type_id": "moving_head",
            "dmx_mode": "sevenChannel",
            "universe": 1,
            "dmx_address": 1,
            "values": {"dimmer": 128}
        }]
    });

    // Two cues with same scene but different fade times
    sqlx::query("INSERT INTO cues (id, cue_list_id, number, fade_time_ms, scene_json) VALUES (?, ?, 1.0, 1000, ?)")
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&cue_list_id)
        .bind(scene.to_string())
        .execute(&db)
        .await
        .unwrap();

    sqlx::query("INSERT INTO cues (id, cue_list_id, number, fade_time_ms, scene_json) VALUES (?, ?, 2.0, 5000, ?)")
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&cue_list_id)
        .bind(scene.to_string())
        .execute(&db)
        .await
        .unwrap();

    // Fire cue 1 (0 → 128)
    executor.go(&cue_list_id).await.unwrap();
    drain_fade_commands(&rx);

    // Fire cue 2 (128 → 128, equal = instant, 0 frames)
    executor.go(&cue_list_id).await.unwrap();
    let cmds = drain_fade_commands(&rx);

    let dimmer_cmd = cmds.iter().find(|&&(_, ch, _, _)| ch == 0).unwrap();
    assert_eq!(dimmer_cmd.3, 0, "equal value should use 0 frames (instant set)");
}
