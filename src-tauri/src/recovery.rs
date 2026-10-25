//! Recovery keys: a random 160-bit secret shown to the user once, written as
//! 32 Crockford Base32 characters in groups of four (`ABCD-EFGH-…`). It wraps
//! the same data key as the password, so either one unlocks the vault.

use chacha20poly1305::aead::{rand_core::RngCore, OsRng};
use zeroize::Zeroizing;

const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SECRET_BYTES: usize = 20;
pub const CODE_CHARS: usize = SECRET_BYTES * 8 / 5;

/// A fresh recovery key, formatted for display.
pub fn generate() -> Zeroizing<String> {
    let mut bytes = Zeroizing::new([0u8; SECRET_BYTES]);
    OsRng.fill_bytes(&mut bytes[..]);
    let mut code = Zeroizing::new(String::with_capacity(CODE_CHARS + CODE_CHARS / 4));
    let (mut buffer, mut bits) = (0u32, 0u32);
    for &b in bytes.iter() {
        buffer = (buffer << 8) | b as u32;
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            if !code.is_empty() && (code.len() + 1).is_multiple_of(5) {
                code.push('-');
            }
            code.push(ALPHABET[((buffer >> bits) & 31) as usize] as char);
        }
    }
    code
}

/// Canonical form used for key derivation: separators and case are ignored,
/// and look-alike characters are mapped the Crockford way (O→0, I/L→1).
/// Returns None when the input cannot be a recovery key.
pub fn normalize(input: &str) -> Option<Zeroizing<String>> {
    let mut out = Zeroizing::new(String::with_capacity(CODE_CHARS));
    for c in input.chars() {
        let c = match c.to_ascii_uppercase() {
            '-' | ' ' => continue,
            'O' => '0',
            'I' | 'L' => '1',
            c => c,
        };
        if !ALPHABET.contains(&(c as u8)) || !c.is_ascii() {
            return None;
        }
        out.push(c);
    }
    (out.len() == CODE_CHARS).then_some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_codes_are_well_formed() {
        let code = generate();
        assert_eq!(code.len(), CODE_CHARS + CODE_CHARS / 4 - 1);
        assert!(code.split('-').all(|g| g.len() == 4));
        assert_ne!(*code, *generate());
    }

    #[test]
    fn normalization_is_forgiving() {
        let code = generate();
        let canonical = normalize(&code).unwrap();
        let sloppy = code.to_lowercase().replace('-', " ").replace('0', "o").replace('1', "l");
        assert_eq!(*normalize(&sloppy).unwrap(), *canonical);
        assert!(normalize("ABCD").is_none());
        assert!(normalize(&format!("{}U", &canonical[..CODE_CHARS - 1])).is_none());
    }
}
