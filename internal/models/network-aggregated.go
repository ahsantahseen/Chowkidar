package models

// AggregatedNetworkStatus represents aggregated network statistics across all interfaces
type AggregatedNetworkStatus struct {
	BytesSent     uint64          `json:"bytes_sent"`
	BytesRecv     uint64          `json:"bytes_recv"`
	BytesSentRate float64         `json:"bytes_sent_rate"` // bytes/sec
	BytesRecvRate float64         `json:"bytes_recv_rate"` // bytes/sec
	PacketsSent   uint64          `json:"packets_sent"`
	PacketsRecv   uint64          `json:"packets_recv"`
	ErrorsIn      uint64          `json:"errors_in"`
	ErrorsOut     uint64          `json:"errors_out"`
	DropsIn       uint64          `json:"drops_in"`
	DropsOut      uint64          `json:"drops_out"`
	Interfaces    []NetworkStatus `json:"interfaces"`
}
