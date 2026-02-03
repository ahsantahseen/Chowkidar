package models

// DirectoryInfo represents information about a directory
type DirectoryInfo struct {
	Path   string  `json:"path"`
	SizeGB float64 `json:"size_gb"`
	Size   string  `json:"size"` // Human-readable size like "12.5 GB"
}
