package models

// SystemStatus combines all system metrics
type SystemStatus struct {
	CPU     *CPUStatus      `json:"cpu"`
	Memory  *MemoryStatus   `json:"memory"`
	Disk    *DiskStatus     `json:"disk"`
	Network []NetworkStatus `json:"network"`
}
