pub struct ServerConfig {
    pub port: u16,
    pub ws_port: u16,
    pub host: String,
    pub db_path: String,
    pub static_dir: Option<String>,
    pub cors_allow_any: bool,
    pub dmx_output_type: String,
    pub dmx_target_ip: Option<String>,
    pub sacn_priority: u8,
    pub dmx_serial_port: Option<String>,
}

const DEFAULT_SACN_PRIORITY: u8 = 100;

impl ServerConfig {
    pub fn from_env() -> Self {
        let port = std::env::var("DLC_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(3000);
        let ws_port = std::env::var("DLC_WS_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(port + 1);
        Self {
            port,
            ws_port,
            host: std::env::var("DLC_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            db_path: std::env::var("DLC_DB_PATH").unwrap_or_else(|_| "dlc.db".to_string()),
            static_dir: std::env::var("DLC_STATIC_DIR").ok(),
            cors_allow_any: std::env::var("DLC_CORS_ALLOW_ANY")
                .map(|v| v != "false" && v != "0")
                .unwrap_or(true),
            dmx_output_type: std::env::var("DLC_DMX_OUTPUT")
                .unwrap_or_else(|_| "mock".to_string()),
            dmx_target_ip: std::env::var("DLC_DMX_TARGET_IP").ok(),
            sacn_priority: std::env::var("DLC_SACN_PRIORITY")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(DEFAULT_SACN_PRIORITY),
            dmx_serial_port: std::env::var("DLC_SERIAL_PORT").ok(),
        }
    }

    pub fn static_dir(&self) -> &str {
        self.static_dir.as_deref().unwrap_or("web-ui/dist")
    }
}
