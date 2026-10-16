//! Errors carry a translation key plus arguments, so the UI can show them in the user's language.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, thiserror::Error)]
#[error("{key}")]
pub struct CoreError {
    pub key: String,
    pub args: Vec<String>,
}

pub type CoreResult<T> = Result<T, CoreError>;

impl CoreError {
    pub fn new(key: &str) -> Self {
        CoreError { key: key.to_string(), args: Vec::new() }
    }
    pub fn with(key: &str, args: impl IntoIterator<Item = impl ToString>) -> Self {
        CoreError { key: key.to_string(), args: args.into_iter().map(|a| a.to_string()).collect() }
    }
    pub fn unreadable() -> Self {
        Self::new("err.unreadable")
    }
    pub fn encode_failed() -> Self {
        Self::new("err.encodeFailed")
    }
    pub fn verify_failed() -> Self {
        Self::new("err.verifyFailed")
    }
    pub fn corrupt(why: impl ToString) -> Self {
        Self::with("err.corrupt", [why.to_string()])
    }
    pub fn unsupported(key: &str) -> Self {
        Self::new(key)
    }
    pub fn write_failed(why: impl ToString) -> Self {
        Self::with("err.writeFailed", [why.to_string()])
    }
    pub fn format_unavailable(name: &str) -> Self {
        Self::with("err.formatUnavailable", [name])
    }
}

/// A localisable note shown next to a finished file ("Resized to 800 × 600 pixels.").
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Note {
    pub key: String,
    pub args: Vec<String>,
}

impl Note {
    pub fn new(key: &str) -> Self {
        Note { key: key.to_string(), args: Vec::new() }
    }
    pub fn with(key: &str, args: impl IntoIterator<Item = impl ToString>) -> Self {
        Note { key: key.to_string(), args: args.into_iter().map(|a| a.to_string()).collect() }
    }
}
