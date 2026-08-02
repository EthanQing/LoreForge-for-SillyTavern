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
                let key = String::from_utf8_lossy(&data[..separator]).to_ascii_lowercase();
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

pub fn write_card_chunks(base_png: &[u8], card: &CharacterCardV3) -> CardResult<Vec<u8>> {
    let ccv3 = serde_json::to_value(card)?;
    let chara = downgrade_to_v2(card);
    let entries = [
        ("chara", STANDARD.encode(serde_json::to_string(&chara)?)),
        ("ccv3", STANDARD.encode(serde_json::to_string(&ccv3)?)),
    ];
    let output = write_text_chunks(base_png, &entries)?;
    verify_card_chunks(&output, &chara, &ccv3)?;
    Ok(output)
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

fn verify_card_chunks(
    bytes: &[u8],
    expected_chara: &Value,
    expected_ccv3: &Value,
) -> CardResult<()> {
    let chunks = text_chunks(bytes)?;
    for (key, expected) in [("chara", expected_chara), ("ccv3", expected_ccv3)] {
        let encoded = chunks.get(key).ok_or_else(|| {
            CardError::Invalid(format!(
                "Exported PNG is missing the {key} character data chunk."
            ))
        })?;
        if decode_json_chunk(encoded)? != *expected {
            return Err(CardError::Invalid(format!(
                "Exported PNG {key} character data did not pass verification."
            )));
        }
    }
    Ok(())
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
    if chunk_type != b"tEXt" {
        return false;
    }
    let Some(separator) = data.iter().position(|byte| *byte == 0) else {
        return false;
    };
    data[..separator].eq_ignore_ascii_case(b"ccv3")
        || data[..separator].eq_ignore_ascii_case(b"chara")
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

    fn one_pixel_png() -> Vec<u8> {
        STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
            .unwrap()
    }

    fn text_keywords(bytes: &[u8]) -> Vec<String> {
        let mut keywords = Vec::new();
        let mut offset = PNG_SIGNATURE.len();
        while offset + 12 <= bytes.len() {
            let length = u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
            let chunk_type = &bytes[offset + 4..offset + 8];
            let data_start = offset + 8;
            let data_end = data_start + length;
            if chunk_type == b"tEXt" {
                let data = &bytes[data_start..data_end];
                if let Some(separator) = data.iter().position(|byte| *byte == 0) {
                    keywords.push(String::from_utf8_lossy(&data[..separator]).to_string());
                }
            }
            offset = data_end + 4;
            if chunk_type == b"IEND" {
                break;
            }
        }
        keywords
    }

    fn chunks_have_valid_crc(bytes: &[u8]) -> bool {
        let mut offset = PNG_SIGNATURE.len();
        while offset + 12 <= bytes.len() {
            let length = u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
            let chunk_type = &bytes[offset + 4..offset + 8];
            let data_end = offset + 8 + length;
            let expected = u32::from_be_bytes(bytes[data_end..data_end + 4].try_into().unwrap());
            let mut hasher = Hasher::new();
            hasher.update(chunk_type);
            hasher.update(&bytes[offset + 8..data_end]);
            if hasher.finalize() != expected {
                return false;
            }
            offset = data_end + 4;
            if chunk_type == b"IEND" {
                return offset == bytes.len();
            }
        }
        false
    }

    #[test]
    fn writes_tavern_compatible_chara_before_ccv3() {
        let card = CharacterCardV3::blank(1);
        let output = write_card_chunks(&one_pixel_png(), &card).unwrap();
        let chunks = text_chunks(&output).unwrap();
        assert_eq!(text_keywords(&output), ["chara", "ccv3"]);
        assert!(chunks_have_valid_crc(&output));
        assert_eq!(
            decode_json_chunk(&chunks["chara"]).unwrap()["spec"],
            "chara_card_v2"
        );
        assert!(chunks.contains_key("ccv3"));
        let (value, source) = read_card_value(&output).unwrap().unwrap();
        assert_eq!(source, "png-ccv3");
        assert_eq!(value["spec"], "chara_card_v3");
    }

    #[test]
    fn replaces_existing_character_chunks_case_insensitively() {
        let mut png = Vec::from(PNG_SIGNATURE.as_slice());
        png.extend_from_slice(&encode_chunk(*b"IHDR", &[0; 13]));
        png.extend_from_slice(&encode_chunk(*b"caBX", b"provenance"));
        png.extend_from_slice(&encode_text_chunk("ChArA", "stale"));
        png.extend_from_slice(&encode_text_chunk("CCV3", "stale"));
        png.extend_from_slice(&encode_chunk(*b"IEND", &[]));

        let card = CharacterCardV3::blank(1);
        let output = write_card_chunks(&png, &card).unwrap();

        assert!(!output.windows(4).any(|window| window == b"caBX"));
        assert_eq!(text_keywords(&output), ["chara", "ccv3"]);
        assert_eq!(text_chunks(&output).unwrap().len(), 2);
    }
}
