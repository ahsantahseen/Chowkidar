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
      const storedServer = sessionStorage.getItem("chowkidar_selected_server");
      if (storedServer) {
        const selected = JSON.parse(storedServer);
        if (selected?.token) {
          this.token = selected.token;
          this.tokenExpiry = null;
          console.log("✓ Loaded token from selected server");
          return true;
        }
      }
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
    console.warn(
      "Token generation via HTTP is disabled. Use the CLI to generate a token.",
    );
    return null;
  }

  /**
   * Get valid token, generating one if needed
   */
  async getValidToken() {
    if (this.token) {
      return this.token;
    }
    return null;
  }

  /**
   * Validate token with server using Authorization header
   */
  async validateToken(token) {
    console.warn("Token validation via HTTP is disabled.");
    return Boolean(token);
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
