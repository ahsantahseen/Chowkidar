package routes

import (
	"chowkidar/internal/controllers"
	"chowkidar/internal/middleware"

	"github.com/gin-gonic/gin"
)

// RegisterProcessRoutes registers process monitoring endpoints
func RegisterProcessRoutes(r *gin.Engine) {
	processes := r.Group("/processes", middleware.AuthMiddleware())
	{
		processes.GET("/", controllers.GetTopProcesses)        // Top processes by resource usage
		processes.GET("/status", controllers.GetProcessStatus) // Detailed process information
	}
}
