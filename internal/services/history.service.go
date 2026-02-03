package services

import (
	"chowkidar/internal/models"
	"log"
	"sync"
	"time"
)

// HistoryCollector manages time-series metric data
type HistoryCollector struct {
	mu              sync.RWMutex
	cpuHistory      []models.CPUHistory
	memoryHistory   []models.MemoryHistory
	diskHistory     []models.DiskHistory
	networkHistory  []models.NetworkHistory
	lastNetworkSent uint64
	lastNetworkRecv uint64
	lastTime        time.Time
	maxDataPoints   int // Keep only this many points (e.g., 60 for 1h at 1min interval)
	running         bool
}

var historyCollector = &HistoryCollector{
	cpuHistory:     []models.CPUHistory{},
	memoryHistory:  []models.MemoryHistory{},
	diskHistory:    []models.DiskHistory{},
	networkHistory: []models.NetworkHistory{},
	maxDataPoints:  60, // Keep 1 hour of data (60 points at 1-minute intervals)
	lastTime:       time.Now(),
	running:        false,
}

// StartHistoryCollector starts collecting historical metrics
func StartHistoryCollector(interval time.Duration) {
	historyCollector.mu.Lock()
	if historyCollector.running {
		historyCollector.mu.Unlock()
		return
	}
	historyCollector.running = true
	historyCollector.mu.Unlock()

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			historyCollector.collectSnapshot()
		}
	}()

	log.Printf("History collector started (interval: %v)", interval)
}

// StopHistoryCollector stops the history collector
func StopHistoryCollector() {
	historyCollector.mu.Lock()
	historyCollector.running = false
	historyCollector.mu.Unlock()
	log.Println("History collector stopped")
}

// collectSnapshot takes a snapshot of all metrics
// Key optimization: System calls are done OUTSIDE the lock to prevent blocking reader goroutines
func (hc *HistoryCollector) collectSnapshot() {
	now := time.Now()

	// Call all system functions OUTSIDE the lock
	// These can take 100-500ms, and we don't want to block readers
	cpu, cpuErr := GetCPUUsage()
	memory, memErr := GetMemoryUsage()
	disk, diskErr := GetDiskUsage("/")
	network, netErr := GetNetworkUsage()

	// Now acquire lock only for the quick append operations
	hc.mu.Lock()
	defer hc.mu.Unlock()

	// CPU
	if cpuErr == nil {
		hc.cpuHistory = append(hc.cpuHistory, models.CPUHistory{
			Timestamp: now,
			Usage:     cpu.UsagePercent,
			PerCore:   cpu.PerCore,
		})
		if len(hc.cpuHistory) > hc.maxDataPoints {
			hc.cpuHistory = hc.cpuHistory[1:]
		}
	}

	// Memory
	if memErr == nil {
		hc.memoryHistory = append(hc.memoryHistory, models.MemoryHistory{
			Timestamp:    now,
			UsedGB:       memory.UsedGB,
			AvailableGB:  memory.AvailableGB,
			UsagePercent: memory.UsagePercent,
		})
		if len(hc.memoryHistory) > hc.maxDataPoints {
			hc.memoryHistory = hc.memoryHistory[1:]
		}
	}

	// Disk
	if diskErr == nil {
		hc.diskHistory = append(hc.diskHistory, models.DiskHistory{
			Timestamp:    now,
			UsedGB:       disk.UsedGB,
			TotalGB:      disk.TotalGB,
			UsagePercent: disk.UsagePercent,
		})
		if len(hc.diskHistory) > hc.maxDataPoints {
			hc.diskHistory = hc.diskHistory[1:]
		}
	}

	// Network (with throughput calculation)
	if netErr == nil && len(network) > 0 {
		totalSent := uint64(0)
		totalRecv := uint64(0)
		for _, iface := range network {
			totalSent += iface.BytesSent
			totalRecv += iface.BytesRecv
		}

		// Calculate rates
		timeDiff := now.Sub(hc.lastTime).Seconds()
		bytesSentRate := 0.0
		bytesRecvRate := 0.0

		if timeDiff > 0 && hc.lastNetworkSent > 0 {
			bytesSentRate = float64(totalSent-hc.lastNetworkSent) / timeDiff
			bytesRecvRate = float64(totalRecv-hc.lastNetworkRecv) / timeDiff
		}

		hc.networkHistory = append(hc.networkHistory, models.NetworkHistory{
			Timestamp:     now,
			BytesSent:     totalSent,
			BytesRecv:     totalRecv,
			BytesSentRate: bytesSentRate,
			BytesRecvRate: bytesRecvRate,
		})

		hc.lastNetworkSent = totalSent
		hc.lastNetworkRecv = totalRecv
		hc.lastTime = now

		if len(hc.networkHistory) > hc.maxDataPoints {
			hc.networkHistory = hc.networkHistory[1:]
		}
	}
}

// GetHistoricalData returns historical data for the specified metric and duration
// metric: "cpu", "memory", "disk", "network"
// duration: time duration string like "5m", "10m", "1h" (default: 10m)
func GetHistoricalData(metric string, duration time.Duration) interface{} {
	historyCollector.mu.RLock()
	defer historyCollector.mu.RUnlock()

	cutoffTime := time.Now().Add(-duration)

	switch metric {
	case "cpu":
		filtered := []models.CPUHistory{}
		for _, h := range historyCollector.cpuHistory {
			if h.Timestamp.After(cutoffTime) {
				filtered = append(filtered, h)
			}
		}
		return filtered

	case "memory":
		filtered := []models.MemoryHistory{}
		for _, h := range historyCollector.memoryHistory {
			if h.Timestamp.After(cutoffTime) {
				filtered = append(filtered, h)
			}
		}
		return filtered

	case "disk":
		filtered := []models.DiskHistory{}
		for _, h := range historyCollector.diskHistory {
			if h.Timestamp.After(cutoffTime) {
				filtered = append(filtered, h)
			}
		}
		return filtered

	case "network":
		filtered := []models.NetworkHistory{}
		for _, h := range historyCollector.networkHistory {
			if h.Timestamp.After(cutoffTime) {
				filtered = append(filtered, h)
			}
		}
		return filtered

	default:
		return nil
	}
}

// GetAllHistoricalData returns all historical data as a window
func GetAllHistoricalData(duration time.Duration) models.HistoricalDataWindow {
	historyCollector.mu.RLock()
	defer historyCollector.mu.RUnlock()

	cutoffTime := time.Now().Add(-duration)

	window := models.HistoricalDataWindow{}

	for _, h := range historyCollector.cpuHistory {
		if h.Timestamp.After(cutoffTime) {
			window.CPU = append(window.CPU, h)
		}
	}

	for _, h := range historyCollector.memoryHistory {
		if h.Timestamp.After(cutoffTime) {
			window.Memory = append(window.Memory, h)
		}
	}

	for _, h := range historyCollector.diskHistory {
		if h.Timestamp.After(cutoffTime) {
			window.Disk = append(window.Disk, h)
		}
	}

	for _, h := range historyCollector.networkHistory {
		if h.Timestamp.After(cutoffTime) {
			window.Network = append(window.Network, h)
		}
	}

	return window
}

// GetLatestNetworkHistory returns the most recent network history entry
func GetLatestNetworkHistory() *models.NetworkHistory {
	historyCollector.mu.RLock()
	defer historyCollector.mu.RUnlock()

	if len(historyCollector.networkHistory) == 0 {
		return nil
	}

	return &historyCollector.networkHistory[len(historyCollector.networkHistory)-1]
}
