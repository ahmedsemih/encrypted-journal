//! Links between entries, written as standard Markdown: `[text](entry:<uuid>)`.
//! Ids survive renames and date changes; the text is whatever the user wrote.

pub const SCHEME: &str = "entry:";

/// Ids of all entries linked from a Markdown body (may repeat).
pub fn references(body: &str) -> impl Iterator<Item = &str> {
    body.match_indices(SCHEME).filter_map(|(at, _)| {
        let id = body.get(at + SCHEME.len()..at + SCHEME.len() + 36)?;
        uuid::Uuid::parse_str(id).ok().map(|_| id)
    })
}

/// Replaces `[text](target)` with `text`, for plain-text views of the body.
pub fn strip_targets(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(open) = rest.find('[') {
        let after = &rest[open + 1..];
        let Some((label, tail)) = after.split_once("](") else {
            break;
        };
        let Some(close) = tail.find(')').filter(|_| !label.contains('[') && !label.contains('\n')) else {
            out.push_str(&rest[..=open]);
            rest = after;
            continue;
        };
        out.push_str(&rest[..open]);
        out.push_str(label);
        rest = &tail[close + 1..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_references() {
        let id = "0b6f3a52-0c1e-4c3f-9e4a-2f6d1c0b9a77";
        let body = format!("bkz. [dün](entry:{id}) ve [site](https://x.org) entry:yok");
        assert_eq!(references(&body).collect::<Vec<_>>(), vec![id]);
    }

    #[test]
    fn strips_targets() {
        assert_eq!(
            strip_targets("bkz. [dün](entry:abc) ve [site](https://x.org)."),
            "bkz. dün ve site."
        );
        assert_eq!(strip_targets("[ ] yapılacak ve [a] [b](c)"), "[ ] yapılacak ve [a] b");
        assert_eq!(strip_targets("yarım [link"), "yarım [link");
    }
}
