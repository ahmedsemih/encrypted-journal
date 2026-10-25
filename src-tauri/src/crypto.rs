//! Key derivation and authenticated encryption.
//!
//! - Password -> key-encryption key (KEK) with Argon2id.
//! - A random 256-bit data-encryption key (DEK) encrypts all user data and is
//!   itself stored wrapped (encrypted) by the KEK. Changing the password only
//!   re-wraps the DEK; entries never need re-encryption.
//! - Encryption is XChaCha20-Poly1305 with a random 192-bit nonce per write.

use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chacha20poly1305::{
    aead::{rand_core::RngCore, Aead, AeadCore, KeyInit, OsRng, Payload},
    Key, XChaCha20Poly1305, XNonce,
};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};

pub const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 24;
const TAG_LEN: usize = 16;
const SALT_LEN: usize = 16;
/// Prefix of every encrypted file, lets us evolve the format later.
const BLOB_MAGIC: &[u8; 4] = b"EJ01";

pub type SecretKey = Zeroizing<[u8; KEY_LEN]>;

/// Argon2id parameters, stored next to the wrapped key so they can be raised
/// in future versions without breaking existing vaults.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KdfParams {
    pub algorithm: String,
    /// Memory cost in KiB.
    pub m_cost: u32,
    pub t_cost: u32,
    pub p_cost: u32,
    pub salt: String,
}

impl KdfParams {
    pub fn generate() -> Self {
        let mut salt = [0u8; SALT_LEN];
        OsRng.fill_bytes(&mut salt);
        Self {
            algorithm: "argon2id".into(),
            m_cost: 64 * 1024,
            t_cost: 3,
            p_cost: 4,
            salt: B64.encode(salt),
        }
    }

    #[cfg(test)]
    pub fn fast_for_tests() -> Self {
        Self { m_cost: 1024, t_cost: 1, p_cost: 1, ..Self::generate() }
    }
}

pub fn derive_key(password: &str, kdf: &KdfParams) -> AppResult<SecretKey> {
    if kdf.algorithm != "argon2id" {
        return Err(AppError::invalid("Desteklenmeyen anahtar türetme algoritması"));
    }
    let salt = B64.decode(&kdf.salt).map_err(|_| AppError::Crypto)?;
    let params =
        Params::new(kdf.m_cost, kdf.t_cost, kdf.p_cost, Some(KEY_LEN)).map_err(|_| AppError::Crypto)?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    argon
        .hash_password_into(password.as_bytes(), &salt, &mut key[..])
        .map_err(|_| AppError::Crypto)?;
    Ok(key)
}

pub fn random_key() -> SecretKey {
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    OsRng.fill_bytes(&mut key[..]);
    key
}

pub fn key_from_slice(raw: &[u8]) -> AppResult<SecretKey> {
    if raw.len() != KEY_LEN {
        return Err(AppError::Crypto);
    }
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    key.copy_from_slice(raw);
    Ok(key)
}

/// Encrypts `plaintext` into `MAGIC || nonce || ciphertext+tag`.
/// `aad` binds the ciphertext to its purpose (e.g. the entry id) so blobs
/// cannot be swapped between files undetected.
pub fn seal(key: &[u8; KEY_LEN], plaintext: &[u8], aad: &[u8]) -> AppResult<Vec<u8>> {
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, Payload { msg: plaintext, aad })
        .map_err(|_| AppError::Crypto)?;
    let mut out = Vec::with_capacity(BLOB_MAGIC.len() + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(BLOB_MAGIC);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

pub fn open(key: &[u8; KEY_LEN], blob: &[u8], aad: &[u8]) -> AppResult<Zeroizing<Vec<u8>>> {
    let body = blob.strip_prefix(BLOB_MAGIC.as_slice()).ok_or(AppError::Crypto)?;
    if body.len() < NONCE_LEN + TAG_LEN {
        return Err(AppError::Crypto);
    }
    let (nonce, ciphertext) = body.split_at(NONCE_LEN);
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    cipher
        .decrypt(XNonce::from_slice(nonce), Payload { msg: ciphertext, aad })
        .map(Zeroizing::new)
        .map_err(|_| AppError::Crypto)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let key = random_key();
        let blob = seal(&key, b"merhaba", b"aad").unwrap();
        assert_eq!(open(&key, &blob, b"aad").unwrap().as_slice(), b"merhaba");
    }

    #[test]
    fn wrong_aad_or_key_fails() {
        let key = random_key();
        let blob = seal(&key, b"merhaba", b"aad").unwrap();
        assert!(open(&key, &blob, b"other").is_err());
        assert!(open(&random_key(), &blob, b"aad").is_err());
    }

    #[test]
    fn tampering_fails() {
        let key = random_key();
        let mut blob = seal(&key, b"merhaba", b"aad").unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 1;
        assert!(open(&key, &blob, b"aad").is_err());
    }

    #[test]
    fn kdf_is_deterministic_per_salt() {
        let kdf = KdfParams::fast_for_tests();
        assert_eq!(*derive_key("pw", &kdf).unwrap(), *derive_key("pw", &kdf).unwrap());
        assert_ne!(*derive_key("pw", &kdf).unwrap(), *derive_key("pw2", &kdf).unwrap());
    }
}
