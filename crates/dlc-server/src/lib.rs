pub mod config;
pub mod cue_executor;
pub mod db;
pub mod error;
pub mod fixture_types;
pub mod routes;
pub mod state;

#[cfg(any(test, feature = "test-helpers"))]
pub mod test_helpers;

/// Try to open an ENTTEC DMX USB Pro connection. Extracted for reuse in reconnect.
pub fn try_open_enttec_pro(
    config: &config::ServerConfig,
) -> anyhow::Result<dlc_engine::EnttecProOutput> {
    let port_name = match &config.dmx_serial_port {
        Some(port) => port.clone(),
        None => {
            let ports = serialport::available_ports()
                .map_err(|e| anyhow::anyhow!("failed to list serial ports: {e}"))?;
            ports
                .iter()
                .find(|p| p.port_name.contains("usbserial"))
                .map(|p| p.port_name.clone())
                .ok_or_else(|| anyhow::anyhow!(
                    "no ENTTEC DMX USB Pro found; set DLC_SERIAL_PORT explicitly"
                ))?
        }
    };
    tracing::info!("DMX output: ENTTEC DMX USB Pro on {port_name}");
    Ok(dlc_engine::EnttecProOutput::new(&port_name)?)
}
