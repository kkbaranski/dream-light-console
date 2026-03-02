use super::DmxOutput;
use crate::EngineError;

pub struct NullOutput;

impl DmxOutput for NullOutput {
    fn send_universe(&mut self, _universe_id: u16, _data: &[u8; 512]) -> Result<(), EngineError> {
        Ok(())
    }

    fn label(&self) -> &str {
        "null"
    }
}
