package routes

import (
	"chowkidar/internal/controllers"

	"github.com/gin-gonic/gin"
)

func RegisterProcessRoutes(r *gin.Engine) {
	processes := r.Group("/processes")
	{
		processes.GET("/", controllers.GetTopProcesses)
		processes.GET("/status", controllers.GetProcessStatus)
	}
}
