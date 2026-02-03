package routes

import (
	"chowkidar/internal/controllers"

	"github.com/gin-gonic/gin"
)

// RegisterProcessRoutes registers process monitoring endpoints
func RegisterProcessRoutes(r *gin.Engine) {
	processes := r.Group("/processes")
	{
		processes.GET("/", controllers.GetTopProcesses)        // Top processes by resource usage
		processes.GET("/status", controllers.GetProcessStatus) // Detailed process information
	}
}
