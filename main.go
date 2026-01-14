package main

import (
	"chowkidar/internal/routes"

	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()
	routes.RegisterMonitorRoutes(r)
	routes.RegisterProcessRoutes(r)
	r.Run("localhost:8080")
}
