package services

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"chowkidar/internal/models"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

const GB = 1024 * 1024 * 1024

// CPU Info cache
var (
	cpuInfoCache *models.CPUInfo
	cpuInfoLock  sync.RWMutex
)

// GetCPUUsage returns CPU usage percentage
func GetCPUUsage() (*models.CPUStatus, error) {
	percentage, err := cpu.Percent(0, false)
	if err != nil {
		return nil, err
	}

	perCore, err := cpu.Percent(0, true)
	if err != nil {
		log.Printf("Warning: Could not get per-core CPU usage: %v", err)
		perCore = nil
	}

	coreCount, err := cpu.Counts(true)
	if err != nil {
		log.Printf("Warning: Could not get CPU core count: %v", err)
		coreCount = 0
	}

	return &models.CPUStatus{
		UsagePercent: percentage[0],
		PerCore:      perCore,
		CoreCount:    coreCount,
	}, nil
}

// getAppleSiliconModelName returns the Apple Silicon chip name from system_profiler
func getAppleSiliconModelName() string {
	cmd := exec.Command("system_profiler", "SPHardwareDataType")
	output, err := cmd.Output()
	if err != nil {
		return ""
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, "Chip:") {
			parts := strings.Split(line, ":")
			if len(parts) > 1 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return ""
}

// getAppleSiliconFrequency returns approximate max frequency for Apple Silicon
func getAppleSiliconFrequency() float64 {
	// Apple Silicon M1/M2/M3/M4 typical max frequencies
	// M1: 3.2 GHz, M2: 3.5 GHz, M3: 4.0 GHz, M4: 4.3 GHz
	// Using a reasonable estimate since gopsutil doesn't capture this
	return 3.5 // GHz - conservative estimate
}

// getSysctlValue gets a sysctl value safely
func getSysctlValue(key string) string {
	cmd := exec.Command("sysctl", "-n", key)
	output, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}

// GetCPUInfo returns detailed CPU architecture information with caching
func GetCPUInfo() (*models.CPUInfo, error) {
	// Check cache first
	cpuInfoLock.RLock()
	if cpuInfoCache != nil {
		defer cpuInfoLock.RUnlock()
		return cpuInfoCache, nil
	}
	cpuInfoLock.RUnlock()

	info, err := cpu.Info()
	if err != nil {
		return nil, err
	}

	if len(info) == 0 {
		return nil, fmt.Errorf("no CPU information available")
	}

	cpuInfo := info[0]

	// Fetch core counts concurrently
	var wg sync.WaitGroup
	var mu sync.Mutex
	var coreCount, physicalCores int

	wg.Add(1)
	go func() {
		defer wg.Done()
		count, _ := cpu.Counts(true)
		mu.Lock()
		coreCount = count
		mu.Unlock()
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		count, _ := cpu.Counts(false)
		mu.Lock()
		physicalCores = count
		mu.Unlock()
	}()

	// Fetch Apple Silicon model name concurrently (if needed)
	var appleSiliconModel string
	vendorLower := strings.ToLower(cpuInfo.VendorID)
	modelLower := strings.ToLower(cpuInfo.ModelName)
	familyLower := strings.ToLower(cpuInfo.Family)

	isARM := strings.Contains(vendorLower, "arm") ||
		strings.Contains(modelLower, "apple") ||
		strings.Contains(modelLower, "arm") ||
		strings.Contains(familyLower, "arm")

	if cpuInfo.ModelName == "" && isARM {
		wg.Add(1)
		go func() {
			defer wg.Done()
			appleSiliconModel = getAppleSiliconModelName()
		}()
	}

	wg.Wait()

	// Detect CPU architecture
	flagsLower := strings.ToLower(strings.Join(cpuInfo.Flags, " "))

	isX86 := strings.Contains(vendorLower, "intel") ||
		strings.Contains(vendorLower, "amd") ||
		strings.Contains(vendorLower, "cyrix") ||
		strings.Contains(vendorLower, "via") ||
		strings.Contains(vendorLower, "transmeta") ||
		strings.Contains(modelLower, "intel") ||
		strings.Contains(modelLower, "amd") ||
		(len(cpuInfo.Flags) > 0 && !isARM)

	if !isARM && !isX86 {
		if strings.Contains(flagsLower, "mips") {
			// MIPS architecture
		} else if strings.Contains(flagsLower, "ppc") || strings.Contains(flagsLower, "power") {
			// PowerPC architecture
		} else if strings.Contains(flagsLower, "riscv") {
			// RISC-V architecture
		} else if len(cpuInfo.Flags) > 0 {
			isX86 = true
		} else {
			isX86 = true
		}
	}

	// Check instruction sets
	hasSSE42 := containsInSlice(cpuInfo.Flags, "sse4_2")
	hasSSE41 := containsInSlice(cpuInfo.Flags, "sse4_1")
	hasAVX := containsInSlice(cpuInfo.Flags, "avx")
	hasAVX2 := containsInSlice(cpuInfo.Flags, "avx2")
	hasNEON := containsInSlice(cpuInfo.Flags, "neon") || containsInSlice(cpuInfo.Flags, "asimd")
	hasSVE := containsInSlice(cpuInfo.Flags, "sve")
	hasCRC32 := containsInSlice(cpuInfo.Flags, "crc32") || containsInSlice(cpuInfo.Flags, "crc")

	// Prepare values with fallbacks
	modelName := cpuInfo.ModelName
	if modelName == "" && isARM {
		modelName = appleSiliconModel
	}

	vendor := cpuInfo.VendorID
	if vendor == "" && isARM {
		vendor = "Apple"
	} else if vendor == "" && isX86 {
		vendor = "Unknown x86"
	} else if vendor == "" {
		vendor = "Unknown"
	}

	family := cpuInfo.Family
	if family == "" || family == "0" {
		if isARM && strings.Contains(modelName, "M") {
			family = "ARM64 (Apple Silicon)"
		} else if isARM {
			family = "ARM64"
		} else if isX86 {
			family = "x86/x64"
		} else {
			family = "Unknown"
		}
	}

	maxFreq := ""
	if cpuInfo.Mhz == 0 || (isARM && cpuInfo.Mhz < 100) {
		if isARM {
			maxFreq = fmt.Sprintf("%.2f GHz", getAppleSiliconFrequency())
		} else {
			maxFreq = "Unknown"
		}
	} else {
		maxFreq = fmt.Sprintf("%.2f GHz", cpuInfo.Mhz/1000)
	}

	architecture := fmt.Sprintf("%s / %s", vendor, family)

	result := &models.CPUInfo{
		ModelName:    modelName,
		Cores:        physicalCores,
		Threads:      coreCount,
		Architecture: architecture,
		VendorID:     vendor,
		Family:       family,
		Model:        cpuInfo.Model,
		Stepping:     fmt.Sprintf("%v", cpuInfo.Stepping),
		MaxFrequency: maxFreq,
		Flags:        strings.Join(cpuInfo.Flags, " "),
		IsARM:        isARM,
		IsX86:        isX86,
		HasSSE42:     hasSSE42,
		HasSSE41:     hasSSE41,
		HasAVX:       hasAVX,
		HasAVX2:      hasAVX2,
		HasNEON:      hasNEON,
		HasSVE:       hasSVE,
		HasCRC32:     hasCRC32,
	}

	// Cache the result
	cpuInfoLock.Lock()
	cpuInfoCache = result
	cpuInfoLock.Unlock()

	return result, nil
}

// Helper function to check if a string contains a flag in an array
func containsInSlice(flags []string, flag string) bool {
	for _, f := range flags {
		if f == flag {
			return true
		}
	}
	return false
}

// GetSoftwareCompatibility returns compatibility information for modern applications
func GetSoftwareCompatibility(cpuInfo *models.CPUInfo) []models.SoftwareCompatibility {
	// Helper function to conditionally set strings based on architecture
	getRequirements := func(isARM bool, arm, x86 string) string {
		if isARM {
			return arm
		}
		return x86
	}

	getNotes := func(isARM bool, arm, x86 string) string {
		if isARM {
			return arm
		}
		return x86
	}

	mongoDBCompat := cpuInfo.IsARM || cpuInfo.HasSSE42
	mongoDBReq := "SSE4.2 instruction set (x86/x64)"
	mongoDBNote := "MongoDB 5.0+ requires SSE4.2 support"
	if cpuInfo.IsARM {
		mongoDBReq = "ARM64 native support"
		mongoDBNote = "Fully supported on Apple Silicon and other ARM platforms"
	}

	redisNote := "Lightweight across all architectures"
	if cpuInfo.IsARM {
		redisNote = "Lightweight and excellent support on Apple Silicon"
	}

	elasticCompat := cpuInfo.IsARM || cpuInfo.HasSSE42
	elasticReq := "Recommended SSE4.2 for optimal performance"
	elasticNote := "Works without SSE4.2 but performance is reduced"
	if cpuInfo.IsARM {
		elasticReq = "ARM64 native support"
		elasticNote = "Well-optimized for Apple Silicon"
	}

	dockerNote := "Check VM nested virtualization support"
	if cpuInfo.IsARM {
		dockerNote = "Docker Desktop supports Apple Silicon natively"
	}

	kubernetesNote := "Standard x86/x64 support"
	if cpuInfo.IsARM {
		kubernetesNote = "Kubernetes runs excellently on Apple Silicon clusters"
	}

	nodeNote := "Full x86/x64 compatibility"
	if cpuInfo.IsARM {
		nodeNote = "Native M-series Apple Silicon support"
	}

	pythonNote := "Compatible with all x86/x64 platforms"
	if cpuInfo.IsARM {
		pythonNote = "Fully optimized for Apple Silicon"
	}

	goNote := "Excellent x86/x64 support"
	if cpuInfo.IsARM {
		goNote = "Excellent ARM64 support for Apple Silicon"
	}

	compatibility := []models.SoftwareCompatibility{
		{
			Name:         "MongoDB",
			Category:     "Database",
			Compatible:   mongoDBCompat,
			Requirements: mongoDBReq,
			Notes:        mongoDBNote,
		},
		{
			Name:         "PostgreSQL",
			Category:     "Database",
			Compatible:   true,
			Requirements: "Universal platform support (x86/x64 and ARM)",
			Notes:        "Fully compatible with x86/x64 and ARM architectures including Apple Silicon",
		},
		{
			Name:         "MySQL 8.0",
			Category:     "Database",
			Compatible:   true,
			Requirements: "Universal platform support (x86/x64 and ARM)",
			Notes:        "Native support on both x86/x64 and ARM platforms with good performance",
		},
		{
			Name:         "Redis",
			Category:     "Cache/Database",
			Compatible:   true,
			Requirements: "Universal platform support (x86/x64 and ARM)",
			Notes:        redisNote,
		},
		{
			Name:         "Elasticsearch",
			Category:     "Search Engine",
			Compatible:   elasticCompat,
			Requirements: elasticReq,
			Notes:        elasticNote,
		},
		{
			Name:         "Docker",
			Category:     "Containerization",
			Compatible:   true,
			Requirements: "Hardware virtualization + native platform support",
			Notes:        dockerNote,
		},
		{
			Name:         "Kubernetes",
			Category:     "Orchestration",
			Compatible:   true,
			Requirements: "Platform-native support (x86/x64 and ARM)",
			Notes:        kubernetesNote,
		},
		{
			Name:         "Node.js",
			Category:     "Runtime",
			Compatible:   true,
			Requirements: "Universal binary support (x86/x64 and ARM)",
			Notes:        nodeNote,
		},
		{
			Name:         "Python 3.x",
			Category:     "Runtime",
			Compatible:   true,
			Requirements: "Universal binary support (x86/x64 and ARM)",
			Notes:        pythonNote,
		},
		{
			Name:         "Go",
			Category:     "Runtime",
			Compatible:   true,
			Requirements: "Universal binary support (x86/x64 and ARM)",
			Notes:        goNote,
		},
		{
			Name:         "Apache Kafka",
			Category:     "Message Queue",
			Compatible:   true,
			Requirements: "Platform-native support (x86/x64 and ARM)",
			Notes:        "Performance depends on core count and memory regardless of architecture",
		},
		{
			Name:         "RabbitMQ",
			Category:     "Message Queue",
			Compatible:   true,
			Requirements: "Platform-native support (x86/x64 and ARM)",
			Notes:        redisNote,
		},
	}
	_ = getRequirements // Suppress unused warning if not needed
	_ = getNotes        // Suppress unused warning if not needed
	return compatibility
}

// GetMemoryUsage returns memory usage information
func GetMemoryUsage() (*models.MemoryStatus, error) {
	virtualMemory, err := mem.VirtualMemory()
	if err != nil {
		return nil, err
	}

	return &models.MemoryStatus{
		TotalGB:      float64(virtualMemory.Total) / GB,
		UsedGB:       float64(virtualMemory.Used) / GB,
		AvailableGB:  float64(virtualMemory.Available) / GB,
		UsagePercent: virtualMemory.UsedPercent,
	}, nil
}

// GetDiskUsage returns disk usage for a specific path
func GetDiskUsage(path string) (*models.DiskStatus, error) {
	if path == "" {
		path = "/"
	}

	usage, err := disk.Usage(path)
	if err != nil {
		return nil, err
	}

	return &models.DiskStatus{
		Path:         path,
		TotalGB:      float64(usage.Total) / GB,
		UsedGB:       float64(usage.Used) / GB,
		FreeGB:       float64(usage.Free) / GB,
		UsagePercent: usage.UsedPercent,
		Filesystem:   usage.Fstype,
	}, nil
}

// GetAllDiskUsage returns disk usage for all partitions
func GetAllDiskUsage() ([]models.DiskStatus, error) {
	partitions, err := disk.Partitions(false)
	if err != nil {
		return nil, err
	}

	var statuses []models.DiskStatus

	for _, partition := range partitions {
		usage, err := disk.Usage(partition.Mountpoint)
		if err != nil {
			log.Printf("Warning: Could not get disk usage for %s: %v", partition.Mountpoint, err)
			continue
		}

		statuses = append(statuses, models.DiskStatus{
			Path:         partition.Mountpoint,
			TotalGB:      float64(usage.Total) / GB,
			UsedGB:       float64(usage.Used) / GB,
			FreeGB:       float64(usage.Free) / GB,
			UsagePercent: usage.UsedPercent,
			Filesystem:   partition.Fstype,
		})
	}

	return statuses, nil
}

// GetNetworkUsage returns network statistics for all interfaces
func GetNetworkUsage() ([]models.NetworkStatus, error) {
	counters, err := net.IOCounters(true)
	if err != nil {
		return nil, err
	}

	var statuses []models.NetworkStatus

	for _, counter := range counters {
		statuses = append(statuses, models.NetworkStatus{
			Interface:   counter.Name,
			BytesSent:   counter.BytesSent,
			BytesRecv:   counter.BytesRecv,
			PacketsSent: counter.PacketsSent,
			PacketsRecv: counter.PacketsRecv,
			ErrorsIn:    counter.Errin,
			ErrorsOut:   counter.Errout,
			DropsIn:     counter.Dropin,
			DropsOut:    counter.Dropout,
			BytesSentGB: float64(counter.BytesSent) / GB,
			BytesRecvGB: float64(counter.BytesRecv) / GB,
		})
	}

	return statuses, nil
}

// GetNetworkTotals returns total bytes sent/received across all interfaces
func GetNetworkTotals() (map[string]float64, error) {
	counters, err := net.IOCounters(true)
	if err != nil {
		return nil, err
	}

	var totalBytesSent uint64
	var totalBytesRecv uint64

	for _, counter := range counters {
		totalBytesSent += counter.BytesSent
		totalBytesRecv += counter.BytesRecv
	}

	return map[string]float64{
		"total_bytes_sent":    float64(totalBytesSent),
		"total_bytes_recv":    float64(totalBytesRecv),
		"total_bytes_sent_gb": float64(totalBytesSent) / GB,
		"total_bytes_recv_gb": float64(totalBytesRecv) / GB,
	}, nil
}

// GetSystemStatus returns complete system status using concurrent goroutines
func GetSystemStatus() (*models.SystemStatus, error) {
	var wg sync.WaitGroup
	var mu sync.Mutex

	// Initialize result struct
	status := &models.SystemStatus{}
	var errors []error

	// CPU goroutine
	wg.Add(1)
	go func() {
		defer wg.Done()
		cpuStatus, err := GetCPUUsage()
		if err != nil {
			mu.Lock()
			errors = append(errors, fmt.Errorf("failed to get CPU usage: %w", err))
			mu.Unlock()
			return
		}
		mu.Lock()
		status.CPU = cpuStatus
		mu.Unlock()
	}()

	// Memory goroutine
	wg.Add(1)
	go func() {
		defer wg.Done()
		memStatus, err := GetMemoryUsage()
		if err != nil {
			mu.Lock()
			errors = append(errors, fmt.Errorf("failed to get memory usage: %w", err))
			mu.Unlock()
			return
		}
		mu.Lock()
		status.Memory = memStatus
		mu.Unlock()
	}()

	// Disk goroutine
	wg.Add(1)
	go func() {
		defer wg.Done()
		diskStatus, err := GetDiskUsage("/")
		if err != nil {
			mu.Lock()
			errors = append(errors, fmt.Errorf("failed to get disk usage: %w", err))
			mu.Unlock()
			return
		}
		mu.Lock()
		status.Disk = diskStatus
		mu.Unlock()
	}()

	// Network goroutine
	wg.Add(1)
	go func() {
		defer wg.Done()
		networkStatus, err := GetNetworkUsage()
		if err != nil {
			mu.Lock()
			errors = append(errors, fmt.Errorf("failed to get network usage: %w", err))
			mu.Unlock()
			return
		}
		mu.Lock()
		status.Network = networkStatus
		mu.Unlock()
	}()

	// Wait for all goroutines to complete
	wg.Wait()

	// Check if any errors occurred
	if len(errors) > 0 {
		return nil, errors[0]
	}

	return status, nil
}

// Simple functions that return map[string]float64 for backward compatibility - now concurrent
func GetCPUUsageSimple() map[string]float64 {
	var wg sync.WaitGroup
	var mu sync.Mutex
	result := make(map[string]float64)

	wg.Add(1)
	go func() {
		defer wg.Done()
		cpuStatus, err := GetCPUUsage()
		if err != nil {
			log.Println(err)
			return
		}
		mu.Lock()
		result["cpu_percent"] = cpuStatus.UsagePercent
		mu.Unlock()
	}()

	wg.Wait()
	if len(result) == 0 {
		return nil
	}
	return result
}

func GetMemoryUsageSimple() map[string]float64 {
	var wg sync.WaitGroup
	var mu sync.Mutex
	result := make(map[string]float64)

	wg.Add(1)
	go func() {
		defer wg.Done()
		memStatus, err := GetMemoryUsage()
		if err != nil {
			log.Println(err)
			return
		}
		mu.Lock()
		result["memory_percent"] = memStatus.UsagePercent
		mu.Unlock()
	}()

	wg.Wait()
	if len(result) == 0 {
		return nil
	}
	return result
}

func GetDiskUsageSimple() map[string]float64 {
	var wg sync.WaitGroup
	var mu sync.Mutex
	result := make(map[string]float64)

	wg.Add(1)
	go func() {
		defer wg.Done()
		diskStatus, err := GetDiskUsage("/")
		if err != nil {
			log.Println(err)
			return
		}
		mu.Lock()
		result["disk_percent"] = diskStatus.UsagePercent
		mu.Unlock()
	}()

	wg.Wait()
	if len(result) == 0 {
		return nil
	}
	return result
}

// GetAggregatedNetwork returns aggregated network statistics with totals and rates
func GetAggregatedNetwork() (*models.AggregatedNetworkStatus, error) {
	interfaces, err := GetNetworkUsage()
	if err != nil {
		return nil, err
	}

	var totalBytesSent uint64
	var totalBytesRecv uint64
	var totalPacketsSent uint64
	var totalPacketsRecv uint64
	var totalErrorsIn uint64
	var totalErrorsOut uint64
	var totalDropsIn uint64
	var totalDropsOut uint64

	for _, iface := range interfaces {
		totalBytesSent += iface.BytesSent
		totalBytesRecv += iface.BytesRecv
		totalPacketsSent += iface.PacketsSent
		totalPacketsRecv += iface.PacketsRecv
		totalErrorsIn += iface.ErrorsIn
		totalErrorsOut += iface.ErrorsOut
		totalDropsIn += iface.DropsIn
		totalDropsOut += iface.DropsOut
	}

	// Get rates from history
	history := GetLatestNetworkHistory()
	bytesSentRate := 0.0
	bytesRecvRate := 0.0
	if history != nil {
		bytesSentRate = history.BytesSentRate
		bytesRecvRate = history.BytesRecvRate
	}

	return &models.AggregatedNetworkStatus{
		BytesSent:     totalBytesSent,
		BytesRecv:     totalBytesRecv,
		BytesSentRate: bytesSentRate,
		BytesRecvRate: bytesRecvRate,
		PacketsSent:   totalPacketsSent,
		PacketsRecv:   totalPacketsRecv,
		ErrorsIn:      totalErrorsIn,
		ErrorsOut:     totalErrorsOut,
		DropsIn:       totalDropsIn,
		DropsOut:      totalDropsOut,
		Interfaces:    interfaces,
	}, nil
}

func GetNetworkTotalsSimple() map[string]float64 {
	networkTotals, err := GetNetworkTotals()
	if err != nil {
		log.Println(err)
		return nil
	}
	return networkTotals
}

// GetTopDirectories returns the top N largest directories in a given path
func GetTopDirectories(path string, limit int) ([]models.DirectoryInfo, error) {
	if path == "" {
		// Default to home directory
		usr, err := user.Current()
		if err != nil {
			path = "/"
		} else {
			path = usr.HomeDir
		}
	}

	var dirs []models.DirectoryInfo

	// Read directory entries
	entries, err := os.ReadDir(path)
	if err != nil {
		log.Printf("Warning: Could not read directory %s: %v", path, err)
		return dirs, nil
	}

	// Collect directory sizes
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		fullPath := filepath.Join(path, entry.Name())

		// Skip hidden directories and system directories
		if entry.Name() == "." || entry.Name() == ".." || entry.Name() == ".Trash" {
			continue
		}

		// Calculate directory size
		size, err := getDirSizeWithDepthLimit(fullPath, 3)
		if err != nil {
			log.Printf("Warning: Could not calculate size for %s: %v", fullPath, err)
			continue
		}

		if size > 0 {
			dirs = append(dirs, models.DirectoryInfo{
				Path:   fullPath,
				SizeGB: float64(size) / GB,
				Size:   formatBytes(size),
			})
		}
	}

	// Sort by size (largest first)
	sort.Slice(dirs, func(i, j int) bool {
		return dirs[i].SizeGB > dirs[j].SizeGB
	})

	// Return top N
	if len(dirs) > limit {
		dirs = dirs[:limit]
	}

	return dirs, nil
}

