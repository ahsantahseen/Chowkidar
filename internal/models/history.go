package models

import "time"

// MetricSnapshot represents a single point in time for a metric
type MetricSnapshot struct {
	Timestamp time.Time `json:"timestamp"`
	Value     float64   `json:"value"`
}

// CPUHistory stores historical CPU usage
type CPUHistory struct {
	Timestamp time.Time `json:"timestamp"`
	Usage     float64   `json:"usage"`
	PerCore   []float64 `json:"per_core,omitempty"`
}

// MemoryHistory stores historical memory usage
type MemoryHistory struct {
	Timestamp    time.Time `json:"timestamp"`
	UsedGB       float64   `json:"used_gb"`
	AvailableGB  float64   `json:"available_gb"`
	UsagePercent float64   `json:"usage_percent"`
}

// DiskHistory stores historical disk usage
type DiskHistory struct {
	Timestamp    time.Time `json:"timestamp"`
	UsedGB       float64   `json:"used_gb"`
	TotalGB      float64   `json:"total_gb"`
	UsagePercent float64   `json:"usage_percent"`
}

// NetworkHistory stores historical network stats
type NetworkHistory struct {
	Timestamp     time.Time `json:"timestamp"`
	BytesSent     uint64    `json:"bytes_sent"`
	BytesRecv     uint64    `json:"bytes_recv"`
	BytesSentRate float64   `json:"bytes_sent_rate"` // bytes/sec
	BytesRecvRate float64   `json:"bytes_recv_rate"` // bytes/sec
}

// HistoricalDataWindow holds time-series data for dashboard
type HistoricalDataWindow struct {
	CPU     []CPUHistory     `json:"cpu"`
	Memory  []MemoryHistory  `json:"memory"`
	Disk    []DiskHistory    `json:"disk"`
	Network []NetworkHistory `json:"network"`
}
