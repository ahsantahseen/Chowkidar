/**
 * Authentication & Token Management
 * Handles JWT token generation, storage, and validation
 */

function getBaseUrl() {
  if (window.CHOWKIDAR_BASE_URL) {
    return window.CHOWKIDAR_BASE_URL;
  }
  try {
    const stored = sessionStorage.getItem("chowkidar_selected_server");
    if (stored) {
      const selected = JSON.parse(stored);
      if (selected && selected.url) {
        return selected.url.replace(/\/$/, "");
      }
    }
  } catch (error) {
    // ignore
  }
  return window.location.origin;
}

function buildUrl(path) {
  return `${getBaseUrl()}${path}`;
}

class AuthManager {
  constructor() {
    this.token = null;
    this.tokenExpiry = null;
    this.storageKey = "chowkidar_token";
    this.expiryKey = "chowkidar_token_expiry";
    this.serverName = "browser-client";

    // Load token from localStorage if available
    this.loadStoredToken();
  }

  /**
   * Load token from localStorage
   */
  loadStoredToken() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      const expiry = localStorage.getItem(this.expiryKey);

      if (stored && expiry) {
        const expiryTime = new Date(expiry);
        if (expiryTime > new Date()) {
          this.token = stored;
          this.tokenExpiry = expiryTime;
          console.log("✓ Loaded token from localStorage");
          // Note: Token will be validated on first use via getValidToken()
          return true;
        } else {
          // Token expired, clear it
          console.log("⚠️ Stored token expired, clearing...");
          this.clearToken();
        }
      }
    } catch (error) {
      console.error("Error loading token from localStorage:", error);
    }
    return false;
  }

  /**
   * Generate a new JWT token from the server
   */
  async generateToken() {
    try {
      console.log(
        "🔐 Requesting new token from server with Authorization header...",
      );

      const response = await fetch(
        buildUrl(`/auth/token?server_name=${this.serverName}`),
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Token generation failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.token) {
        throw new Error("No token in response");
      }

      // Store token and expiry
      this.token = data.token;
      this.tokenExpiry = new Date(data.expiry);

      // Persist to localStorage
      localStorage.setItem(this.storageKey, this.token);
      localStorage.setItem(this.expiryKey, this.tokenExpiry.toISOString());

      console.log(`✅ Token generated successfully`);
      console.log(`   Expires: ${this.tokenExpiry.toLocaleString()}`);

      return this.token;
    } catch (error) {
      console.error("❌ Error generating token:", error);
      this.token = null;
      this.tokenExpiry = null;
      return null;
    }
  }

  /**
   * Get valid token, generating one if needed
   */
  async getValidToken() {
    // Check if current token is still valid (with 5 minute buffer)
    if (this.token && this.tokenExpiry) {
      const bufferTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
      if (this.tokenExpiry > bufferTime) {
        console.log("✓ Using existing token");
        return this.token;
      } else {
        console.log("⚠️ Token expiring soon, generating new one");
      }
    }

    // Generate new token
    return await this.generateToken();
  }

  /**
   * Validate token with server using Authorization header
   */
  async validateToken(token) {
    try {
      console.log("✓ Validating token with server (Authorization: Bearer)...");
      const response = await fetch(buildUrl(`/auth/status`), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      console.log(
        "✓ Token validation response:",
        data.valid ? "VALID" : "INVALID",
      );
      return data.valid === true;
    } catch (error) {
      console.error("Error validating token:", error);
      return false;
    }
  }

  /**
   * Clear stored token
   */
  clearToken() {
    this.token = null;
    this.tokenExpiry = null;
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.expiryKey);
    console.log("🗑️ Token cleared");
  }

  /**
   * Get token expiry time
   */
  getExpiryTime() {
    return this.tokenExpiry;
  }

  /**
   * Check if token exists and is valid
   */
  hasValidToken() {
    return (
      this.token !== null &&
      this.tokenExpiry !== null &&
      this.tokenExpiry > new Date()
    );
  }

  /**
   * Get time remaining until token expires (in seconds)
   */
  getTimeUntilExpiry() {
    if (!this.tokenExpiry) return 0;
    return Math.max(0, Math.floor((this.tokenExpiry - new Date()) / 1000));
  }
}

// Global auth manager instance
const authManager = new AuthManager();
