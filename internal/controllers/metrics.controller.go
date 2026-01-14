package controllers

import (
	"chowkidar/internal/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetAllMetrics returns all system metrics in a single response
func GetAllMetrics(c *gin.Context) {
	status, err := services.GetSystemStatus()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, status)
}

func GetCPU(c *gin.Context) {
	cpu, err := services.GetCPUUsage()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cpu)
}

func GetMemory(c *gin.Context) {
	memory, err := services.GetMemoryUsage()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, memory)
}

func GetDisk(c *gin.Context) {
	disk, err := services.GetDiskUsage("/")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, disk)
}

func GetNetwork(c *gin.Context) {
	network, err := services.GetNetworkUsage()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, network)
}

// GetStatus returns a consolidated summary of all 4 system metrics
func GetStatus(c *gin.Context) {
	cpuSimple := services.GetCPUUsageSimple()
	memorySimple := services.GetMemoryUsageSimple()
	diskSimple := services.GetDiskUsageSimple()
	networkSimple := services.GetNetworkTotalsSimple()

	response := map[string]interface{}{
		"cpu":     cpuSimple["cpu_percent"],
		"memory":  memorySimple["memory_percent"],
		"disk":    diskSimple["disk_percent"],
		"network": networkSimple,
	}
	c.JSON(http.StatusOK, response)
}
