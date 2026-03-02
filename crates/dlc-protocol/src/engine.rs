use crate::constants::DMX_CHANNELS_PER_UNIVERSE;

#[derive(Debug, Clone)]
pub enum EngineCommand {
    SetChannel {
        universe: u16,
        channel: u16,
        value: u8,
    },
    SetUniverse {
        universe: u16,
        data: Box<[u8; DMX_CHANNELS_PER_UNIVERSE]>,
    },
    FireCue {
        cue_list_id: u32,
        cue_id: u32,
    },
    StopCueList {
        cue_list_id: u32,
    },
    FadeChannel {
        universe: u16,
        channel: u16,
        target: u8,
        frames: u32,
    },
    SetMasterDimmer {
        value: u8,
    },
    Shutdown,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engine_command_is_send() {
        fn assert_send<T: Send>() {}
        assert_send::<EngineCommand>();
    }
}
