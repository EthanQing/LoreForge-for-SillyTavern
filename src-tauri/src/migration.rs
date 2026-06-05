use crate::card_schema::{current_unix_seconds, CharacterCardV3, ExtraFields};
use crate::errors::{CardError, CardResult};
use serde_json::{Map, Value};

pub fn migrate_value_to_v3(value: Value) -> CardResult<(CharacterCardV3, Vec<String>, String)> {
    let object = value.as_object().ok_or_else(|| {
        CardError::Invalid("The selected JSON is not a character card object.".to_string())
    })?;
    let spec = object.get("spec").and_then(Value::as_str);

    match spec {
        Some("chara_card_v3") => migrate_struct(value, "v3"),
        Some("chara_card_v2") => {
            let (mut card, mut warnings, _) = migrate_struct(value, "v2")?;
            card.spec_version = "3.0".to_string();
            warnings.push("Imported a CCv2 card and migrated it to CCv3.".to_string());
            Ok((card, warnings, "v2".to_string()))
        }
        None if looks_like_v1(object) => Ok((
            migrate_v1(object),
            vec!["Imported a legacy V1 card and migrated it to CCv3.".to_string()],
            "v1".to_string(),
        )),
        _ => Err(CardError::Invalid(
            "The selected file is not a recognized Character Card V1, V2, or V3 file.".to_string(),
        )),
    }
}

pub fn normalize_card(mut card: CharacterCardV3) -> CharacterCardV3 {
    let now = current_unix_seconds();
    card.spec = "chara_card_v3".to_string();
    if card.spec_version.trim().is_empty() {
        card.spec_version = "3.0".to_string();
    }
    if card.data.creation_date.is_none() {
        card.data.creation_date = Some(now);
    }
    if card.data.modification_date.is_none() {
        card.data.modification_date = Some(now);
    }
    if let Some(assets) = &mut card.data.assets {
        for asset in assets {
            asset.ext = asset.ext.trim_start_matches('.').to_ascii_lowercase();
            if asset.r#type.is_empty() {
                asset.r#type = "other".to_string();
            }
            if asset.ext.is_empty() {
                asset.ext = "unknown".to_string();
            }
        }
    }
    if let Some(book) = &mut card.data.character_book {
        for (index, entry) in book.entries.iter_mut().enumerate() {
            if entry.insertion_order == 0 && index > 0 {
                entry.insertion_order = index as i64;
            }
        }
    }
    card
}

pub fn touch_for_export(mut card: CharacterCardV3) -> CharacterCardV3 {
    card = normalize_card(card);
    card.spec_version = "3.0".to_string();
    card.data.modification_date = Some(current_unix_seconds());
    card
}

fn migrate_struct(
    value: Value,
    source: &str,
) -> CardResult<(CharacterCardV3, Vec<String>, String)> {
    let mut card: CharacterCardV3 = serde_json::from_value(value)?;
    let mut warnings = Vec::new();
    if source == "v3" {
        let version = card.spec_version.parse::<f32>().unwrap_or(0.0);
        if version > 3.0 {
            warnings.push("This card uses a newer spec version; unsupported fields were preserved where possible.".to_string());
        }
    }
    card = normalize_card(card);
    Ok((card, warnings, source.to_string()))
}

fn looks_like_v1(object: &Map<String, Value>) -> bool {
    object.get("spec").is_none()
        && [
            "name",
            "description",
            "personality",
            "scenario",
            "first_mes",
            "mes_example",
        ]
        .iter()
        .any(|field| object.get(*field).and_then(Value::as_str).is_some())
}

fn migrate_v1(object: &Map<String, Value>) -> CharacterCardV3 {
    let now = current_unix_seconds();
    let mut card = CharacterCardV3::blank(now);
    card.data.name = string_field(object, "name");
    card.data.description = string_field(object, "description");
    card.data.personality = string_field(object, "personality");
    card.data.scenario = string_field(object, "scenario");
    card.data.first_mes = string_field(object, "first_mes");
    card.data.mes_example = string_field(object, "mes_example");

    let known = [
        "name",
        "description",
        "personality",
        "scenario",
        "first_mes",
        "mes_example",
    ];
    let unknown: ExtraFields = object
        .iter()
        .filter(|(key, _)| !known.contains(&key.as_str()))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    if !unknown.is_empty() {
        card.data
            .extensions
            .insert("imported_v1_fields".to_string(), Value::Object(unknown));
    }
    card
}

fn string_field(object: &Map<String, Value>, field: &str) -> String {
    object
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn migrates_v2_to_v3() {
        let (card, warnings, source) = migrate_value_to_v3(json!({
            "spec": "chara_card_v2",
            "spec_version": "2.0",
            "data": {
                "name": "Test",
                "character_book": {
                    "extensions": {},
                    "entries": [{ "keys": ["a"], "content": "b", "extensions": {}, "enabled": true, "insertion_order": 1 }]
                }
            }
        }))
        .unwrap();

        assert_eq!(source, "v2");
        assert_eq!(card.spec, "chara_card_v3");
        assert_eq!(card.spec_version, "3.0");
        assert!(!warnings.is_empty());
        assert!(!card.data.character_book.unwrap().entries[0].use_regex);
    }

    #[test]
    fn migrates_v1_to_v3() {
        let (card, _, source) = migrate_value_to_v3(json!({
            "name": "Legacy",
            "description": "Desc",
            "personality": "Persona",
            "scenario": "Scene",
            "first_mes": "Hi",
            "mes_example": "Example"
        }))
        .unwrap();

        assert_eq!(source, "v1");
        assert_eq!(card.data.name, "Legacy");
        assert_eq!(card.spec, "chara_card_v3");
    }
}
