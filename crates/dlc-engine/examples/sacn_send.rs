//! Send a single sACN (E1.31) universe with channel 1 at full.
//!
//! Useful for manual testing with Wireshark or sACN receivers.
//!
//! ```bash
//! cargo run -p dlc-engine --example sacn_send
//! ```

use dlc_engine::output::DmxOutput;
use dlc_engine::output::sacn::SacnOutput;

fn main() -> Result<(), dlc_engine::EngineError> {
    let mut output = SacnOutput::new(100)?;

    let mut data = [0u8; 512];
    data[0] = 255; // Channel 1 at full

    output.send_universe(1, &data)?;
    println!("Sent sACN universe 1 to 239.255.0.1:5568 — channel 1 = 255");

    Ok(())
}