// getDirSizeWithDepthLimit calculates directory size up to a specified depth
// maxDepth=0 means just count immediate files, maxDepth=1 means one level deep, etc.
func getDirSizeWithDepthLimit(path string, maxDepth int) (int64, error) {
	var size int64
	calculateSizeRecursive(path, 0, maxDepth, &size)
	return size, nil
}

// calculateSizeRecursive recursively calculates size with depth limit
func calculateSizeRecursive(path string, currentDepth int, maxDepth int, size *int64) {
	entries, err := os.ReadDir(path)
	if err != nil {
		return // Silently skip inaccessible directories
	}

	for _, entry := range entries {
		entryPath := filepath.Join(path, entry.Name())

		if entry.IsDir() {
			// Only recurse if we haven't hit the depth limit
			if currentDepth < maxDepth {
				calculateSizeRecursive(entryPath, currentDepth+1, maxDepth, size)
			}
		} else {
			// Add file size
			if info, err := entry.Info(); err == nil {
				*size += info.Size()
			}
		}
	}
}

// getDirSize recursively calculates directory size
func getDirSize(path string) (int64, error) {
	var size int64

	err := filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			// Skip errors for individual files/dirs
			return nil
		}
		if !info.IsDir() {
			size += info.Size()
		}
		return nil
	})

	return size, err
}

// formatBytes converts bytes to human-readable format
func formatBytes(bytes int64) string {
	const (
		KB       = 1024
		MB       = KB * 1024
		GB_BYTES = MB * 1024
		TB       = GB_BYTES * 1024
	)

	switch {
	case bytes >= TB:
		return fmt.Sprintf("%.1f TB", float64(bytes)/float64(TB))
	case bytes >= GB_BYTES:
		return fmt.Sprintf("%.1f GB", float64(bytes)/float64(GB_BYTES))
	case bytes >= MB:
		return fmt.Sprintf("%.1f MB", float64(bytes)/float64(MB))
	case bytes >= KB:
		return fmt.Sprintf("%.1f KB", float64(bytes)/float64(KB))
	default:
		return fmt.Sprintf("%d B", bytes)
	}
}
