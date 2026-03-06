pub mod artnet;
pub mod enttec_pro;
mod mock;
mod null;
pub mod sacn;
pub mod tap;

pub use artnet::ArtNetOutput;
pub use enttec_pro::EnttecProOutput;
pub use mock::MockOutput;
pub use null::NullOutput;
pub use sacn::SacnOutput;
pub use tap::{TapFrame, TapOutput};

use crate::EngineError;

pub trait DmxOutput: Send {
    fn send_universe(&mut self, universe_id: u16, data: &[u8; 512]) -> Result<(), EngineError>;
    fn label(&self) -> &str;
}