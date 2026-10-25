//! Full-text search. Matching ignores case and diacritics with Turkish rules
//! (İ/I/ı all match "i", ş matches "s", ...), supports `"exact phrases"` and
//! `-excluded` terms, and returns a highlighted snippet from the body.

use serde::Serialize;
use zeroize::Zeroizing;

use crate::entry::{plain_text, Entry};

/// Characters of context kept before the first match in a snippet.
const SNIPPET_BEFORE: usize = 50;
const SNIPPET_CHARS: usize = 170;

#[derive(Default, Debug)]
pub struct Query {
    include: Vec<String>,
    exclude: Vec<String>,
}

impl Query {
    pub fn parse(query: &str) -> Self {
        let mut q = Query::default();
        let mut rest = query.trim();
        while !rest.is_empty() {
            let negated = rest.starts_with('-');
            let body = if negated { &rest[1..] } else { rest };
            let (term, tail) = match body.strip_prefix('"') {
                Some(quoted) => quoted.split_once('"').unwrap_or((quoted, "")),
                None => body.split_once(char::is_whitespace).unwrap_or((body, "")),
            };
            let term = fold(term.trim());
            if !term.is_empty() {
                if negated {
                    q.exclude.push(term)
                } else {
                    q.include.push(term)
                }
            }
            rest = tail.trim_start();
        }
        q
    }
}

/// A snippet piece; `true` marks matched text.
pub type Segment = (String, bool);

#[derive(Serialize)]
pub struct Hit {
    pub id: String,
    /// Body text around the first match; empty when only the title or tags matched.
    pub snippet: Vec<Segment>,
}

pub fn search(entry: &Entry, query: &Query) -> Option<Hit> {
    let plain = plain_text(&entry.body);
    let body = Folded::new(&plain);
    let meta = Zeroizing::new(fold(&format!("{}\n{}", entry.title, entry.tags.join(" "))));
    let found = |term: &String| meta.contains(term.as_str()) || body.text.contains(term.as_str());
    if !query.include.iter().all(found) || query.exclude.iter().any(found) {
        return None;
    }
    Some(Hit {
        id: entry.id.clone(),
        snippet: snippet(&plain, &body, &query.include),
    })
}

/// Case and diacritic folding; the result is only used for comparison.
pub fn fold(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    s.chars().for_each(|c| fold_char(c, &mut out));
    out
}

fn fold_char(c: char, out: &mut String) {
    for l in c.to_lowercase() {
        match l {
            '\u{0307}' => {} // the dot `İ` leaves behind when lowercased
            'ı' | 'î' | 'í' | 'ì' | 'ï' => out.push('i'),
            'ş' | 'ś' => out.push('s'),
            'ğ' => out.push('g'),
            'ç' | 'ć' => out.push('c'),
            'ö' | 'ô' | 'ó' | 'ò' | 'õ' => out.push('o'),
            'ü' | 'û' | 'ú' | 'ù' => out.push('u'),
            'â' | 'á' | 'à' | 'ä' | 'ã' | 'å' => out.push('a'),
            'é' | 'è' | 'ê' | 'ë' => out.push('e'),
            'ñ' => out.push('n'),
            'ß' => out.push_str("ss"),
            _ => out.push(l),
        }
    }
}

/// Folded text plus, for each of its bytes, the source char's byte range.
struct Folded {
    text: Zeroizing<String>,
    spans: Vec<(usize, usize)>,
}

impl Folded {
    fn new(source: &str) -> Self {
        let mut text = Zeroizing::new(String::with_capacity(source.len()));
        let mut spans = Vec::with_capacity(source.len());
        for (at, c) in source.char_indices() {
            fold_char(c, &mut text);
            spans.resize(text.len(), (at, at + c.len_utf8()));
        }
        Folded { text, spans }
    }

