use crate::card_schema::{CharacterCardV3, ValidationIssue, ValidationReport};
use regex::Regex;

fn issue(level: &str, code: &str, path: &str, message: &str) -> ValidationIssue {
    ValidationIssue {
        level: level.to_string(),
        code: code.to_string(),
        path: path.to_string(),
        message: message.to_string(),
    }
}

pub fn validate_card_report(card: &CharacterCardV3) -> ValidationReport {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    if card.spec != "chara_card_v3" {
        errors.push(issue(
            "error",
            "invalid_spec",
            "spec",
            "Spec must be chara_card_v3.",
        ));
    }
    if card.spec_version.trim().is_empty() {
        errors.push(issue(
            "error",
            "missing_spec_version",
            "spec_version",
            "Spec version is required.",
        ));
    } else if card.spec_version.parse::<f32>().unwrap_or(0.0) > 3.0 {
        warnings.push(issue(
            "warning",
            "newer_spec_version",
            "spec_version",
            "This card uses a newer spec version.",
        ));
    }

    let required = [
        ("name", &card.data.name),
        ("description", &card.data.description),
        ("creator", &card.data.creator),
        ("character_version", &card.data.character_version),
        ("mes_example", &card.data.mes_example),
        ("system_prompt", &card.data.system_prompt),
        (
            "post_history_instructions",
            &card.data.post_history_instructions,
        ),
        ("first_mes", &card.data.first_mes),
        ("personality", &card.data.personality),
        ("scenario", &card.data.scenario),
        ("creator_notes", &card.data.creator_notes),
    ];
    for (field, _) in required {
        let path = format!("data.{field}");
        if !field_exists_as_string(card, field) {
            errors.push(issue(
                "error",
                "missing_string",
                &path,
                "Required string field is missing.",
            ));
        }
    }

    if card.data.name.trim().is_empty() {
        warnings.push(issue(
            "warning",
            "empty_name",
            "data.name",
            "Name is empty.",
        ));
    }
    if card.data.first_mes.trim().is_empty() {
        warnings.push(issue(
            "warning",
            "empty_first_mes",
            "data.first_mes",
            "First message is empty.",
        ));
    }

    if let Some(book) = &card.data.character_book {
        for (index, entry) in book.entries.iter().enumerate() {
            if entry.keys.iter().any(|key| key.trim().is_empty()) {
                errors.push(issue(
                    "error",
                    "invalid_lorebook_keys",
                    &format!("data.character_book.entries.{index}.keys"),
                    "Lorebook keys must be non-empty strings.",
                ));
            }
            if entry.use_regex {
                for (key_index, pattern) in entry
                    .keys
                    .iter()
                    .chain(entry.secondary_keys.iter().flatten())
                    .enumerate()
                {
                    if Regex::new(pattern).is_err() {
                        warnings.push(issue(
                            "warning",
                            "invalid_regex",
                            &format!("data.character_book.entries.{index}.keys.{key_index}"),
                            "Invalid regex.",
                        ));
                    }
                }
            }
        }
    }

    if let Some(assets) = &card.data.assets {
        let icons: Vec<_> = assets
            .iter()
            .filter(|asset| asset.r#type == "icon")
            .collect();
        let main_icons = icons.iter().filter(|asset| asset.name == "main").count();
        if !icons.is_empty() && main_icons != 1 {
            errors.push(issue(
                "error",
                "invalid_main_icon",
                "data.assets",
                "Icon assets must include exactly one main icon.",
            ));
        }

        let main_backgrounds = assets
            .iter()
            .filter(|asset| asset.r#type == "background" && asset.name == "main")
            .count();
        if main_backgrounds > 1 {
            errors.push(issue(
                "error",
                "invalid_main_background",
                "data.assets",
                "Only one main background asset is allowed.",
            ));
        }

        for (index, asset) in assets.iter().enumerate() {
            if asset.uri.starts_with("http://") {
                warnings.push(issue(
                    "warning",
                    "http_asset",
                    &format!("data.assets.{index}.uri"),
                    "HTTP asset URI is not secure.",
                ));
            }
            if asset.uri.trim_start().to_ascii_lowercase().starts_with("data:image/") {
                warnings.push(issue(
                    "warning",
                    "inline_image_asset",
                    &format!("data.assets.{index}.uri"),
                    "Inline image assets are removed on export; PNG uses the cover image itself.",
                ));
            }
            if asset.ext.starts_with('.') || asset.ext != asset.ext.to_ascii_lowercase() {
                warnings.push(issue(
                    "warning",
                    "asset_ext",
                    &format!("data.assets.{index}.ext"),
                    "Asset extension should be lowercase without a dot.",
                ));
            }
        }
    }

    if let Some(source) = &card.data.source {
        for (index, value) in source.iter().enumerate() {
            if !looks_like_url_or_id(value) {
                warnings.push(issue(
                    "warning",
                    "source_format",
                    &format!("data.source.{index}"),
                    "Source does not look like a URL or ID.",
                ));
            }
        }
    }

    for (field, value) in [
        ("description", &card.data.description),
        ("personality", &card.data.personality),
        ("scenario", &card.data.scenario),
        ("system_prompt", &card.data.system_prompt),
        ("mes_example", &card.data.mes_example),
    ] {
        if value.len() > 40_000 {
            warnings.push(issue(
                "warning",
                "long_field",
                &format!("data.{field}"),
                "Field is unusually long.",
            ));
        }
    }

    for (key, value) in &card.data.extensions {
        if value.to_string().len() > 20_000 {
            warnings.push(issue(
                "warning",
                "large_extension",
                &format!("data.extensions.{key}"),
                "Extension data is unusually large.",
            ));
        }
    }

    ValidationReport {
        valid: errors.is_empty(),
        errors,
        warnings,
    }
}

pub fn ensure_valid_for_export(card: &CharacterCardV3) -> Result<(), String> {
    let report = validate_card_report(card);
    if report.valid {
        return Ok(());
    }

    let summary = report
        .errors
        .iter()
        .map(|error| format!("{}: {}", error.path, error.message))
        .collect::<Vec<_>>()
        .join("\n");
    Err(format!(
        "Card cannot be exported until errors are fixed.\n{summary}"
    ))
}

fn field_exists_as_string(card: &CharacterCardV3, field: &str) -> bool {
    match serde_json::to_value(&card.data) {
        Ok(value) => value
            .get(field)
            .is_some_and(|field_value| field_value.is_string()),
        Err(_) => false,
    }
}

fn looks_like_url_or_id(value: &str) -> bool {
    value.starts_with("http://")
        || value.starts_with("https://")
        || value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-' | ':' | '/' | '#'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card_schema::{CardAsset, CharacterCardV3, Lorebook, LorebookEntry};

    #[test]
    fn invalid_regex_is_warning() {
        let mut card = CharacterCardV3::blank(1);
        card.data.character_book = Some(Lorebook {
            name: None,
            description: None,
            scan_depth: None,
            token_budget: None,
            recursive_scanning: None,
            extensions: Default::default(),
            entries: vec![LorebookEntry {
                keys: vec!["[".to_string()],
                content: String::new(),
                extensions: Default::default(),
                enabled: true,
                insertion_order: 0,
                case_sensitive: None,
                use_regex: true,
                constant: None,
                name: None,
                priority: None,
                id: None,
                comment: None,
                selective: None,
                secondary_keys: None,
                position: None,
                extra: Default::default(),
            }],
            extra: Default::default(),
        });

        let report = validate_card_report(&card);
        assert!(report
            .warnings
            .iter()
            .any(|warning| warning.code == "invalid_regex"));
    }

    #[test]
    fn asset_main_icon_rule_is_error() {
        let mut card = CharacterCardV3::blank(1);
        card.data.assets = Some(vec![
            CardAsset {
                r#type: "icon".to_string(),
                uri: "ccdefault:".to_string(),
                name: "side".to_string(),
                ext: "png".to_string(),
                extra: Default::default(),
            },
            CardAsset {
                r#type: "icon".to_string(),
                uri: "ccdefault:".to_string(),
                name: "other".to_string(),
                ext: "png".to_string(),
                extra: Default::default(),
            },
        ]);

        let report = validate_card_report(&card);
        assert!(report
            .errors
            .iter()
            .any(|error| error.code == "invalid_main_icon"));
    }

    #[test]
    fn inline_image_asset_is_warning() {
        let mut card = CharacterCardV3::blank(1);
        card.data.assets = Some(vec![CardAsset {
            r#type: "icon".to_string(),
            uri: "data:image/png;base64,abcdef".to_string(),
            name: "main".to_string(),
            ext: "png".to_string(),
            extra: Default::default(),
        }]);

        let report = validate_card_report(&card);
        assert!(report
            .warnings
            .iter()
            .any(|warning| warning.code == "inline_image_asset"));
    }
}
