use thiserror::Error;

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("channel {channel} out of range (0-511)")]
    ChannelOutOfRange { channel: u16 },
    #[error("range overflow: start={start}, length={length}, max=512")]
    RangeOverflow { start: u16, length: usize },
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("engine command send failed: channel closed")]
    SendFailed,
    #[error("engine thread panicked")]
    ThreadPanicked,
}
