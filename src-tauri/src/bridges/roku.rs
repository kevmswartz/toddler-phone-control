use std::time::Duration;

use crate::error::{BridgeError, BridgeResult};
use reqwest::blocking::Client;
use tauri::async_runtime::spawn_blocking;

#[derive(Clone)]
pub struct RokuHttpClient {
    client: Client,
}

impl Default for RokuHttpClient {
    fn default() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(6))
            .danger_accept_invalid_certs(true)
            .build()
            .expect("Failed to create Roku HTTP client");
        Self { client }
    }
}

impl RokuHttpClient {
    pub async fn get(&self, url: &str) -> BridgeResult<String> {
        let client = self.client.clone();
        let target = url.to_string();

        spawn_blocking(move || -> BridgeResult<String> {
            let response = client
                .get(target)
                .send()
                .map_err(BridgeError::from)?
                .error_for_status()
                .map_err(BridgeError::from)?;
            response.text().map_err(BridgeError::from)
        })
        .await
        .map_err(|err| BridgeError::Network(err.to_string()))?
    }

    pub async fn post(&self, url: &str, body: Option<&str>) -> BridgeResult<()> {
        let client = self.client.clone();
        let target = url.to_string();
        let payload = body.map(|b| b.to_string()).unwrap_or_else(String::new);

        spawn_blocking(move || -> BridgeResult<()> {
            let mut request = client.post(target);
            if !payload.is_empty() {
                request = request.body(payload.clone());
            }

            request
                .send()
                .map_err(BridgeError::from)?
                .error_for_status()
                .map_err(BridgeError::from)?;
            Ok(())
        })
        .await
        .map_err(|err| BridgeError::Network(err.to_string()))?
    }
}
