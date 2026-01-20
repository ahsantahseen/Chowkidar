package controllers

import (
	"chowkidar/internal/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetTopProcesses returns the top 20 processes by CPU + memory usage with totals
func GetTopProcesses(c *gin.Context) {
	processes, totalCPU, totalMem, lastUpdated := services.GetCachedProcesses()
	c.JSON(http.StatusOK, gin.H{
		"processes":         processes,
		"total_cpu_percent": totalCPU,
		"total_mem_percent": totalMem,
		"last_updated":      lastUpdated,
	})
}

// GetProcessStatus returns a simple process status summary (total count)
func GetProcessStatus(c *gin.Context) {
	status := services.GetProcessCountSimple()
	c.JSON(http.StatusOK, status)
}
