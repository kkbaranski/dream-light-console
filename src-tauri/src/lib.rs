// Dream Light Console — Tauri 2 app shell
//
// The Python backend (`dlc-backend`) is managed as a Tauri sidecar.
// For local development WITHOUT full Tauri compilation you can start
// the backend independently:
//
//   mise run backend-dev
//
// This avoids needing a compiled Rust binary during hot-reload development.

use tauri::Manager;

#[tauri::command]
fn get_backend_url() -> String {
    "http://127.0.0.1:8765".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_backend_url])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match tauri_plugin_shell::ShellExt::shell(&handle)
                    .sidecar("dlc-backend")
                    .expect("dlc-backend sidecar not configured")
                    .spawn()
                {
                    Ok((mut rx, _child)) => {
                        use tauri_plugin_shell::process::CommandEvent;
                        while let Some(event) = rx.recv().await {
                            match event {
                                CommandEvent::Stdout(line) => {
                                    println!("[backend] {}", String::from_utf8_lossy(&line));
                                }
                                CommandEvent::Stderr(line) => {
                                    eprintln!("[backend] {}", String::from_utf8_lossy(&line));
                                }
                                CommandEvent::Terminated(status) => {
                                    eprintln!("[backend] process exited: {:?}", status);
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[backend] failed to spawn sidecar: {e}");
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
