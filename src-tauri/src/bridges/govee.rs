use std::time::Duration;

use crate::error::{BridgeError, BridgeResult};
use serde_json::Value;
use tauri::async_runtime::spawn_blocking;

const DEFAULT_UDP_PORT: u16 = 4003;
const DEFAULT_TIMEOUT_MS: u64 = 1500;

#[derive(Default)]
pub struct GoveeSender;

impl GoveeSender {
    pub async fn send(&self, host: &str, port: Option<u16>, body: &Value) -> BridgeResult<()> {
        let host = host.trim();
        if host.is_empty() {
            return Err(BridgeError::Invalid("Missing host".into()));
        }

        let message = if body.is_string() {
            body.as_str()
                .unwrap_or_default()
                .to_string()
        } else {
            serde_json::to_string(body)
                .map_err(|err| BridgeError::Invalid(format!("Invalid payload: {err}")))?
        };

        let address = format!("{host}:{}", port.unwrap_or(DEFAULT_UDP_PORT));

        spawn_blocking(move || -> BridgeResult<()> {
            let socket = std::net::UdpSocket::bind("0.0.0.0:0")?;
            socket.set_write_timeout(Some(Duration::from_millis(DEFAULT_TIMEOUT_MS)))?;
            socket.send_to(message.as_bytes(), &address)?;
            Ok(())
        })
        .await
        .map_err(|err| BridgeError::Network(err.to_string()))?
    }
}

pub async fn discover(_timeout_ms: Option<u64>) -> BridgeResult<Vec<Value>> {
    // TODO: Implement LAN discovery by listening on UDP 4001-4003 and parsing device announcements.
    Ok(vec![])
}
