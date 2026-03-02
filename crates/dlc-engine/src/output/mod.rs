pub mod artnet;
mod mock;
mod null;
pub mod sacn;

pub use artnet::ArtNetOutput;
pub use mock::MockOutput;
pub use null::NullOutput;
pub use sacn::SacnOutput;

use crate::EngineError;

pub trait DmxOutput: Send {
    fn send_universe(&mut self, universe_id: u16, data: &[u8; 512]) -> Result<(), EngineError>;
    fn label(&self) -> &str;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_captures_frames() {
        let mut output = MockOutput::new();
        let mut data = [0u8; 512];
        data[0] = 255;
        output.send_universe(1, &data).unwrap();
        assert_eq!(output.send_count(), 1);
        assert_eq!(output.last_frame(1).unwrap()[0], 255);
    }

    #[test]
    fn mock_tracks_multiple_universes() {
        let mut output = MockOutput::new();
        output.send_universe(1, &[100; 512]).unwrap();
        output.send_universe(2, &[200; 512]).unwrap();
        assert_eq!(output.last_frame(1).unwrap()[0], 100);
        assert_eq!(output.last_frame(2).unwrap()[0], 200);
        assert_eq!(output.send_count(), 2);
    }

    #[test]
    fn mock_preserves_frame_history() {
        let mut output = MockOutput::new();
        output.send_universe(1, &[10; 512]).unwrap();
        output.send_universe(1, &[20; 512]).unwrap();
        let frames = output.frames_for(1);
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0][0], 10);
        assert_eq!(frames[1][0], 20);
    }

    #[test]
    fn mock_clear_resets() {
        let mut output = MockOutput::new();
        output.send_universe(1, &[0; 512]).unwrap();
        output.clear();
        assert_eq!(output.send_count(), 0);
        assert!(output.last_frame(1).is_none());
    }

    #[test]
    fn null_output_succeeds() {
        let mut output = NullOutput;
        assert!(output.send_universe(1, &[0; 512]).is_ok());
    }

    #[test]
    fn trait_is_object_safe() {
        let output: Box<dyn DmxOutput> = Box::new(MockOutput::new());
        assert_eq!(output.label(), "mock");
    }
}
