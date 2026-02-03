package models

// CPUStatus represents CPU usage information
type CPUStatus struct {
	UsagePercent float64   `json:"usage_percent"`
	PerCore      []float64 `json:"per_core,omitempty"`
	CoreCount    int       `json:"core_count"`
}

// CPUInfo represents detailed CPU architecture information
type CPUInfo struct {
	ModelName    string `json:"model_name"`
	Cores        int    `json:"cores"`
	Threads      int    `json:"threads"`
	Architecture string `json:"architecture"`
	VendorID     string `json:"vendor_id"`
	Family       string `json:"family"`
	Model        string `json:"model"`
	Stepping     string `json:"stepping"`
	MaxFrequency string `json:"max_frequency"`
	Flags        string `json:"flags"`
	IsARM        bool   `json:"is_arm"`
	IsX86        bool   `json:"is_x86"`
	HasSSE42     bool   `json:"has_sse42"`
	HasAVX       bool   `json:"has_avx"`
	HasAVX2      bool   `json:"has_avx2"`
	HasSSE41     bool   `json:"has_sse41"`
	HasNEON      bool   `json:"has_neon"`
	HasSVE       bool   `json:"has_sve"`
	HasCRC32     bool   `json:"has_crc32"`
}

// SoftwareCompatibility represents application compatibility information
type SoftwareCompatibility struct {
	Name         string `json:"name"`
	Category     string `json:"category"`
	Compatible   bool   `json:"compatible"`
	Requirements string `json:"requirements"`
	Notes        string `json:"notes"`
}
