use crate::error::{BridgeError, BridgeResult};
use serde_json::Value;

pub async fn scan(_timeout_ms: Option<u64>) -> BridgeResult<Vec<Value>> {
    // TODO: Implement BLE scanning + Wi-Fi BSSID mapping per platform.
    Err(BridgeError::Unsupported)
}
