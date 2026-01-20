package main

import (
	"chowkidar/internal/routes"
	"chowkidar/internal/services"
	"time"

	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()
	r.Use(gin.Logger())

	// Serve static files and templates
	r.Static("/static", "./web/static")
	r.LoadHTMLGlob("./web/templates/*.html")

	// Start background collectors (collect every second)
	services.StartProcessCollector(time.Second)
	services.StartHistoryCollector(time.Second)

	routes.RegisterMonitorRoutes(r)
	routes.RegisterProcessRoutes(r)

	// Dashboard routes
	r.GET("/", func(c *gin.Context) {
		c.HTML(200, "dashboard.html", nil)
	})

	// Detail page routes
	r.GET("/cpu", func(c *gin.Context) {
		c.HTML(200, "details-cpu.html", nil)
	})

	r.GET("/memory", func(c *gin.Context) {
		c.HTML(200, "details-memory.html", nil)
	})

	r.GET("/network", func(c *gin.Context) {
		c.HTML(200, "details-network.html", nil)
	})

	r.GET("/disk", func(c *gin.Context) {
		c.HTML(200, "details-disk.html", nil)
	})

	r.Run("localhost:8080")
}
