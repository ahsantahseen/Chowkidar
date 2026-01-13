package models

// CPUStatus represents CPU usage information
type CPUStatus struct {
	UsagePercent float64   `json:"usage_percent"`
	PerCore      []float64 `json:"per_core,omitempty"`
	CoreCount    int       `json:"core_count"`
}
