use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use dlc_protocol::{EngineCommand, DMX_CHANNELS_PER_UNIVERSE};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;

use crate::state::{AppState, WsBroadcast};

pub async fn upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_connection(socket, state))
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum IncomingMessage {
    #[serde(rename = "set_channel")]
    SetChannel { universe: u16, channel: u16, value: u8 },
    #[serde(rename = "set_channels")]
    SetChannels { universe: u16, data: std::collections::HashMap<String, u8> },
    #[serde(rename = "set_universe")]
    SetUniverse { universe: u16, data: Vec<u8> },
    #[serde(rename = "go_cue_list")]
    GoCueList { cue_list_id: String },
    #[serde(rename = "fire_cue")]
    FireCue { cue_id: String },
    #[serde(rename = "stop_cue_list")]
    StopCueList { cue_list_id: String },
    #[serde(rename = "ping")]
    Ping,
}

async fn handle_connection(socket: WebSocket, state: AppState) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let mut broadcast_rx = state.ws_broadcast.subscribe();

    // Per-connection channel for direct replies (pong, errors)
    let (reply_tx, mut reply_rx) = tokio::sync::mpsc::channel::<String>(32);

    let outgoing = async move {
        loop {
            tokio::select! {
                broadcast = broadcast_rx.recv() => {
                    let msg = match broadcast {
                        Ok(msg) => msg,
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(_) => break,
                    };
                    let json = match msg {
                        WsBroadcast::UniverseUpdate { universe, channels } => {
                            serde_json::json!({
                                "type": "universe_update",
                                "universe": universe,
                                "channels": channels,
                            })
                            .to_string()
                        }
                    };
                    if ws_tx.send(Message::Text(json.into())).await.is_err() {
                        break;
                    }
                }
                reply = reply_rx.recv() => {
                    let Some(text) = reply else { break };
                    if ws_tx.send(Message::Text(text.into())).await.is_err() {
                        break;
                    }
                }
            }
        }
    };

    let incoming = async {
        while let Some(Ok(msg)) = ws_rx.next().await {
            match msg {
                Message::Text(text) => {
                    dispatch_message(&text, &state, &reply_tx).await;
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    };

    tokio::select! {
        _ = outgoing => {}
        _ = incoming => {}
    }
}

async fn dispatch_message(
    text: &str,
    state: &AppState,
    reply_tx: &tokio::sync::mpsc::Sender<String>,
) {
    let msg: IncomingMessage = match serde_json::from_str(text) {
        Ok(m) => m,
        Err(e) => {
            tracing::debug!("Invalid WS message: {e}");
            return;
        }
    };

    match msg {
        IncomingMessage::SetChannel { universe, channel, value } => {
            if channel >= DMX_CHANNELS_PER_UNIVERSE as u16 {
                return;
            }
            let _ = state.engine_tx.try_send(EngineCommand::SetChannel {
                universe,
                channel,
                value,
            });
        }
        IncomingMessage::SetChannels { universe, data } => {
            for (key, value) in &data {
                if let Ok(ch) = key.parse::<u16>() {
                    if (ch as usize) < DMX_CHANNELS_PER_UNIVERSE {
                        let _ = state.engine_tx.try_send(EngineCommand::SetChannel {
                            universe,
                            channel: ch,
                            value: *value,
                        });
                    }
                }
            }
        }
        IncomingMessage::SetUniverse { universe, data } => {
            if data.len() != DMX_CHANNELS_PER_UNIVERSE {
                return;
            }
            let mut buf = Box::new([0u8; DMX_CHANNELS_PER_UNIVERSE]);
            buf.copy_from_slice(&data);
            let _ = state.engine_tx.try_send(EngineCommand::SetUniverse {
                universe,
                data: buf,
            });
        }
        IncomingMessage::GoCueList { cue_list_id } => {
            match state.cue_executor.go(&cue_list_id).await {
                Ok(cue_id) => {
                    let msg = serde_json::json!({
                        "type": "cue_fired",
                        "cue_list_id": cue_list_id,
                        "cue_id": cue_id,
                    })
                    .to_string();
                    let _ = reply_tx.send(msg).await;
                }
                Err(e) => {
                    tracing::debug!("go_cue_list error: {e}");
                }
            }
        }
        IncomingMessage::FireCue { cue_id } => {
            if let Err(e) = state.cue_executor.fire(&cue_id).await {
                tracing::debug!("fire_cue error: {e}");
            }
        }
        IncomingMessage::StopCueList { cue_list_id } => {
            state.cue_executor.stop(&cue_list_id).await;
        }
        IncomingMessage::Ping => {
            let _ = reply_tx
                .send(r#"{"type":"pong"}"#.to_string())
                .await;
        }
    }
}
