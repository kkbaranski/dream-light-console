use dlc_protocol::EngineCommand;

#[test]
fn engine_command_is_send() {
    fn assert_send<T: Send>() {}
    assert_send::<EngineCommand>();
}
