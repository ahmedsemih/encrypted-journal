//! Journal entry model and its Markdown (front matter) representation.
//!
//! Each entry is serialized as a Markdown document with a YAML front matter
//! block. Every front matter value is written as JSON, which is valid YAML,
//! so the files stay standard Markdown while parsing stays unambiguous:
//!
//! ```text
//! ---
//! title: "Bugün"
//! date: "2026-10-25"
//! tags: ["iş", "spor"]
//! ---
//!
//! # Markdown body
//! ```

use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

use crate::error::{AppError, AppResult};

const MAX_TITLE_CHARS: usize = 200;
const MAX_TAGS: usize = 30;
const MAX_TAG_CHARS: usize = 40;
const EXCERPT_CHARS: usize = 160;

#[derive(Serialize, Deserialize, Clone, Debug, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub title: String,
    /// Journal day, `YYYY-MM-DD`.
    pub date: String,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<String>,
    pub mood: Option<String>,
    pub favorite: bool,
    /// Set while the entry sits in the trash.
    pub deleted_at: Option<String>,
    pub body: String,
}

/// Fields the frontend may change.
#[derive(Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase")]
pub struct EntryInput {
    pub id: String,
    pub title: String,
    pub date: String,
    pub tags: Vec<String>,
    pub mood: Option<String>,
    pub favorite: bool,
    pub body: String,
}

/// Initial content for a new entry, taken from a template (placeholders are
/// already filled in by the frontend).
#[derive(Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase")]
pub struct EntryTemplate {
    pub title: String,
    pub body: String,
    pub tags: Vec<String>,
}

/// Lightweight listing data (no full body).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EntryMeta {
    pub id: String,
    pub title: String,
    pub date: String,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<String>,
    pub mood: Option<String>,
    pub favorite: bool,
    pub deleted_at: Option<String>,
    pub excerpt: String,
    pub word_count: usize,
}

pub fn now() -> String {
    Local::now().to_rfc3339()
}

pub fn validate_date(date: &str) -> AppResult<()> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map(|_| ())
        .map_err(|_| AppError::Invalid("invalidDate"))
}

pub fn validate_id(id: &str) -> AppResult<()> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| AppError::Invalid("invalidId"))
}

fn normalize_tags(tags: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for tag in tags {
        let tag: String = tag.trim().trim_start_matches('#').chars().take(MAX_TAG_CHARS).collect();
        if !tag.is_empty() && !out.iter().any(|t| t.to_lowercase() == tag.to_lowercase()) {
            out.push(tag);
        }
        if out.len() == MAX_TAGS {
            break;
        }
    }
    out
}

impl Entry {
    pub fn new(date: &str) -> AppResult<Self> {
        validate_date(date)?;
        let ts = now();
        Ok(Self {
            id: uuid::Uuid::new_v4().to_string(),
            title: String::new(),
            date: date.to_string(),
            created_at: ts.clone(),
            updated_at: ts,
            tags: Vec::new(),
            mood: None,
            favorite: false,
            deleted_at: None,
            body: String::new(),
        })
    }

    /// A new entry pre-filled from a template. `updated_at` stays equal to
    /// `created_at`, which marks the entry as not yet edited by the user.
    pub fn from_template(date: &str, template: &EntryTemplate) -> AppResult<Self> {
        let mut entry = Self::new(date)?;
        entry.title = template.title.trim().chars().take(MAX_TITLE_CHARS).collect();
        entry.body = template.body.clone();
        entry.tags = normalize_tags(&template.tags);
        Ok(entry)
    }

    /// Applies user edits, validating and normalizing them.
    pub fn apply(&mut self, input: &EntryInput) -> AppResult<()> {
        validate_date(&input.date)?;
        self.title = input.title.trim().chars().take(MAX_TITLE_CHARS).collect();
        self.date = input.date.clone();
        self.tags = normalize_tags(&input.tags);
        self.mood = input.mood.as_ref().map(|m| m.trim().to_string()).filter(|m| !m.is_empty());
        self.favorite = input.favorite;
        self.body = input.body.clone();
        self.updated_at = now();
        Ok(())
    }

    pub fn is_trashed(&self) -> bool {
        self.deleted_at.is_some()
    }

    pub fn meta(&self) -> EntryMeta {
        EntryMeta {
            id: self.id.clone(),
            title: self.title.clone(),
            date: self.date.clone(),
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
            tags: self.tags.clone(),
            mood: self.mood.clone(),
            favorite: self.favorite,
            deleted_at: self.deleted_at.clone(),
            excerpt: excerpt(&self.body),
            word_count: self.body.split_whitespace().count(),
        }
    }

    /// Case-insensitive match: every whitespace-separated term must appear in
    /// the title, body or tags.
    pub fn matches(&self, terms: &[String]) -> bool {
        let haystack = format!("{}\n{}\n{}", self.title, self.tags.join(" "), self.body).to_lowercase();
        terms.iter().all(|t| haystack.contains(t.as_str()))
    }

