package routes

import (
	"chowkidar/internal/controllers"
	"chowkidar/internal/middleware"

	"github.com/gin-gonic/gin"
)

// RegisterMonitorRoutes registers all system metrics endpoints
// These endpoints provide real-time and historical system statistics
func RegisterMonitorRoutes(r *gin.Engine) {
	metrics := r.Group("/metrics", middleware.AuthMiddleware())
	{
		metrics.GET("/", controllers.GetStatus)                              // System status summary
		metrics.GET("/cpu", controllers.GetCPU)                              // Current CPU metrics
		metrics.GET("/cpu/info", controllers.GetCPUInfo)                     // CPU architecture info
		metrics.GET("/cpu/compatibility", controllers.GetCPUCompatibility)   // Software compatibility
		metrics.GET("/memory", controllers.GetMemory)                        // Memory/swap usage
		metrics.GET("/disk", controllers.GetDisk)                            // Disk I/O and usage
		metrics.GET("/network", controllers.GetNetwork)                      // Network bandwidth
		metrics.GET("/network/aggregated", controllers.GetAggregatedNetwork) // Total network stats
		metrics.GET("/history", controllers.GetMetricHistory)                // Historical data
		metrics.GET("/history/all", controllers.GetAllHistory)               // Complete history
	}

	// Dashboard main endpoint
	r.GET("/dashboard", middleware.AuthMiddleware(), controllers.GetDashboard)
}
