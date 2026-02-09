package routes

import (
	"chowkidar/internal/controllers"

	"github.com/gin-gonic/gin"
)

// RegisterAuthRoutes registers WebSocket routes only.
// Token generation/validation must be done via CLI (no HTTP endpoints).
func RegisterAuthRoutes(r *gin.Engine) {
	// WebSocket endpoint for real-time stats
	r.GET("/ws", controllers.HandleWebSocket)
}
