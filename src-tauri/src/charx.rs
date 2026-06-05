use crate::card_schema::{AssetFile, CharacterCardV3};
use crate::errors::{CardError, CardResult};
use crate::migration::migrate_value_to_v3;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharxAssetInput {
    pub source_path: String,
    pub target_path: String,
}

pub fn export_charx_file(
    path: &Path,
    card: &CharacterCardV3,
    assets: &[CharxAssetInput],
) -> CardResult<()> {
    let file = File::create(path)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    zip.start_file("card.json", options)?;
    zip.write_all(serde_json::to_string_pretty(card)?.as_bytes())?;

    for asset in assets {
        validate_asset_path(&asset.target_path)?;
        zip.start_file(asset.target_path.as_str(), options)?;
        let mut source = File::open(&asset.source_path)?;
        std::io::copy(&mut source, &mut zip)?;
    }

    zip.finish()?;
    Ok(())
}

pub fn import_charx_file(
    path: &Path,
) -> CardResult<(CharacterCardV3, Vec<String>, Vec<AssetFile>)> {
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut card_json = String::new();
    archive
        .by_name("card.json")
        .map_err(|_| CardError::Invalid("CHARX archive is missing card.json.".to_string()))?
        .read_to_string(&mut card_json)?;

    let value = serde_json::from_str(&card_json)?;
    let (card, warnings, _) = migrate_value_to_v3(value)?;
    let mut asset_files = Vec::new();

    for index in 0..archive.len() {
        let file = archive.by_index(index)?;
        let name = file.name().to_string();
        if name == "card.json" || name.ends_with('/') {
            continue;
        }
        let ext = name
            .rsplit('.')
            .next()
            .filter(|part| *part != name)
            .unwrap_or("unknown")
            .to_lowercase();
        asset_files.push(AssetFile {
            path: name.clone(),
            name,
            ext,
        });
    }

    Ok((card, warnings, asset_files))
}

fn validate_asset_path(path: &str) -> CardResult<()> {
    if path.is_empty()
        || path.starts_with('/')
        || path.contains('\\')
        || path.split('/').any(|part| part == ".." || part.is_empty())
    {
        return Err(CardError::Invalid(
            "CHARX asset paths must be relative ASCII-style paths.".to_string(),
        ));
    }
    if !path.is_ascii() {
        return Err(CardError::Invalid(
            "CHARX asset paths should use ASCII characters.".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card_schema::CharacterCardV3;
    use tempfile::tempdir;

    #[test]
    fn exports_and_reads_card_json() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("card.charx");
        let card = CharacterCardV3::blank(100);

        export_charx_file(&path, &card, &[]).unwrap();
        let (parsed, _, assets) = import_charx_file(&path).unwrap();

        assert_eq!(parsed.spec, "chara_card_v3");
        assert!(assets.is_empty());
    }
}
