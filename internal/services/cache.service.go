package services

import (
	"chowkidar/internal/models"
	"sync"
	"time"
)

// MetricsCache holds cached metric values with TTL
type MetricsCache struct {
	mu               sync.RWMutex
	cpuCache         *models.CPUStatus
	cpuCacheTime     time.Time
	memoryCache      *models.MemoryStatus
	memoryCacheTime  time.Time
	diskCache        *models.DiskStatus
	diskCacheTime    time.Time
	networkCache     []models.NetworkStatus
	networkCacheTime time.Time
	lastNetworkBytes struct {
		sent uint64
		recv uint64
		time time.Time
	}
	directoriesCache     []models.DirectoryInfo
	directoriesCacheTime time.Time
	directoriesCacheTTL  time.Duration // Longer TTL for directories (default 30 seconds)
	ttl                  time.Duration
}

var metricsCache = &MetricsCache{
	ttl:                 1 * time.Second,  // Cache for 1 second
	directoriesCacheTTL: 30 * time.Second, // Cache directories for 30 seconds (slower operation)
}

// SetCacheTTL sets the cache time-to-live
func SetCacheTTL(duration time.Duration) {
	metricsCache.mu.Lock()
	defer metricsCache.mu.Unlock()
	metricsCache.ttl = duration
}

// isCacheValid checks if cache is still valid
func (mc *MetricsCache) isCacheValid(cacheTime time.Time) bool {
	return time.Since(cacheTime) < mc.ttl
}

// GetCachedCPU returns cached CPU data if valid, otherwise fetches fresh
func GetCachedCPU() (*models.CPUStatus, error) {
	metricsCache.mu.RLock()
	if metricsCache.isCacheValid(metricsCache.cpuCacheTime) && metricsCache.cpuCache != nil {
		defer metricsCache.mu.RUnlock()
		return metricsCache.cpuCache, nil
	}
	metricsCache.mu.RUnlock()

	// Fetch fresh data
	cpu, err := GetCPUUsage()
	if err != nil {
		return nil, err
	}

	// Update cache
	metricsCache.mu.Lock()
	metricsCache.cpuCache = cpu
	metricsCache.cpuCacheTime = time.Now()
	metricsCache.mu.Unlock()

	return cpu, nil
}

// GetCachedMemory returns cached memory data if valid, otherwise fetches fresh
func GetCachedMemory() (*models.MemoryStatus, error) {
	metricsCache.mu.RLock()
	if metricsCache.isCacheValid(metricsCache.memoryCacheTime) && metricsCache.memoryCache != nil {
		defer metricsCache.mu.RUnlock()
		return metricsCache.memoryCache, nil
	}
	metricsCache.mu.RUnlock()

	// Fetch fresh data
	memory, err := GetMemoryUsage()
	if err != nil {
		return nil, err
	}

	// Update cache
	metricsCache.mu.Lock()
	metricsCache.memoryCache = memory
	metricsCache.memoryCacheTime = time.Now()
	metricsCache.mu.Unlock()

	return memory, nil
}

// GetCachedDisk returns cached disk data if valid, otherwise fetches fresh
func GetCachedDisk() (*models.DiskStatus, error) {
	metricsCache.mu.RLock()
	if metricsCache.isCacheValid(metricsCache.diskCacheTime) && metricsCache.diskCache != nil {
		defer metricsCache.mu.RUnlock()
		return metricsCache.diskCache, nil
	}
	metricsCache.mu.RUnlock()

	// Fetch fresh data
	disk, err := GetDiskUsage("/")
	if err != nil {
		return nil, err
	}

	// Update cache
	metricsCache.mu.Lock()
	metricsCache.diskCache = disk
	metricsCache.diskCacheTime = time.Now()
	metricsCache.mu.Unlock()

	return disk, nil
}

