use std::collections::HashMap;
use std::path::Path;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct FixtureTypeDef {
    pub id: String,
    pub label: String,
    pub definition: serde_json::Value,
}

/// Load fixture types from a directory of JSON files.
/// Each file must have an `id` and `label` field at the root level.
pub fn load_fixture_types(dir: &Path) -> HashMap<String, FixtureTypeDef> {
    let mut map = HashMap::new();

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) => {
            tracing::warn!("Could not read fixture types directory {}: {e}", dir.display());
            return load_embedded();
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "json") {
            match load_fixture_file(&path) {
                Ok(def) => {
                    tracing::debug!("Loaded fixture type: {} ({})", def.id, def.label);
                    map.insert(def.id.clone(), def);
                }
                Err(e) => {
                    tracing::warn!("Failed to load fixture type {}: {e}", path.display());
                }
            }
        }
    }

    if map.is_empty() {
        tracing::info!("No fixture type files found, using embedded definitions");
        return load_embedded();
    }

    tracing::info!("Loaded {} fixture types from disk", map.len());
    map
}

fn load_fixture_file(path: &Path) -> anyhow::Result<FixtureTypeDef> {
    let content = std::fs::read_to_string(path)?;
    let value: serde_json::Value = serde_json::from_str(&content)?;

    let id = value
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("missing 'id' field"))?
        .to_string();

    let label = value
        .get("label")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("missing 'label' field"))?
        .to_string();

    Ok(FixtureTypeDef {
        id,
        label,
        definition: value,
    })
}

/// Fallback: load from embedded JSON for tests and when disk files are missing.
pub fn load_embedded() -> HashMap<String, FixtureTypeDef> {
    let json_str = include_str!("../data/builtin-fixtures.json");
    let fixtures: Vec<serde_json::Value> =
        serde_json::from_str(json_str).expect("builtin-fixtures.json is valid JSON");

    let mut map = HashMap::new();
    for fixture in fixtures {
        let id = fixture["id"].as_str().unwrap_or("").to_string();
        let label = fixture["label"].as_str().unwrap_or("").to_string();
        let definition = fixture["definition_json"].clone();

        if !id.is_empty() {
            map.insert(
                id.clone(),
                FixtureTypeDef {
                    id,
                    label,
                    definition,
                },
            );
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_embedded_fixtures() {
        let types = load_embedded();
        assert!(types.len() >= 11);
        assert!(types.contains_key("moving_head"));
        assert!(types.contains_key("fresnel"));

        let moving_head = &types["moving_head"];
        assert_eq!(moving_head.label, "Moving Head");
        assert!(moving_head.definition.get("modes").is_some());
    }
}
