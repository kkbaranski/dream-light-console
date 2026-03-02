//! Send a single Art-Net ArtDmx packet with channel 1 at full.
//!
//! Broadcasts on the local network by default.
//!
//! ```bash
//! cargo run -p dlc-engine --example artnet_send
//! ```

use dlc_engine::output::artnet::ArtNetOutput;
use dlc_engine::output::DmxOutput;

fn main() -> Result<(), dlc_engine::EngineError> {
    let mut output = ArtNetOutput::broadcast()?;

    let mut data = [0u8; 512];
    data[0] = 255; // Channel 1 at full

    output.send_universe(1, &data)?;
    println!("Sent Art-Net universe 1 (broadcast 255.255.255.255:6454) — channel 1 = 255");

    Ok(())
}
