/**
 * WebSocket Client for Real-Time Stats
 * Connects to backend WebSocket and receives live system metrics
 */

class WebSocketStatsClient {
  constructor(authManager) {
    this.authManager = authManager;
    this.ws = null;
    this.isConnecting = false;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000; // 2 seconds
    this.messageHandlers = [];
    this.connectionStatusCallback = null;
    this.lastPingTime = null;
    this.pingInterval = null;
  }

  /**
   * Connect to WebSocket server
   */
  async connect() {
    if (this.isConnecting || this.isConnected) {
      console.log("⚠️ Already connected or connecting");
      return;
    }

    try {
      this.isConnecting = true;

      // Get valid token
      let token = await this.authManager.getValidToken();
      if (!token) {
        throw new Error("Failed to obtain authentication token");
      }

      let baseUrl = window.CHOWKIDAR_BASE_URL || window.location.origin;
      if (baseUrl === window.location.origin) {
        try {
          const stored = sessionStorage.getItem("chowkidar_selected_server");
          if (stored) {
            const selected = JSON.parse(stored);
            if (selected && selected.url) {
              baseUrl = selected.url.replace(/\/$/, "");
            }
          }
        } catch (error) {
          // ignore
        }
      }
      const parsedBase = new URL(baseUrl);
      const protocol = parsedBase.protocol === "https:" ? "wss" : "ws";
      const wsUrl = `${protocol}://${parsedBase.host}/ws?token=${token}`;

      console.log("🔌 Connecting to WebSocket...");
      this.ws = new WebSocket(wsUrl);

      // Set a timeout for connection establishment
      const connectionTimeout = setTimeout(() => {
        if (this.isConnecting && !this.isConnected) {
          console.error(
            "❌ WebSocket connection timeout - may be an authentication issue",
          );
          this.isConnecting = false;
          if (this.ws) {
            this.ws.close();
            this.ws = null;
          }

          // If we have a stored token, clear it and try with a fresh one
          if (this.authManager.token) {
            console.log(
              "⚠️ Connection failed - clearing stored token and retrying...",
            );
            this.authManager.clearToken();
            this.scheduleReconnect(2000); // Retry quickly after clearing token
          } else {
            this.scheduleReconnect();
          }
        }
      }, 5000);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        this.handleOpen();
      };
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onerror = (error) => this.handleError(error);
      this.ws.onclose = () => {
        clearTimeout(connectionTimeout);
        this.handleClose();
      };
    } catch (error) {
      console.error("❌ WebSocket connection error:", error);
      this.isConnecting = false;

      // If error mentions signature or token, clear stored token
      if (
        error.message &&
        (error.message.includes("signature") || error.message.includes("token"))
      ) {
        console.log("⚠️ Token-related error detected - clearing stored token");
        this.authManager.clearToken();
      }

      this.scheduleReconnect();
    }
  }

  /**
   * Handle WebSocket open event
   */
  handleOpen() {
    console.log("✅ WebSocket connected");
    this.isConnected = true;
    this.isConnecting = false;
    this.reconnectAttempts = 0;

    // Update UI status
    this.updateConnectionStatus("connected");

    // Send initial authentication message with JWT token
    const token = this.authManager.token;
    if (token) {
      this.send({
        type: "auth",
        token: token,
        timestamp: new Date().toISOString(),
      });
      console.log("📤 Sent WebSocket auth message with JWT token");
    }

    // Send initial ping to server
    this.send({ type: "ping" });

    // Start ping interval to keep connection alive (every 30 seconds)
    this.pingInterval = setInterval(() => {
      if (this.isConnected) {
        this.send({ type: "ping" });
        this.lastPingTime = Date.now();
      }
    }, 30000);
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);

      // Handle pong responses
      if (message.type === "pong") {
        // Connection is alive
        return;
      }

      // Handle auth success response
      if (message.type === "auth_success") {
        console.log("✅ Server confirmed WebSocket authentication");
        console.log(`   Server: ${message.data?.server || "unknown"}`);
        return;
      }

      // Handle auth error response
      if (message.type === "auth_error") {
        console.error(
          "❌ WebSocket authentication failed:",
          message.data?.error,
        );
        return;
      }

      // Handle stats messages
      if (message.type === "stats" && message.data) {
        // Parse data if it's a string (JSON) otherwise use as-is
        let statsData = message.data;
        if (typeof message.data === "string") {
          statsData = JSON.parse(message.data);
        }

        // Notify all registered handlers
        this.messageHandlers.forEach((handler) => {
          try {
            handler(statsData);
          } catch (error) {
            console.error("Error in message handler:", error);
          }
        });
      }
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  }

  /**
   * Handle WebSocket error
   */
  handleError(error) {
    console.error("❌ WebSocket error:", error);
    this.updateConnectionStatus("error");
  }

  /**
   * Handle WebSocket close event
   */
  handleClose() {
    console.log("⚠️ WebSocket disconnected");
    this.isConnected = false;
    this.isConnecting = false;

    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Update UI status
    this.updateConnectionStatus("disconnected");

    // Attempt to reconnect
    this.scheduleReconnect();
  }

  /**
   * Schedule a reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("❌ Max reconnection attempts reached. Giving up.");
      this.updateConnectionStatus("failed");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(
      `🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Send message to server
   */
  send(message) {
    if (!this.isConnected) {
      console.warn("⚠️ WebSocket not connected, cannot send message");
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error("Error sending WebSocket message:", error);
    }
  }

  /**
   * Register handler for stats messages
   */
  onStats(handler) {
    this.messageHandlers.push(handler);
    console.log(
      `✓ Registered stats handler (total: ${this.messageHandlers.length})`,
    );
  }

  /**
   * Register callback for connection status changes
   */
  onConnectionStatusChange(callback) {
    this.connectionStatusCallback = callback;
  }

  /**
   * Update connection status UI
   */
  updateConnectionStatus(status) {
    if (this.connectionStatusCallback) {
      this.connectionStatusCallback(status);
    }

    // Update status indicator
    const statusDot = document.querySelector(".status-dot");
    const statusText = document.querySelector(".status-text");

    if (statusDot && statusText) {
      statusDot.classList.remove("alive", "connecting", "dead");

      switch (status) {
        case "connected":
          statusDot.classList.add("alive");
          statusText.textContent = "Live";
          break;
        case "connecting":
          statusDot.classList.add("connecting");
          statusText.textContent = "Connecting...";
          break;
        case "disconnected":
        case "error":
        case "failed":
          statusDot.classList.add("dead");
          statusText.textContent = "Offline";
          break;
      }
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.isConnected = false;
    this.updateConnectionStatus("disconnected");
  }

  /**
   * Get connection status
   */
  getStatus() {
    if (this.isConnected) return "connected";
    if (this.isConnecting) return "connecting";
    return "disconnected";
  }
}

// Global WebSocket client instance
let wsClient = null;

/**
 * Initialize WebSocket client
 */
function initializeWebSocketClient() {
  if (!authManager) {
    console.error("❌ Auth manager not initialized");
    return;
  }

  wsClient = new WebSocketStatsClient(authManager);

  // Connect on initialization
  wsClient.connect();

  console.log("✓ WebSocket client initialized");
  return wsClient;
}
