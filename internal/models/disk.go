package models

// DiskStatus represents detailed disk usage information
type DiskStatus struct {
	Path         string  `json:"path"`
	TotalGB      float64 `json:"total_gb"`
	UsedGB       float64 `json:"used_gb"`
	FreeGB       float64 `json:"free_gb"`
	UsagePercent float64 `json:"usage_percent"`
	Filesystem   string  `json:"filesystem"`
}
