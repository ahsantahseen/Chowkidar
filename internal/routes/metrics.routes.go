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
	}
}
