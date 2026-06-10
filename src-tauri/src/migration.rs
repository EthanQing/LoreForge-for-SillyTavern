use crate::card_schema::{current_unix_seconds, CharacterCardV3, ExtraFields, LorebookEntry};
use crate::errors::{CardError, CardResult};
use serde_json::{Map, Value};

const LOREBOOK_ENTRY_COMMENT_MAX_LENGTH: usize = 100;

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
    normalize_lorebook_for_export(&mut card);
    strip_inline_image_assets_for_export(&mut card);
    card.spec_version = "3.0".to_string();
    card.data.modification_date = Some(current_unix_seconds());
    card
}

fn strip_inline_image_assets_for_export(card: &mut CharacterCardV3) {
    let Some(assets) = &mut card.data.assets else {
        return;
    };

    assets.retain(|asset| !asset.uri.trim_start().to_ascii_lowercase().starts_with("data:image/"));
    if assets.is_empty() {
        card.data.assets = None;
    }
}

fn normalize_lorebook_for_export(card: &mut CharacterCardV3) {
    if let Some(book) = &mut card.data.character_book {
        for (index, entry) in book.entries.iter_mut().enumerate() {
            normalize_lorebook_entry_for_export(entry, index);
        }
    }
}

fn normalize_lorebook_entry_for_export(entry: &mut LorebookEntry, index: usize) {
    entry.comment = Some(derive_lorebook_entry_comment(entry, index));
    entry.name = None;

    copy_i64_extension(&mut entry.extensions, "depth", entry.extra.get("depth"));
    copy_i64_extension(
        &mut entry.extensions,
        "probability",
        entry.extra.get("probability"),
    );
    copy_i64_extension(&mut entry.extensions, "budget", entry.extra.get("budget"));
    copy_bool_extension(
        &mut entry.extensions,
        "case_sensitive",
        entry.case_sensitive,
    );

    if !entry.extensions.contains_key("position") {
        if let Some(position) = entry.position.as_deref() {
            let value = if position == "after_char" { 1 } else { 0 };
            entry
                .extensions
                .insert("position".to_string(), Value::from(value));
        }
    }
    if !entry.extensions.contains_key("display_index") {
        entry
            .extensions
            .insert("display_index".to_string(), Value::from(index as i64));
    }
}

fn derive_lorebook_entry_comment(entry: &LorebookEntry, index: usize) -> String {
    for candidate in [
        entry.comment.as_deref(),
        entry.name.as_deref(),
        entry
            .keys
            .iter()
            .find(|key| !key.trim().is_empty())
            .map(String::as_str),
    ] {
        if let Some(value) = candidate {
            if !value.trim().is_empty() {
                return truncate_lorebook_entry_comment(value);
            }
        }
    }
    truncate_lorebook_entry_comment(&fallback_lorebook_entry_comment(index))
}

fn fallback_lorebook_entry_comment(index: usize) -> String {
    format!("Entry {}", index + 1)
}

fn truncate_lorebook_entry_comment(value: &str) -> String {
    value
        .trim()
        .chars()
        .take(LOREBOOK_ENTRY_COMMENT_MAX_LENGTH)
        .collect()
}

fn copy_i64_extension(extensions: &mut ExtraFields, key: &str, value: Option<&Value>) {
    if extensions.contains_key(key) {
        return;
    }
    if let Some(value) = value.and_then(value_as_i64) {
        extensions.insert(key.to_string(), Value::from(value));
    }
}

fn copy_bool_extension(extensions: &mut ExtraFields, key: &str, value: Option<bool>) {
    if extensions.contains_key(key) {
        return;
    }
    if let Some(value) = value {
        extensions.insert(key.to_string(), Value::from(value));
    }
}

fn value_as_i64(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_u64().and_then(|number| i64::try_from(number).ok()))
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

    #[test]
    fn export_fills_lorebook_comment_and_extension_fields() {
        let (card, _, _) = migrate_value_to_v3(json!({
            "spec": "chara_card_v3",
            "spec_version": "3.0",
            "data": {
                "name": "Test",
                "character_book": {
                    "extensions": {},
                    "entries": [{
                        "name": "Faction",
                        "keys": ["faction"],
                        "content": "Faction lore.",
                        "extensions": {},
                        "enabled": true,
                        "insertion_order": 0,
                        "use_regex": false,
                        "position": "after_char",
                        "case_sensitive": true,
                        "depth": 3,
                        "probability": 80
                    }]
                }
            }
        }))
        .unwrap();

        let card = touch_for_export(card);
        let book = card.data.character_book.as_ref().unwrap();
        let entry = &book.entries[0];

        assert_eq!(entry.comment.as_deref(), Some("Faction"));
        assert!(entry.name.is_none());
        assert_eq!(
            entry.extensions.get("position").and_then(Value::as_i64),
            Some(1)
        );
        assert_eq!(
            entry.extensions.get("case_sensitive").and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(entry.extensions.get("depth").and_then(Value::as_i64), Some(3));
        assert_eq!(
            entry.extensions.get("probability").and_then(Value::as_i64),
            Some(80)
        );
    }

    #[test]
    fn export_strips_inline_image_assets() {
        let (card, _, _) = migrate_value_to_v3(json!({
            "spec": "chara_card_v3",
            "spec_version": "3.0",
            "data": {
                "name": "Test",
                "assets": [
                    {
                        "type": "icon",
                        "name": "main",
                        "ext": "png",
                        "uri": "data:image/png;base64,abcdef"
                    },
                    {
                        "type": "background",
                        "name": "city",
                        "ext": "png",
                        "uri": "https://example.test/city.png"
                    }
                ]
            }
        }))
        .unwrap();

        let card = touch_for_export(card);
        let assets = card.data.assets.as_ref().unwrap();

        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].uri, "https://example.test/city.png");
    }
}
