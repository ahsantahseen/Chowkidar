package controllers

import (
	"chowkidar/internal/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

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
