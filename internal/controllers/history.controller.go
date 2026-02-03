package controllers

import (
	"chowkidar/internal/services"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// GetMetricHistory returns historical data for a specific metric
// Query params: metric=cpu|memory|disk|network, duration=5m|10m|1h|24h (default: 10m)
func GetMetricHistory(c *gin.Context) {
	metric := c.DefaultQuery("metric", "cpu")
	durationStr := c.DefaultQuery("duration", "10m")

	// Parse duration
	duration, err := time.ParseDuration(durationStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid duration format"})
		return
	}

	data := services.GetHistoricalData(metric, duration)
	if data == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid metric"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"metric":   metric,
		"duration": durationStr,
		"data":     data,
	})
}

// GetAllHistory returns all historical metrics in a window
// Query params: duration=5m|10m|1h|24h (default: 10m)
func GetAllHistory(c *gin.Context) {
	durationStr := c.DefaultQuery("duration", "10m")

	duration, err := time.ParseDuration(durationStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid duration format"})
		return
	}

	window := services.GetAllHistoricalData(duration)
	c.JSON(http.StatusOK, gin.H{
		"duration": durationStr,
		"data":     window,
	})
}

// GetDashboard returns simplified data for the main dashboard
// Includes current status + recent history (last 2 minutes for faster response)
func GetDashboard(c *gin.Context) {
	// Get current metrics from cache
	cpuCurrent, _ := services.GetCachedCPU()
	memoryCurrent, _ := services.GetCachedMemory()
	diskCurrent, _ := services.GetCachedDisk()
	networkCurrent, _ := services.GetCachedNetwork()
	processesCurrent, totalCPU, totalMem, _ := services.GetCachedProcesses()

	// Get all available history (backend now limits to 20 points max for real-time performance)
	window := services.GetAllHistoricalData(10 * time.Minute)

	// Process top 5 processes
	topProcesses := processesCurrent
	if len(topProcesses) > 5 {
		topProcesses = topProcesses[:5]
	}

	// Calculate network totals and get rates (from real-time calculation, not history)
	totalNetworkSent := uint64(0)
	totalNetworkRecv := uint64(0)
	var sentRate float64 = 0.0
	var recvRate float64 = 0.0

	if len(networkCurrent) > 0 {
		for _, iface := range networkCurrent {
			totalNetworkSent += iface.BytesSent
			totalNetworkRecv += iface.BytesRecv
		}
	}

	// Get real-time network rates (not from history)
	sentRate, recvRate = services.GetNetworkRates()

	// Get all disk partitions
	allDisks, _ := services.GetAllDiskUsage()

	// Get top 5 largest directories from home directory (with caching)
	topDirs, _ := services.GetCachedDirectories("", 5)

	dashboard := gin.H{
		"current": gin.H{
			"cpu": gin.H{
				"usage_percent": cpuCurrent.UsagePercent,
				"core_count":    cpuCurrent.CoreCount,
			},
			"memory": gin.H{
				"used_gb":       memoryCurrent.UsedGB,
				"available_gb":  memoryCurrent.AvailableGB,
				"usage_percent": memoryCurrent.UsagePercent,
			},
			"disk": gin.H{
				"used_gb":       diskCurrent.UsedGB,
				"total_gb":      diskCurrent.TotalGB,
				"usage_percent": diskCurrent.UsagePercent,
			},
			"network": gin.H{
				"bytes_sent":      totalNetworkSent,
				"bytes_recv":      totalNetworkRecv,
				"bytes_sent_rate": sentRate,
				"bytes_recv_rate": recvRate,
			},
			"top_processes": topProcesses,
			"process_totals": gin.H{
				"total_cpu": totalCPU,
				"total_mem": totalMem,
			},
		},
		"disk_partitions": allDisks,
		"top_directories": topDirs,
		"history":         window,
		"timestamp":       time.Now(),
	}

	c.JSON(http.StatusOK, dashboard)
}