    pub fn to_markdown(&self) -> Zeroizing<String> {
        fn field(out: &mut String, key: &str, value: impl Serialize) {
            out.push_str(key);
            out.push_str(": ");
            out.push_str(&serde_json::to_string(&value).expect("serializable front matter"));
            out.push('\n');
        }
        let mut out = Zeroizing::new(String::with_capacity(self.body.len() + 256));
        out.push_str("---\n");
        field(&mut out, "title", &self.title);
        field(&mut out, "date", &self.date);
        field(&mut out, "created_at", &self.created_at);
        field(&mut out, "updated_at", &self.updated_at);
        field(&mut out, "tags", &self.tags);
        field(&mut out, "mood", &self.mood);
        field(&mut out, "favorite", self.favorite);
        if let Some(deleted_at) = &self.deleted_at {
            field(&mut out, "deleted_at", deleted_at);
        }
        out.push_str("---\n\n");
        out.push_str(&self.body);
        out
    }

    pub fn from_markdown(id: &str, text: &str) -> AppResult<Self> {
        let bad = || AppError::Invalid("corruptEntry");
        let rest = text.strip_prefix("---\n").ok_or_else(bad)?;
        let end = rest.find("\n---\n").ok_or_else(bad)?;
        let header = &rest[..end];
        let body = &rest[end + "\n---\n".len()..];
        let body = body.strip_prefix('\n').unwrap_or(body);

        let mut fields = Map::new();
        for line in header.lines() {
            if let Some((key, raw)) = line.split_once(':') {
                if let Ok(value) = serde_json::from_str::<Value>(raw.trim()) {
                    fields.insert(key.trim().to_string(), value);
                }
            }
        }
        let text_field = |key: &str| fields.get(key).and_then(Value::as_str).unwrap_or_default().to_string();

        let date = text_field("date");
        validate_date(&date)?;
        let tags = fields
            .get("tags")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();

        Ok(Self {
            id: id.to_string(),
            title: text_field("title"),
            date,
            created_at: text_field("created_at"),
            updated_at: text_field("updated_at"),
            tags,
            mood: fields.get("mood").and_then(Value::as_str).map(String::from),
            favorite: fields.get("favorite").and_then(Value::as_bool).unwrap_or(false),
            deleted_at: fields.get("deleted_at").and_then(Value::as_str).map(String::from),
            body: body.to_string(),
        })
    }
}

/// Plain-text preview of the body with common Markdown syntax stripped.
fn excerpt(body: &str) -> String {
    let mut out = String::new();
    let body = crate::attachments::strip_images(body);
    for line in body.lines() {
        let line = line
            .trim()
            .trim_start_matches(['#', '>', '-', '*', '+', ' '])
            .trim_start_matches("[ ] ")
            .trim_start_matches("[x] ");
        if line.is_empty() || line.starts_with("```") || line.chars().all(|c| matches!(c, '-' | '*' | '_' | '|')) {
            continue;
        }
        let cleaned: String = line.chars().filter(|c| !matches!(c, '*' | '_' | '`' | '~')).collect();
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(&cleaned);
        if out.chars().count() >= EXCERPT_CHARS {
            break;
        }
    }
    if out.chars().count() > EXCERPT_CHARS {
        out = out.chars().take(EXCERPT_CHARS).collect::<String>() + "…";
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_roundtrip() {
        let mut e = Entry::new("2026-10-25").unwrap();
        e.title = "Başlık \"tırnaklı\": test".into();
        e.tags = vec!["iş".into(), "a,b".into()];
        e.mood = Some("good".into());
        e.favorite = true;
        e.body = "# Merhaba\n\n---\n\nAyraçlı gövde\n".into();
        let md = e.to_markdown();
        let back = Entry::from_markdown(&e.id, &md).unwrap();
        assert_eq!(back.title, e.title);
        assert_eq!(back.tags, e.tags);
        assert_eq!(back.mood, e.mood);
        assert!(back.favorite);
        assert_eq!(back.body, e.body);
        assert_eq!(back.date, e.date);
        assert_eq!(back.deleted_at, None);

        e.deleted_at = Some(now());
        let back = Entry::from_markdown(&e.id, &e.to_markdown()).unwrap();
        assert_eq!(back.deleted_at, e.deleted_at);
    }

    #[test]
    fn tags_are_normalized() {
        let tags = normalize_tags(&["  #Spor ".into(), "spor".into(), "".into(), "iş".into()]);
        assert_eq!(tags, vec!["Spor".to_string(), "iş".to_string()]);
    }

    #[test]
    fn excerpt_strips_markdown() {
        assert_eq!(excerpt("# Başlık\n\n**kalın** ve `kod`\n- madde"), "Başlık kalın ve kod madde");
    }
}
