use crate::card_schema::{CardAsset, CharacterCardV3, ParsedCard, ValidationReport};
use crate::charx::{export_charx_file, import_charx_file, CharxAssetInput};
use crate::errors::{command_error, CardError, CardResult};
use crate::migration::{migrate_value_to_v3, touch_for_export};
use crate::png_card::{read_card_value, write_card_chunks};
use crate::validation::{ensure_valid_for_export, validate_card_report};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[tauri::command]
pub fn open_card_file(path: String) -> Result<ParsedCard, String> {
    open_card_file_inner(PathBuf::from(path)).map_err(command_error)
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    PathBuf::from(path).exists()
}

#[tauri::command]
pub fn save_card_json(path: String, card: CharacterCardV3) -> Result<ParsedCard, String> {
    save_card_json_inner(PathBuf::from(path), card).map_err(command_error)
}

#[tauri::command]
pub fn export_card_png(
    path: String,
    base_png_path: Option<String>,
    base_png_data_url: Option<String>,
    card: CharacterCardV3,
) -> Result<ParsedCard, String> {
    export_card_png_inner(
        PathBuf::from(path),
        base_png_path.map(PathBuf::from),
        base_png_data_url,
        card,
    )
    .map_err(command_error)
}

#[tauri::command]
pub fn import_card_png(path: String) -> Result<ParsedCard, String> {
    import_card_png_inner(PathBuf::from(path)).map_err(command_error)
}

#[tauri::command]
pub fn export_charx(
    path: String,
    card: CharacterCardV3,
    assets: Vec<CharxAssetInput>,
) -> Result<ParsedCard, String> {
    export_charx_inner(PathBuf::from(path), card, assets).map_err(command_error)
}

#[tauri::command]
pub fn import_charx(path: String) -> Result<ParsedCard, String> {
    import_charx_inner(PathBuf::from(path)).map_err(command_error)
}

#[tauri::command]
pub fn validate_card(card: CharacterCardV3) -> ValidationReport {
    validate_card_report(&card)
}

fn open_card_file_inner(path: PathBuf) -> CardResult<ParsedCard> {
    match extension(&path).as_deref() {
        Some("json") => import_json(&path),
        Some("png") | Some("apng") => import_card_png_inner(path),
        Some("charx") => import_charx_inner(path),
        _ => Err(CardError::Invalid(
            "Supported card files are JSON, PNG/APNG, and CHARX.".to_string(),
        )),
    }
}

fn import_json(path: &Path) -> CardResult<ParsedCard> {
    let text = fs::read_to_string(path)?;
    let value: Value = serde_json::from_str(&text)?;
    let (card, warnings, source_format) = migrate_value_to_v3(value)?;
    Ok(parsed(card, warnings, source_format, None))
}

fn save_card_json_inner(path: PathBuf, card: CharacterCardV3) -> CardResult<ParsedCard> {
    let card = prepare_export_card(card)?;
    fs::write(&path, serde_json::to_string_pretty(&card)?)?;
    Ok(parsed(card, Vec::new(), "v3".to_string(), None))
}

fn export_card_png_inner(
    path: PathBuf,
    base_png_path: Option<PathBuf>,
    base_png_data_url: Option<String>,
    card: CharacterCardV3,
) -> CardResult<ParsedCard> {
    let card = prepare_export_card(card)?;
    let base = read_export_base_png(base_png_path, base_png_data_url)?;
    let png = write_card_chunks(&base, &card)?;
    fs::write(&path, png)?;
    Ok(parsed(card, Vec::new(), "png-ccv3".to_string(), None))
}

fn read_export_base_png(
    base_png_path: Option<PathBuf>,
    base_png_data_url: Option<String>,
) -> CardResult<Vec<u8>> {
    if let Some(data_url) = base_png_data_url.filter(|value| !value.trim().is_empty()) {
        return decode_png_data_url(&data_url);
    }

    let path = base_png_path.ok_or_else(|| {
        CardError::Invalid("A PNG cover image is required before exporting PNG.".to_string())
    })?;
    Ok(fs::read(path)?)
}

fn decode_png_data_url(data_url: &str) -> CardResult<Vec<u8>> {
    let (metadata, encoded) = data_url
        .trim()
        .split_once(',')
        .ok_or_else(|| CardError::Invalid("Cover image data URL is malformed.".to_string()))?;
    let metadata = metadata.to_ascii_lowercase();
    if !metadata.starts_with("data:image/") || !metadata.contains(";base64") {
        return Err(CardError::Invalid(
            "Cover image must be a base64 image data URL.".to_string(),
        ));
    }
    Ok(STANDARD.decode(encoded.trim())?)
}

fn import_card_png_inner(path: PathBuf) -> CardResult<ParsedCard> {
    let bytes = fs::read(&path)?;
    if let Some((value, source_format)) = read_card_value(&bytes)? {
        let (card, mut warnings, _) = migrate_value_to_v3(value)?;
        if source_format == "png-chara" {
            warnings
                .push("Imported legacy PNG chara metadata and migrated it to CCv3.".to_string());
        }
        return Ok(parsed(card, warnings, source_format, None));
    }

    let mut card = CharacterCardV3::blank(crate::card_schema::current_unix_seconds());
    card.data.assets = Some(vec![CardAsset {
        r#type: "icon".to_string(),
        uri: format!("file://{}", path.to_string_lossy().replace('\\', "/")),
        name: "main".to_string(),
        ext: extension(&path).unwrap_or_else(|| "png".to_string()),
        extra: Default::default(),
    }]);
    Ok(parsed(
        card,
        vec!["PNG did not contain card metadata; imported it as an image asset.".to_string()],
        "png-asset".to_string(),
        None,
    ))
}

fn export_charx_inner(
    path: PathBuf,
    card: CharacterCardV3,
    assets: Vec<CharxAssetInput>,
) -> CardResult<ParsedCard> {
    let card = prepare_export_card(card)?;
    export_charx_file(&path, &card, &assets)?;
    Ok(parsed(card, Vec::new(), "charx".to_string(), None))
}

fn import_charx_inner(path: PathBuf) -> CardResult<ParsedCard> {
    let (card, warnings, asset_files) = import_charx_file(&path)?;
    Ok(parsed(
        card,
        warnings,
        "charx".to_string(),
        Some(asset_files),
    ))
}

fn prepare_export_card(card: CharacterCardV3) -> CardResult<CharacterCardV3> {
    let card = touch_for_export(card);
    ensure_valid_for_export(&card).map_err(CardError::Invalid)?;
    Ok(card)
}

fn parsed(
    card: CharacterCardV3,
    warnings: Vec<String>,
    source_format: String,
    asset_files: Option<Vec<crate::card_schema::AssetFile>>,
) -> ParsedCard {
    let report = validate_card_report(&card);
    ParsedCard {
        card,
        report,
        warnings,
        source_format,
        asset_files,
    }
}

fn extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.trim_start_matches('.').to_ascii_lowercase())
}