// GetCachedNetwork returns cached network data if valid, otherwise fetches fresh
func GetCachedNetwork() ([]models.NetworkStatus, error) {
	metricsCache.mu.RLock()
	if metricsCache.isCacheValid(metricsCache.networkCacheTime) && metricsCache.networkCache != nil {
		defer metricsCache.mu.RUnlock()
		return metricsCache.networkCache, nil
	}
	metricsCache.mu.RUnlock()

	// Fetch fresh data
	network, err := GetNetworkUsage()
	if err != nil {
		return nil, err
	}

	// Update cache
	metricsCache.mu.Lock()
	metricsCache.networkCache = network
	metricsCache.networkCacheTime = time.Now()
	metricsCache.mu.Unlock()

	return network, nil
}

// GetNetworkRates calculates real-time network send/receive rates in bytes/sec
func GetNetworkRates() (sentRate, recvRate float64) {
	metricsCache.mu.Lock()
	defer metricsCache.mu.Unlock()

	if metricsCache.networkCache == nil || len(metricsCache.networkCache) == 0 {
		return 0, 0
	}

	// Calculate total bytes
	totalSent := uint64(0)
	totalRecv := uint64(0)
	for _, iface := range metricsCache.networkCache {
		totalSent += iface.BytesSent
		totalRecv += iface.BytesRecv
	}

	// Calculate rates based on previous snapshot
	if metricsCache.lastNetworkBytes.time.IsZero() {
		// First call, just store values
		metricsCache.lastNetworkBytes.sent = totalSent
		metricsCache.lastNetworkBytes.recv = totalRecv
		metricsCache.lastNetworkBytes.time = time.Now()
		return 0, 0
	}

	// Calculate time delta
	timeDelta := time.Since(metricsCache.lastNetworkBytes.time).Seconds()
	if timeDelta <= 0 {
		timeDelta = 1
	}

	// Calculate rates
	sentRate = float64(totalSent-metricsCache.lastNetworkBytes.sent) / timeDelta
	recvRate = float64(totalRecv-metricsCache.lastNetworkBytes.recv) / timeDelta

	// Update stored values
	metricsCache.lastNetworkBytes.sent = totalSent
	metricsCache.lastNetworkBytes.recv = totalRecv
	metricsCache.lastNetworkBytes.time = time.Now()

	// Prevent negative rates (in case of counter reset)
	if sentRate < 0 {
		sentRate = 0
	}
	if recvRate < 0 {
		recvRate = 0
	}

	return sentRate, recvRate
}

// ClearCache clears all cached values
func ClearCache() {
	metricsCache.mu.Lock()
	defer metricsCache.mu.Unlock()

	metricsCache.cpuCache = nil
	metricsCache.memoryCache = nil
	metricsCache.diskCache = nil
	metricsCache.networkCache = nil
	metricsCache.directoriesCache = nil
}

// GetCachedDirectories returns cached top directories if valid, otherwise fetches fresh
func GetCachedDirectories(path string, limit int) ([]models.DirectoryInfo, error) {
	metricsCache.mu.RLock()
	// Check if cache is valid (using longer TTL for directories)
	isCacheDirValid := time.Since(metricsCache.directoriesCacheTime) < metricsCache.directoriesCacheTTL && metricsCache.directoriesCache != nil
	if isCacheDirValid && path == "" {
		defer metricsCache.mu.RUnlock()
		// Limit results
		dirs := metricsCache.directoriesCache
		if len(dirs) > limit {
			dirs = dirs[:limit]
		}
		return dirs, nil
	}
	metricsCache.mu.RUnlock()

	// Fetch fresh data
	dirs, err := GetTopDirectories(path, limit)
	if err != nil {
		return nil, err
	}

	// Update cache only for default path
	if path == "" {
		metricsCache.mu.Lock()
		metricsCache.directoriesCache = dirs
		metricsCache.directoriesCacheTime = time.Now()
		metricsCache.mu.Unlock()
	}

	return dirs, nil
}
