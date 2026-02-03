package controllers

import (
	"chowkidar/internal/middleware"
	"chowkidar/internal/services"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins for now (can be restricted based on config)
		return true
	},
}

// HandleWebSocket handles incoming WebSocket connections
func HandleWebSocket(c *gin.Context) {
	// Extract and validate token from query parameter
	token := c.Query("token")
	if token == "" {
		if middleware.GlobalSecurityLogger != nil {
			middleware.GlobalSecurityLogger.LogFailedAuth(c.ClientIP(), "missing token")
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
		return
	}

	// Validate the token
	claims, err := services.ValidateToken(token)
	if err != nil {
		if middleware.GlobalSecurityLogger != nil {
			middleware.GlobalSecurityLogger.LogFailedAuth(c.ClientIP(), "invalid token: "+err.Error())
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token: " + err.Error()})
		return
	}

	if middleware.GlobalSecurityLogger != nil {
		middleware.GlobalSecurityLogger.LogWebSocketConnected(c.ClientIP(), claims.ServerName)
	}
	log.Printf("[WS] New connection from %s with token for server: %s", c.ClientIP(), claims.ServerName)

	// Upgrade connection to WebSocket
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[WS] Upgrade error: %v", err)
		return
	}

	// Create client connection
	clientID := c.ClientIP() + "-" + claims.ServerName
	client := &services.ClientConnection{
		ID:    clientID,
		Conn:  ws,
		Send:  make(chan services.WebSocketMessage, 256),
		Close: make(chan bool),
	}

	// Register with hub
	hub := services.GetWebSocketHub()
	hub.Register(client)

	// Start read and write goroutines
	go readPump(client, hub)
	go writePump(client, hub)
}

// readPump reads messages from the WebSocket client
func readPump(client *services.ClientConnection, hub *services.WebSocketHub) {
	defer func() {
		hub.Unregister(client.ID)
		client.Conn.Close()
	}()

	client.Conn.SetPongHandler(func(string) error {
		return nil
	})

	for {
		var msg services.WebSocketMessage
		err := client.Conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WS] WebSocket error: %v", err)
			}
			return
		}

		// Handle different message types
		switch msg.Type {
		case "auth":
			// Client sending authentication token
			if msg.Token != "" {
				claims, err := services.ValidateToken(msg.Token)
				if err != nil {
					log.Printf("[WS-AUTH] ❌ Invalid token from client %s: %v", client.ID, err)
					if middleware.GlobalSecurityLogger != nil {
						middleware.GlobalSecurityLogger.LogFailedAuth(client.ID, "websocket auth message: "+err.Error())
					}
					// Send auth error response
					select {
					case client.Send <- services.WebSocketMessage{
						Type: "auth_error",
						Data: map[string]interface{}{"error": "invalid token"},
					}:
					case <-client.Close:
						return
					}
				} else {
					log.Printf("[WS-AUTH] ✓ Client %s authenticated via WebSocket message, server: %s", client.ID, claims.ServerName)
					if middleware.GlobalSecurityLogger != nil {
						middleware.GlobalSecurityLogger.LogTokenGenerated(client.ID, "websocket-auth-message")
					}
					// Send auth success response
					select {
					case client.Send <- services.WebSocketMessage{
						Type: "auth_success",
						Data: map[string]interface{}{"server": claims.ServerName},
					}:
					case <-client.Close:
						return
					}
				}
			}

		case "ping":
			// Respond with pong
			pong := services.WebSocketMessage{
				Type: "pong",
			}
			select {
			case client.Send <- pong:
			case <-client.Close:
				return
			default:
				return
			}

		case "subscribe":
			// Client is subscribing to updates (no-op, already subscribed)
			log.Printf("[WS] Client %s subscribed to updates", client.ID)

		case "unsubscribe":
			// Client unsubscribing (will close connection)
			return

		default:
			log.Printf("[WS] Unknown message type: %s", msg.Type)
		}
	}
}

// writePump writes messages to the WebSocket client
func writePump(client *services.ClientConnection, hub *services.WebSocketHub) {
	defer func() {
		client.Conn.Close()
	}()

	for {
		select {
		case msg, ok := <-client.Send:
			if !ok {
				// Channel closed, close connection
				client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			err := client.Conn.WriteJSON(msg)
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("[WS] Write error: %v", err)
				}
				return
			}

		case <-client.Close:
			client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
			return
		}
	}
}

// HandleGetToken generates a new JWT token
func HandleGetToken(c *gin.Context) {
	hostname := c.DefaultQuery("server_name", "chowkidar-agent")

	// Validate server name
	validator := middleware.NewInputValidator()
	if !validator.ValidateServerName(hostname) {
		if middleware.GlobalSecurityLogger != nil {
			middleware.GlobalSecurityLogger.LogFailedAuth(c.ClientIP(), "invalid server name format")
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server name format"})
		return
	}

	token, err := services.GenerateToken(hostname)
	if err != nil {
		if middleware.GlobalSecurityLogger != nil {
			middleware.GlobalSecurityLogger.LogFailedAuth(c.ClientIP(), "token generation failed")
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	if middleware.GlobalSecurityLogger != nil {
		middleware.GlobalSecurityLogger.LogTokenGenerated(c.ClientIP(), hostname)
	}

	expiry := services.GetTokenExpiry()
	port := c.DefaultQuery("port", "8080")
	protocol := "ws"
	if strings.HasPrefix(c.Request.Host, "https") {
		protocol = "wss"
	}

	c.JSON(http.StatusOK, gin.H{
		"token":  token,
		"url":    protocol + "://" + c.Request.Host + "/ws?token=" + token,
		"expiry": expiry,
		"server": hostname,
		"port":   port,
	})
}

// HandleTokenStatus checks the current token status
func HandleTokenStatus(c *gin.Context) {
	var token string

	// Try to get token from Authorization header first (Bearer token)
	authHeader := c.GetHeader("Authorization")
	if authHeader != "" {
		if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
			token = authHeader[7:]
			if middleware.GlobalSecurityLogger != nil {
				middleware.GlobalSecurityLogger.LogTokenGenerated(c.ClientIP(), "token-status-auth-header")
			}
			log.Printf("[AUTH] Token validation via Authorization header from %s", c.ClientIP())
		}
	}

	// Fallback to query parameter if header not found
	if token == "" {
		token = c.Query("token")
		if token != "" {
			log.Printf("[AUTH] Token validation via query parameter from %s", c.ClientIP())
		}
	}

	if token == "" {
		if middleware.GlobalSecurityLogger != nil {
			middleware.GlobalSecurityLogger.LogFailedAuth(c.ClientIP(), "missing token in header or query")
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "token required in Authorization header or query parameter"})
		return
	}

	claims, err := services.ValidateToken(token)
	if err != nil {
		if middleware.GlobalSecurityLogger != nil {
			middleware.GlobalSecurityLogger.LogFailedAuth(c.ClientIP(), "invalid token: "+err.Error())
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	log.Printf("[AUTH] ✓ Token valid for server: %s from %s", claims.ServerName, c.ClientIP())
	c.JSON(http.StatusOK, gin.H{
		"valid":      true,
		"server":     claims.ServerName,
		"expires_at": claims.ExpiresAt.Time,
		"issued_at":  claims.IssuedAt.Time,
	})
}
