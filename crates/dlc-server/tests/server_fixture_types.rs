use dlc_server::fixture_types;

#[test]
fn load_embedded_fixtures() {
    let types = fixture_types::load_embedded();
    assert!(types.len() >= 11);
    assert!(types.contains_key("moving_head"));
    assert!(types.contains_key("fresnel"));

    let moving_head = &types["moving_head"];
    assert_eq!(moving_head.label, "Moving Head");
    assert!(moving_head.definition.get("modes").is_some());
}
