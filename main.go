package main

import (
	"chowkidar/internal/routes"

	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()
	routes.RegisterMonitorRoutes(r)
	r.Run(":8080")
}
