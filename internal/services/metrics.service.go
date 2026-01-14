package services

import (
	"fmt"
	"log"

	"chowkidar/internal/models"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

const GB = 1024 * 1024 * 1024

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

// GetSystemStatus returns complete system status
func GetSystemStatus() (*models.SystemStatus, error) {
	cpuStatus, err := GetCPUUsage()
	if err != nil {
		return nil, fmt.Errorf("failed to get CPU usage: %w", err)
	}

	memStatus, err := GetMemoryUsage()
	if err != nil {
		return nil, fmt.Errorf("failed to get memory usage: %w", err)
	}

	diskStatus, err := GetDiskUsage("/")
	if err != nil {
		return nil, fmt.Errorf("failed to get disk usage: %w", err)
	}

	networkStatus, err := GetNetworkUsage()
	if err != nil {
		return nil, fmt.Errorf("failed to get network usage: %w", err)
	}

	return &models.SystemStatus{
		CPU:     cpuStatus,
		Memory:  memStatus,
		Disk:    diskStatus,
		Network: networkStatus,
	}, nil
}

// Simple functions that return map[string]float64 for backward compatibility
func GetCPUUsageSimple() map[string]float64 {
	cpuStatus, err := GetCPUUsage()
	if err != nil {
		log.Println(err)
		return nil
	}
	return map[string]float64{
		"cpu_percent": cpuStatus.UsagePercent,
	}
}

func GetMemoryUsageSimple() map[string]float64 {
	memStatus, err := GetMemoryUsage()
	if err != nil {
		log.Println(err)
		return nil
	}
	return map[string]float64{
		"memory_percent": memStatus.UsagePercent,
	}
}

func GetDiskUsageSimple() map[string]float64 {
	diskStatus, err := GetDiskUsage("/")
	if err != nil {
		log.Println(err)
		return nil
	}
	return map[string]float64{
		"disk_percent": diskStatus.UsagePercent,
	}
}
func GetNetworkTotalsSimple() map[string]float64 {
	networkTotals, err := GetNetworkTotals()
	if err != nil {
		log.Println(err)
		return nil
	}
	return networkTotals
}
