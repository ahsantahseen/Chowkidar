package services

import (
	"chowkidar/internal/models"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v3/process"
)

// ProcessWithScore helps with sorting
type ProcessWithScore struct {
	models.ProcessStatus
	Score float64
}

// ProcessCollectorCache holds the real-time collected process data
type ProcessCollectorCache struct {
	mu          sync.RWMutex
	processes   []models.ProcessStatus
	totalCPU    float32
	totalMem    float32
	lastUpdated time.Time
	running     bool
}

var collector = &ProcessCollectorCache{
	processes: []models.ProcessStatus{},
	running:   false,
}

// StartProcessCollector starts the background process collector
// interval is the collection frequency (e.g., time.Second for 1 second)
func StartProcessCollector(interval time.Duration) {
	collector.mu.Lock()
	if collector.running {
		collector.mu.Unlock()
		return // Already running
	}
	collector.running = true
	collector.mu.Unlock()

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			collector.mu.Lock()
			if !collector.running {
				collector.mu.Unlock()
				return
			}

			processes, totalCPU, totalMem, err := GetTopProcessesWithTotals()
			if err != nil {
				log.Printf("Process collection error: %v", err)
				collector.mu.Unlock()
				continue
			}

			collector.processes = processes
			collector.totalCPU = totalCPU
			collector.totalMem = totalMem
			collector.lastUpdated = time.Now()
			collector.mu.Unlock()
		}
	}()

	log.Printf("Process collector started (interval: %v)", interval)
}

// StopProcessCollector stops the background process collector
func StopProcessCollector() {
	collector.mu.Lock()
	collector.running = false
	collector.mu.Unlock()
	log.Println("Process collector stopped")
}

// GetCachedProcesses returns the latest cached process data
func GetCachedProcesses() ([]models.ProcessStatus, float32, float32, time.Time) {
	collector.mu.RLock()
	defer collector.mu.RUnlock()
	return collector.processes, collector.totalCPU, collector.totalMem, collector.lastUpdated
}

// GetTopProcessesWithTotals returns top 20 processes with resource totals
// Pipeline: Collect → Enrich → Sort → Limit
func GetTopProcessesWithTotals() ([]models.ProcessStatus, float32, float32, error) {
	var processes []ProcessWithScore

	// COLLECT: Get all processes
	if runtime.GOOS == "linux" {
		collected, err := collectFromLinux()
		if err != nil {
			return nil, 0, 0, err
		}
		processes = collected
	} else {
		collected, err := collectFromUniversal()
		if err != nil {
			return nil, 0, 0, err
		}
		processes = collected
	}

	// ENRICH: Calculate scores
	enriched := enrichWithScores(processes)

	// SORT: By score descending
	sorted := sortByScore(enriched)

	// LIMIT: Top 20
	limited := limitTo(sorted, 20)

	// Calculate totals
	var totalCPU float32
	var totalMem float32
	result := make([]models.ProcessStatus, 0, len(limited))
	for _, p := range limited {
		result = append(result, p.ProcessStatus)
		totalCPU += p.CPUPercent
		totalMem += p.MemPercent
	}

	return result, totalCPU, totalMem, nil
}

// GetTopProcesses returns the top 20 processes ranked by CPU + memory usage
func GetTopProcesses() ([]models.ProcessStatus, error) {
	processes, _, _, err := GetTopProcessesWithTotals()
	return processes, err
}

// COLLECT: Get all processes from Linux /proc
func collectFromLinux() ([]ProcessWithScore, error) {
	procDir := "/proc"
	entries, err := os.ReadDir(procDir)
	if err != nil {
		return nil, err
	}

	var processes []ProcessWithScore
	seenPIDs := make(map[int32]bool)

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		pid, err := strconv.ParseInt(entry.Name(), 10, 32)
		if err != nil {
			continue
		}

		pidInt32 := int32(pid)

		// Skip if already processed
		if seenPIDs[pidInt32] {
			continue
		}
		seenPIDs[pidInt32] = true

		// Read stat file
		statPath := filepath.Join(procDir, entry.Name(), "stat")
		statData, err := os.ReadFile(statPath)
		if err != nil {
			continue
		}

		// Parse stat file
		ps, err := parseStatFile(pidInt32, string(statData))
		if err != nil {
			continue
		}

		processes = append(processes, ProcessWithScore{
			ProcessStatus: ps,
			Score:         0, // Will be enriched
		})
	}

	return processes, nil
}

