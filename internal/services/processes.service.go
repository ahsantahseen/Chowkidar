package services

import (
	"chowkidar/internal/models"
	"log"

	"github.com/shirou/gopsutil/v3/process"
)

// GetTopProcessesByMemory returns the top N processes by memory usage
func GetTopProcessesByMemory(limit int) ([]models.ProcessStatus, error) {
	processes, err := process.Processes()
	if err != nil {
		return nil, err
	}

	var processStatuses []models.ProcessStatus

	for _, p := range processes {
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

		processStatuses = append(processStatuses, models.ProcessStatus{
			PID:        p.Pid,
			Name:       name,
			CPUPercent: cpuPercent,
			MemPercent: memPercent,
			Status:     status[0],
		})
	}

	// Sort by memory and limit results
	if len(processStatuses) > limit {
		processStatuses = processStatuses[:limit]
	}

	return processStatuses, nil
}

// GetTopProcessesByCPU returns the top N processes by CPU usage
func GetTopProcessesByCPU(limit int) ([]models.ProcessStatus, error) {
	processes, err := process.Processes()
	if err != nil {
		return nil, err
	}

	var processStatuses []models.ProcessStatus

	for _, p := range processes {
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

		processStatuses = append(processStatuses, models.ProcessStatus{
			PID:        p.Pid,
			Name:       name,
			CPUPercent: cpuPercent,
			MemPercent: memPercent,
			Status:     status[0],
		})
	}

	// Sort by CPU and limit results
	if len(processStatuses) > limit {
		processStatuses = processStatuses[:limit]
	}

	return processStatuses, nil
}

// GetAllProcesses returns all running processes
func GetAllProcesses() ([]models.ProcessStatus, error) {
	processes, err := process.Processes()
	if err != nil {
		return nil, err
	}

	var processStatuses []models.ProcessStatus

	for _, p := range processes {
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

		processStatuses = append(processStatuses, models.ProcessStatus{
			PID:        p.Pid,
			Name:       name,
			CPUPercent: cpuPercent,
			MemPercent: memPercent,
			Status:     status[0],
		})
	}

	return processStatuses, nil
}

// GetProcessCount returns the total number of running processes
func GetProcessCount() (int, error) {
	processes, err := process.Processes()
	if err != nil {
		return 0, err
	}
	return len(processes), nil
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
