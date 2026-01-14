package controllers

import (
	"chowkidar/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// GetProcesses returns all running processes
func GetProcesses(c *gin.Context) {
	processes, err := services.GetAllProcesses()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, processes)
}

// GetProcessStatus returns a simple process status summary
func GetProcessStatus(c *gin.Context) {
	status := services.GetProcessCountSimple()
	c.JSON(http.StatusOK, status)
}

// GetTopProcessesByCPU returns the top processes by CPU usage
func GetTopProcessesByCPU(c *gin.Context) {
	limit := 10
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}

	processes, err := services.GetTopProcessesByCPU(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, processes)
}

// GetTopProcessesByMemory returns the top processes by memory usage
func GetTopProcessesByMemory(c *gin.Context) {
	limit := 10
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}

	processes, err := services.GetTopProcessesByMemory(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, processes)
}