// COLLECT: Get all processes using gopsutil (Windows/macOS)
func collectFromUniversal() ([]ProcessWithScore, error) {
	procs, err := process.Processes()
	if err != nil {
		return nil, err
	}

	var processes []ProcessWithScore
	seenPIDs := make(map[int32]bool)

	for _, p := range procs {
		if seenPIDs[p.Pid] {
			continue
		}
		seenPIDs[p.Pid] = true

		name, err := p.Name()
		if err != nil {
			continue
		}

		cpuPercent, err := p.CPUPercent()
		if err != nil {
			cpuPercent = 0
		}

		memPercent, err := p.MemoryPercent()
		if err != nil {
			memPercent = 0
		}

		status, err := p.Status()
		if err != nil {
			status = []string{"unknown"}
		}

		ps := models.ProcessStatus{
			PID:        p.Pid,
			Name:       name,
			CPUPercent: float32(cpuPercent),
			MemPercent: memPercent,
			Status:     mapProcessState(status[0]),
		}

		processes = append(processes, ProcessWithScore{
			ProcessStatus: ps,
			Score:         0, // Will be enriched
		})
	}

	return processes, nil
}

// ENRICH: Calculate combined scores
func enrichWithScores(processes []ProcessWithScore) []ProcessWithScore {
	enriched := make([]ProcessWithScore, len(processes))
	for i, p := range processes {
		p.Score = float64(p.CPUPercent) + float64(p.MemPercent)
		enriched[i] = p
	}
	return enriched
}

// SORT: By score descending
func sortByScore(processes []ProcessWithScore) []ProcessWithScore {
	sorted := make([]ProcessWithScore, len(processes))
	copy(sorted, processes)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Score > sorted[j].Score
	})
	return sorted
}

// LIMIT: Keep only top N
func limitTo(processes []ProcessWithScore, limit int) []ProcessWithScore {
	if len(processes) > limit {
		return processes[:limit]
	}
	return processes
}

// parseStatFile parses /proc/[pid]/stat file and extracts process info
func parseStatFile(pid int32, statLine string) (models.ProcessStatus, error) {
	lastParen := strings.LastIndex(statLine, ")")
	if lastParen == -1 {
		return models.ProcessStatus{}, fmt.Errorf("invalid stat format")
	}

	commStart := strings.Index(statLine, "(")
	commEnd := lastParen
	comm := statLine[commStart+1 : commEnd]

	fields := strings.Fields(statLine[commEnd+1:])
	if len(fields) < 20 {
		return models.ProcessStatus{}, fmt.Errorf("not enough fields in stat")
	}

	state := fields[0]
	utime, _ := strconv.ParseInt(fields[11], 10, 64)
	stime, _ := strconv.ParseInt(fields[12], 10, 64)
	rss, _ := strconv.ParseInt(fields[21], 10, 64)

	cpuPercent := float32(utime+stime) / 100.0
	memPercent := float32(rss*4096) / float32(getTotalMemory()) * 100.0
	stateStr := mapProcessState(state)

	return models.ProcessStatus{
		PID:        pid,
		Name:       comm,
		CPUPercent: cpuPercent,
		MemPercent: memPercent,
		Status:     stateStr,
	}, nil
}

// mapProcessState converts process state codes to readable strings
func mapProcessState(state string) string {
	if len(state) == 0 {
		return "unknown"
	}
	switch state[0] {
	case 'R':
		return "running"
	case 'S':
		return "sleeping"
	case 'D':
		return "disk_sleep"
	case 'Z':
		return "zombie"
	case 'T':
		return "stopped"
	case 't':
		return "tracing_stop"
	case 'W':
		return "paging"
	case 'X':
		return "dead"
	case 'x':
		return "dead"
	case 'K':
		return "wakekill"
	case 'P':
		return "parked"
	default:
		return state
	}
}

// getTotalMemory returns total system memory in bytes
var totalMemoryCache int64 = 0

func getTotalMemory() int64 {
	if totalMemoryCache > 0 {
		return totalMemoryCache
	}

	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 8 * 1024 * 1024 * 1024
	}

	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "MemTotal:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				kb, _ := strconv.ParseInt(fields[1], 10, 64)
				totalMemoryCache = kb * 1024
				return totalMemoryCache
			}
		}
	}

	return 8 * 1024 * 1024 * 1024
}

// GetProcessCount returns the total number of running processes
func GetProcessCount() (int, error) {
	if runtime.GOOS == "linux" {
		return getProcessCountLinux()
	}
	return getProcessCountUniversal()
}

// getProcessCountLinux counts processes from /proc on Linux
func getProcessCountLinux() (int, error) {
	procDir := "/proc"
	entries, err := os.ReadDir(procDir)
	if err != nil {
		return 0, err
	}

	count := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		_, err := strconv.ParseInt(entry.Name(), 10, 32)
		if err != nil {
			continue
		}

		count++
	}

	return count, nil
}

// getProcessCountUniversal counts processes using gopsutil on Windows/macOS
func getProcessCountUniversal() (int, error) {
	procs, err := process.Processes()
	if err != nil {
		return 0, err
	}
	return len(procs), nil
}

// GetProcessCountSimple returns a simple map with process count
func GetProcessCountSimple() map[string]interface{} {
	count, err := GetProcessCount()
	if err != nil {
		log.Println(err)
		return nil
	}
	return map[string]interface{}{
		"total_processes": count,
	}
}
