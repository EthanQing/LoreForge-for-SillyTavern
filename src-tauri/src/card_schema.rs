use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::time::{SystemTime, UNIX_EPOCH};

pub type ExtraFields = Map<String, Value>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterCardV3 {
    #[serde(default = "default_spec")]
    pub spec: String,
    #[serde(default = "default_spec_version")]
    pub spec_version: String,
    #[serde(default)]
    pub data: CharacterCardData,
    #[serde(flatten)]
    pub extra: ExtraFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterCardData {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub creator: String,
    #[serde(default)]
    pub character_version: String,
    #[serde(default)]
    pub mes_example: String,
    #[serde(default)]
    pub extensions: ExtraFields,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default)]
    pub post_history_instructions: String,
    #[serde(default)]
    pub first_mes: String,
    #[serde(default)]
    pub alternate_greetings: Vec<String>,
    #[serde(default)]
    pub personality: String,
    #[serde(default)]
    pub scenario: String,
    #[serde(default)]
    pub creator_notes: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub character_book: Option<Lorebook>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assets: Option<Vec<CardAsset>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nickname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub creator_notes_multilingual: Option<std::collections::BTreeMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<Vec<String>>,
    #[serde(default)]
    pub group_only_greetings: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub creation_date: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modification_date: Option<u64>,
    #[serde(flatten)]
    pub extra: ExtraFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardAsset {
    #[serde(default)]
    pub r#type: String,
    #[serde(default)]
    pub uri: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub ext: String,
    #[serde(flatten)]
    pub extra: ExtraFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lorebook {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scan_depth: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_budget: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recursive_scanning: Option<bool>,
    #[serde(default)]
    pub extensions: ExtraFields,
    #[serde(default)]
    pub entries: Vec<LorebookEntry>,
    #[serde(flatten)]
    pub extra: ExtraFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LorebookEntry {
    #[serde(default)]
    pub keys: Vec<String>,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub extensions: ExtraFields,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub insertion_order: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub case_sensitive: Option<bool>,
    #[serde(default)]
    pub use_regex: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub constant: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selective: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secondary_keys: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<String>,
    #[serde(flatten)]
    pub extra: ExtraFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationIssue {
    pub level: String,
    pub code: String,
    pub path: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationReport {
    pub valid: bool,
    pub errors: Vec<ValidationIssue>,
    pub warnings: Vec<ValidationIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedCard {
    pub card: CharacterCardV3,
    pub report: ValidationReport,
    pub warnings: Vec<String>,
    pub source_format: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_files: Option<Vec<AssetFile>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetFile {
    pub path: String,
    pub name: String,
    pub ext: String,
}

impl Default for CharacterCardV3 {
    fn default() -> Self {
        Self::blank(current_unix_seconds())
    }
}

impl CharacterCardV3 {
    pub fn blank(now: u64) -> Self {
        Self {
            spec: default_spec(),
            spec_version: default_spec_version(),
            data: CharacterCardData {
                creation_date: Some(now),
                modification_date: Some(now),
                ..CharacterCardData::default()
            },
            extra: ExtraFields::new(),
        }
    }
}

impl Default for CharacterCardData {
    fn default() -> Self {
        Self {
            name: String::new(),
            description: String::new(),
            tags: Vec::new(),
            creator: String::new(),
            character_version: String::new(),
            mes_example: String::new(),
            extensions: ExtraFields::new(),
            system_prompt: String::new(),
            post_history_instructions: String::new(),
            first_mes: String::new(),
            alternate_greetings: Vec::new(),
            personality: String::new(),
            scenario: String::new(),
            creator_notes: String::new(),
            character_book: None,
            assets: None,
            nickname: None,
            creator_notes_multilingual: None,
            source: None,
            group_only_greetings: Vec::new(),
            creation_date: None,
            modification_date: None,
            extra: ExtraFields::new(),
        }
    }
}

fn default_spec() -> String {
    "chara_card_v3".to_string()
}

fn default_spec_version() -> String {
    "3.0".to_string()
}

fn default_true() -> bool {
    true
}

pub fn current_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}
