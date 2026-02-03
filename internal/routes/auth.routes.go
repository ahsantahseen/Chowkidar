package routes

import (
	"chowkidar/internal/controllers"

	"github.com/gin-gonic/gin"
)

// RegisterAuthRoutes registers all authentication and WebSocket routes
func RegisterAuthRoutes(r *gin.Engine) {
	// WebSocket endpoint for real-time stats
	r.GET("/ws", controllers.HandleWebSocket)

	// Token management endpoints
	auth := r.Group("/auth")
	{
		// Generate a new token
		auth.GET("/token", controllers.HandleGetToken)

		// Check token validity
		auth.GET("/status", controllers.HandleTokenStatus)
	}
}
