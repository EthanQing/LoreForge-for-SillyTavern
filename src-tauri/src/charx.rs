use crate::card_schema::{AssetFile, CharacterCardV3};
use crate::errors::{CardError, CardResult};
use crate::migration::migrate_value_to_v3;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use tempfile::NamedTempFile;
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
    source_charx_path: Option<&Path>,
) -> CardResult<()> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let mut temp_file = NamedTempFile::new_in(parent)?;
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    {
        let mut zip = ZipWriter::new(temp_file.as_file_mut());
        zip.start_file("card.json", options)?;
        zip.write_all(serde_json::to_string_pretty(card)?.as_bytes())?;

        if let Some(source_path) = source_charx_path {
            let source_file = File::open(source_path)?;
            let mut source_archive = ZipArchive::new(source_file)?;
            for index in 0..source_archive.len() {
                let source_entry = source_archive.by_index(index)?;
                if source_entry.name() != "card.json" {
                    zip.raw_copy_file(source_entry)?;
                }
            }
        }

        for asset in assets {
            validate_asset_path(&asset.target_path)?;
            if asset.target_path == "card.json" {
                return Err(CardError::Invalid(
                    "CHARX assets cannot replace card.json.".to_string(),
                ));
            }
            zip.start_file(asset.target_path.as_str(), options)?;
            let mut source = File::open(&asset.source_path)?;
            std::io::copy(&mut source, &mut zip)?;
        }

        zip.finish()?;
    }

    temp_file.as_file().sync_all()?;
    temp_file
        .persist(path)
        .map_err(|error| CardError::Io(error.error))?;
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

        export_charx_file(&path, &card, &[], None).unwrap();
        let (parsed, _, assets) = import_charx_file(&path).unwrap();

        assert_eq!(parsed.spec, "chara_card_v3");
        assert!(assets.is_empty());
    }

    fn create_source_archive(dir: &Path) -> (std::path::PathBuf, Vec<u8>) {
        let path = dir.join("source.charx");
        let asset_path = dir.join("example.png");
        let asset_bytes = vec![0, 1, 2, 3, 255, 128, 64];
        std::fs::write(&asset_path, &asset_bytes).unwrap();
        let card = CharacterCardV3::blank(100);
        export_charx_file(
            &path,
            &card,
            &[CharxAssetInput {
                source_path: asset_path.to_string_lossy().into_owned(),
                target_path: "assets/example.png".to_string(),
            }],
            None,
        )
        .unwrap();
        (path, asset_bytes)
    }

    fn assert_archive_contents(path: &Path, expected_name: &str, expected_asset: &[u8]) {
        let file = File::open(path).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        let mut card_json = String::new();
        archive
            .by_name("card.json")
            .unwrap()
            .read_to_string(&mut card_json)
            .unwrap();
        let card: CharacterCardV3 = serde_json::from_str(&card_json).unwrap();
        assert_eq!(card.data.name, expected_name);

        let mut asset = Vec::new();
        archive
            .by_name("assets/example.png")
            .unwrap()
            .read_to_end(&mut asset)
            .unwrap();
        assert_eq!(asset, expected_asset);
    }

    #[test]
    fn save_as_preserves_source_assets() {
        let dir = tempdir().unwrap();
        let (source_path, asset_bytes) = create_source_archive(dir.path());
        let target_path = dir.path().join("target.charx");
        let mut card = CharacterCardV3::blank(200);
        card.data.name = "Updated".to_string();

        export_charx_file(&target_path, &card, &[], Some(&source_path)).unwrap();

        assert_archive_contents(&target_path, "Updated", &asset_bytes);
    }

    #[test]
    fn overwrite_preserves_source_assets() {
        let dir = tempdir().unwrap();
        let (path, asset_bytes) = create_source_archive(dir.path());
        let mut card = CharacterCardV3::blank(200);
        card.data.name = "Updated in place".to_string();

        export_charx_file(&path, &card, &[], Some(&path)).unwrap();

        assert_archive_contents(&path, "Updated in place", &asset_bytes);
    }

    #[test]
    fn failed_overwrite_preserves_original_archive() {
        let dir = tempdir().unwrap();
        let (path, _) = create_source_archive(dir.path());
        let original = std::fs::read(&path).unwrap();
        let missing_path = dir.path().join("missing.png");
        let card = CharacterCardV3::blank(200);

        let result = export_charx_file(
            &path,
            &card,
            &[CharxAssetInput {
                source_path: missing_path.to_string_lossy().into_owned(),
                target_path: "assets/missing.png".to_string(),
            }],
            Some(&path),
        );

        assert!(result.is_err());
        assert_eq!(std::fs::read(&path).unwrap(), original);
    }

    #[test]
    fn rejects_asset_that_replaces_card_json() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("card.charx");
        let asset_path = dir.path().join("asset.json");
        std::fs::write(&asset_path, b"{}").unwrap();

        let result = export_charx_file(
            &path,
            &CharacterCardV3::blank(100),
            &[CharxAssetInput {
                source_path: asset_path.to_string_lossy().into_owned(),
                target_path: "card.json".to_string(),
            }],
            None,
        );

        assert!(matches!(result, Err(CardError::Invalid(_))));
        assert!(!path.exists());
    }
}
