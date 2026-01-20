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
	ttl              time.Duration
}

var metricsCache = &MetricsCache{
	ttl: 1 * time.Second, // Cache for 1 second
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

// ClearCache clears all cached values
func ClearCache() {
	metricsCache.mu.Lock()
	defer metricsCache.mu.Unlock()

	metricsCache.cpuCache = nil
	metricsCache.memoryCache = nil
	metricsCache.diskCache = nil
	metricsCache.networkCache = nil
}
