pub struct ServerConfig {
    pub port: u16,
    pub host: String,
    pub db_path: String,
    pub static_dir: Option<String>,
    pub cors_allow_any: bool,
    pub dmx_output_type: String,
}

impl ServerConfig {
    pub fn from_env() -> Self {
        Self {
            port: std::env::var("DLC_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3000),
            host: std::env::var("DLC_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            db_path: std::env::var("DLC_DB_PATH").unwrap_or_else(|_| "dlc.db".to_string()),
            static_dir: std::env::var("DLC_STATIC_DIR").ok(),
            cors_allow_any: std::env::var("DLC_CORS_ALLOW_ANY")
                .map(|v| v != "false" && v != "0")
                .unwrap_or(true),
            dmx_output_type: std::env::var("DLC_DMX_OUTPUT")
                .unwrap_or_else(|_| "mock".to_string()),
        }
    }

    pub fn static_dir(&self) -> &str {
        self.static_dir.as_deref().unwrap_or("web-ui/dist")
    }
}
