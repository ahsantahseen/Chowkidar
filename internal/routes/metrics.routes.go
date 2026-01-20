package routes

import (
	"chowkidar/internal/controllers"

	"github.com/gin-gonic/gin"
)

func RegisterMonitorRoutes(r *gin.Engine) {
	metrics := r.Group("/metrics")
	{
		metrics.GET("/", controllers.GetStatus)
		metrics.GET("/cpu", controllers.GetCPU)
		metrics.GET("/memory", controllers.GetMemory)
		metrics.GET("/disk", controllers.GetDisk)
		metrics.GET("/network", controllers.GetNetwork)
		metrics.GET("/network/aggregated", controllers.GetAggregatedNetwork)
		metrics.GET("/history", controllers.GetMetricHistory)
		metrics.GET("/history/all", controllers.GetAllHistory)
	}

	// Dashboard endpoint
	r.GET("/dashboard", controllers.GetDashboard)
}
