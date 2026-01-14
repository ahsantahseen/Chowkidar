package routes

import (
	"chowkidar/internal/controllers"

	"github.com/gin-gonic/gin"
)

func RegisterProcessRoutes(r *gin.Engine) {
	processes := r.Group("/processes")
	{
		processes.GET("/status", controllers.GetProcessStatus)
		processes.GET("/", controllers.GetProcesses)
		processes.GET("/top-cpu", controllers.GetTopProcessesByCPU)
		processes.GET("/top-memory", controllers.GetTopProcessesByMemory)
	}
}