    /// Source byte ranges of every occurrence of `terms`, sorted and merged.
    fn matches(&self, terms: &[String]) -> Vec<(usize, usize)> {
        let mut ranges: Vec<(usize, usize)> = terms
            .iter()
            .flat_map(|t| self.text.match_indices(t.as_str()).map(|(at, m)| (at, at + m.len())))
            .map(|(a, b)| (self.spans[a].0, self.spans[b - 1].1))
            .collect();
        ranges.sort_unstable();
        let mut merged: Vec<(usize, usize)> = Vec::with_capacity(ranges.len());
        for (a, b) in ranges {
            match merged.last_mut() {
                Some(last) if a <= last.1 => last.1 = last.1.max(b),
                _ => merged.push((a, b)),
            }
        }
        merged
    }
}

fn snippet(plain: &str, folded: &Folded, terms: &[String]) -> Vec<Segment> {
    let ranges = folded.matches(terms);
    let Some(&(first, _)) = ranges.first() else {
        return Vec::new();
    };
    // Start a little before the first match, at a word boundary when one is near.
    let mut start = plain[..first]
        .char_indices()
        .rev()
        .nth(SNIPPET_BEFORE)
        .map_or(0, |(i, _)| i);
    if start > 0 {
        if let Some(space) = plain[start..first].find(' ') {
            start += space + 1;
        }
    }
    let mut end = plain[start..]
        .char_indices()
        .nth(SNIPPET_CHARS)
        .map_or(plain.len(), |(i, _)| start + i);
    if end < plain.len() {
        if let Some(space) = plain[start..end].rfind(' ').filter(|&s| start + s > first) {
            end = start + space;
        }
    }

    let mut out: Vec<Segment> = Vec::new();
    let mut push = |text: &str, hit: bool| {
        if !text.is_empty() {
            out.push((text.to_string(), hit));
        }
    };
    if start > 0 {
        push("…", false);
    }
    let mut at = start;
    for (a, b) in ranges.into_iter().filter(|&(a, b)| a < end && b > start) {
        let (a, b) = (a.max(start), b.min(end));
        push(&plain[at..a], false);
        push(&plain[a..b], true);
        at = b;
    }
    push(&plain[at..end], false);
    if end < plain.len() {
        push("…", false);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(title: &str, body: &str) -> Entry {
        let mut e = Entry::new("2026-10-25").unwrap();
        e.title = title.into();
        e.body = body.into();
        e
    }

    fn hits(q: &str, e: &Entry) -> bool {
        search(e, &Query::parse(q)).is_some()
    }

    #[test]
    fn folds_turkish() {
        assert_eq!(fold("İSTANBUL Işık ŞĞÇÖÜ"), "istanbul isik sgcou");
        let e = entry("İstanbul gezisi", "Kuşlar ve ılık bir ÇAY");
        assert!(hits("istanbul", &e));
        assert!(hits("kus ilik cay", &e));
        assert!(hits("KUŞLAR", &e));
        assert!(!hits("kuşlar deniz", &e));
    }

    #[test]
    fn phrases_and_exclusions() {
        let e = entry("", "sabah erken kalktım, akşam yürüdüm");
        assert!(hits("\"erken kalktım\"", &e));
        assert!(!hits("\"kalktım erken\"", &e));
        assert!(hits("sabah -öğle", &e));
        assert!(!hits("sabah -akşam", &e));
        let q = Query::parse("  - \"\" ");
        assert!(q.include.is_empty() && q.exclude.is_empty());
    }

    #[test]
    fn snippet_highlights_in_original_text() {
        let long = "kelime ".repeat(30);
        let e = entry(
            "",
            &format!("{long}bugün **İstanbul**'da yağmur vardı, İstanbul güzeldi. {long}"),
        );
        let hit = search(&e, &Query::parse("istanbul")).unwrap();
        let marked: Vec<&str> = hit.snippet.iter().filter(|s| s.1).map(|s| s.0.as_str()).collect();
        assert_eq!(marked, vec!["İstanbul", "İstanbul"]);
        assert_eq!(hit.snippet.first().unwrap().0, "…");
        assert_eq!(hit.snippet.last().unwrap().0, "…");
        let text: String = hit.snippet.iter().map(|s| s.0.as_str()).collect();
        assert!(text.contains("bugün İstanbul'da yağmur"), "{text}");
    }

    #[test]
    fn title_only_match_has_no_snippet() {
        let hit = search(&entry("Deniz", "kumsal"), &Query::parse("deniz")).unwrap();
        assert!(hit.snippet.is_empty());
    }
}
