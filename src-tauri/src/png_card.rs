use crate::card_schema::CharacterCardV3;
use crate::errors::{CardError, CardResult};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use crc32fast::Hasher;
use serde_json::Value;
use std::collections::BTreeMap;

const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

pub fn text_chunks(bytes: &[u8]) -> CardResult<BTreeMap<String, String>> {
    ensure_png(bytes)?;
    let mut chunks = BTreeMap::new();
    let mut offset = PNG_SIGNATURE.len();
    while offset + 12 <= bytes.len() {
        let length = u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
        let chunk_type = &bytes[offset + 4..offset + 8];
        let data_start = offset + 8;
        let data_end = data_start + length;
        let next = data_end + 4;
        if next > bytes.len() {
            return Err(CardError::Invalid("PNG metadata is truncated.".to_string()));
        }
        if chunk_type == b"tEXt" {
            let data = &bytes[data_start..data_end];
            if let Some(separator) = data.iter().position(|byte| *byte == 0) {
                let key = String::from_utf8_lossy(&data[..separator]).to_string();
                let value = String::from_utf8_lossy(&data[separator + 1..]).to_string();
                chunks.insert(key, value);
            }
        }
        offset = next;
        if chunk_type == b"IEND" {
            break;
        }
    }
    Ok(chunks)
}

pub fn write_card_chunks(
    base_png: &[u8],
    card: &CharacterCardV3,
    include_v2: bool,
) -> CardResult<Vec<u8>> {
    let ccv3 = STANDARD.encode(serde_json::to_string(card)?);
    let mut entries = vec![("ccv3", ccv3)];
    if include_v2 {
        entries.push((
            "chara",
            STANDARD.encode(serde_json::to_string(&downgrade_to_v2(card))?),
        ));
    }
    write_text_chunks(base_png, &entries)
}

pub fn read_card_value(bytes: &[u8]) -> CardResult<Option<(Value, String)>> {
    let chunks = text_chunks(bytes)?;
    if let Some(value) = chunks.get("ccv3") {
        return Ok(Some((decode_json_chunk(value)?, "png-ccv3".to_string())));
    }
    if let Some(value) = chunks.get("chara") {
        return Ok(Some((decode_json_chunk(value)?, "png-chara".to_string())));
    }
    Ok(None)
}

pub fn write_text_chunks(base_png: &[u8], entries: &[(&str, String)]) -> CardResult<Vec<u8>> {
    ensure_png(base_png)?;
    let mut output = Vec::with_capacity(
        base_png.len()
            + entries
                .iter()
                .map(|(_, value)| value.len() + 16)
                .sum::<usize>(),
    );
    output.extend_from_slice(PNG_SIGNATURE);

    let mut offset = PNG_SIGNATURE.len();
    let mut inserted = false;
    while offset + 12 <= base_png.len() {
        let length = u32::from_be_bytes(base_png[offset..offset + 4].try_into().unwrap()) as usize;
        let chunk_type = &base_png[offset + 4..offset + 8];
        let data_start = offset + 8;
        let data_end = data_start + length;
        let next = data_end + 4;
        if next > base_png.len() {
            return Err(CardError::Invalid("PNG metadata is truncated.".to_string()));
        }

        if chunk_type == b"IEND" && !inserted {
            for (key, value) in entries {
                output.extend_from_slice(&encode_text_chunk(key, value));
            }
            inserted = true;
        }

        if !is_removed_export_chunk(chunk_type, &base_png[data_start..data_end]) {
            output.extend_from_slice(&base_png[offset..next]);
        }

        offset = next;
        if chunk_type == b"IEND" {
            break;
        }
    }

    if !inserted {
        return Err(CardError::Invalid(
            "PNG file does not contain an IEND chunk.".to_string(),
        ));
    }
    Ok(output)
}

fn ensure_png(bytes: &[u8]) -> CardResult<()> {
    if bytes.len() < PNG_SIGNATURE.len() || &bytes[..PNG_SIGNATURE.len()] != PNG_SIGNATURE {
        return Err(CardError::Invalid(
            "The selected image is not a PNG/APNG file.".to_string(),
        ));
    }
    Ok(())
}

fn decode_json_chunk(encoded: &str) -> CardResult<Value> {
    let decoded = STANDARD.decode(encoded)?;
    Ok(serde_json::from_slice(&decoded)?)
}

fn downgrade_to_v2(card: &CharacterCardV3) -> Value {
    let mut value = serde_json::to_value(card).unwrap_or(Value::Null);
    if let Value::Object(root) = &mut value {
        root.insert(
            "spec".to_string(),
            Value::String("chara_card_v2".to_string()),
        );
        root.insert("spec_version".to_string(), Value::String("2.0".to_string()));
        if let Some(Value::Object(data)) = root.get_mut("data") {
            for key in [
                "assets",
                "nickname",
                "creator_notes_multilingual",
                "source",
                "group_only_greetings",
                "creation_date",
                "modification_date",
            ] {
                data.remove(key);
            }
        }
    }
    value
}

fn is_removed_export_chunk(chunk_type: &[u8], data: &[u8]) -> bool {
    if chunk_type == b"caBX" {
        return true;
    }
    chunk_type == b"tEXt"
        && (data.strip_prefix(b"ccv3\0").is_some()
            || data.strip_prefix(b"chara\0").is_some())
}

fn encode_text_chunk(key: &str, value: &str) -> Vec<u8> {
    let mut data = Vec::with_capacity(key.len() + value.len() + 1);
    data.extend_from_slice(key.as_bytes());
    data.push(0);
    data.extend_from_slice(value.as_bytes());
    encode_chunk(*b"tEXt", &data)
}

fn encode_chunk(chunk_type: [u8; 4], data: &[u8]) -> Vec<u8> {
    let mut output = Vec::with_capacity(data.len() + 12);
    output.extend_from_slice(&(data.len() as u32).to_be_bytes());
    output.extend_from_slice(&chunk_type);
    output.extend_from_slice(data);

    let mut hasher = Hasher::new();
    hasher.update(&chunk_type);
    hasher.update(data);
    output.extend_from_slice(&hasher.finalize().to_be_bytes());
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card_schema::CharacterCardV3;

    fn minimal_png() -> Vec<u8> {
        let mut png = Vec::from(PNG_SIGNATURE.as_slice());
        png.extend_from_slice(&encode_chunk(*b"IEND", &[]));
        png
    }

    #[test]
    fn writes_and_reads_ccv3_chunk() {
        let card = CharacterCardV3::blank(1);
        let output = write_card_chunks(&minimal_png(), &card, false).unwrap();
        let chunks = text_chunks(&output).unwrap();
        assert!(chunks.contains_key("ccv3"));
        let (value, source) = read_card_value(&output).unwrap().unwrap();
        assert_eq!(source, "png-ccv3");
        assert_eq!(value["spec"], "chara_card_v3");
    }

    #[test]
    fn strips_c2pa_box_chunks_on_export() {
        let mut png = Vec::from(PNG_SIGNATURE.as_slice());
        png.extend_from_slice(&encode_chunk(*b"IHDR", &[0; 13]));
        png.extend_from_slice(&encode_chunk(*b"caBX", b"provenance"));
        png.extend_from_slice(&encode_chunk(*b"IEND", &[]));

        let card = CharacterCardV3::blank(1);
        let output = write_card_chunks(&png, &card, false).unwrap();

        assert!(!output.windows(4).any(|window| window == b"caBX"));
        assert!(text_chunks(&output).unwrap().contains_key("ccv3"));
    }
}
