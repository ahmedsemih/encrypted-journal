//! Image attachments. Each image is stored as its own encrypted file and
//! referenced from Markdown as `![alt](attachment:<uuid>)`.

use crate::error::{AppError, AppResult};

pub const SCHEME: &str = "attachment:";
pub const MAX_BYTES: usize = 25 * 1024 * 1024;

/// Supported image formats, detected from the file's magic bytes rather than
/// trusting a file name or a client-supplied MIME type.
pub fn sniff(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    match bytes {
        [0x89, b'P', b'N', b'G', ..] => Some(("image/png", "png")),
        [0xFF, 0xD8, 0xFF, ..] => Some(("image/jpeg", "jpg")),
        [b'G', b'I', b'F', b'8', ..] => Some(("image/gif", "gif")),
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => Some(("image/webp", "webp")),
        _ => None,
    }
}

pub fn validate(bytes: &[u8]) -> AppResult<()> {
    if bytes.len() > MAX_BYTES {
        return Err(AppError::Invalid("attachmentTooLarge"));
    }
    if sniff(bytes).is_none() {
        return Err(AppError::Invalid("unsupportedImage"));
    }
    Ok(())
}

/// Ids of all attachments referenced in a Markdown body.
pub fn references(body: &str) -> impl Iterator<Item = &str> {
    body.match_indices(SCHEME).filter_map(|(at, _)| {
        let id = body.get(at + SCHEME.len()..at + SCHEME.len() + 36)?;
        uuid::Uuid::parse_str(id).ok().map(|_| id)
    })
}

/// Removes `![alt](target)` image syntax, keeping surrounding text.
pub fn strip_images(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("![") {
        let after = &rest[start..];
        let Some(close) = after.find("](").and_then(|mid| after[mid..].find(')').map(|end| mid + end)) else {
            break;
        };
        out.push_str(&rest[..start]);
        rest = &after[close + 1..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sniffs_formats() {
        assert_eq!(sniff(b"\x89PNG\r\n\x1a\n").unwrap().0, "image/png");
        assert_eq!(sniff(&[0xFF, 0xD8, 0xFF, 0xE0]).unwrap().0, "image/jpeg");
        assert_eq!(sniff(b"RIFF\0\0\0\0WEBPVP8 ").unwrap().0, "image/webp");
        assert!(sniff(b"<svg").is_none());
    }

    #[test]
    fn finds_references() {
        let id = "0b6f3a52-0c1e-4c3f-9e4a-2f6d1c0b9a77";
        let body = format!("a ![x](attachment:{id}) b attachment:not-a-uuid ![y](attachment:{id})");
        assert_eq!(references(&body).collect::<Vec<_>>(), vec![id, id]);
    }

    #[test]
    fn strips_images() {
        assert_eq!(strip_images("önce ![resim](attachment:x) sonra"), "önce  sonra");
        assert_eq!(strip_images("![a](b)![c](d)"), "");
        assert_eq!(strip_images("yarım ![a"), "yarım ![a");
    }
}
