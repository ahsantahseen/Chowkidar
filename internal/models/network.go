package models

// NetworkStatus represents network interface statistics
type NetworkStatus struct {
	Interface   string  `json:"interface"`
	BytesSent   uint64  `json:"bytes_sent"`
	BytesRecv   uint64  `json:"bytes_recv"`
	PacketsSent uint64  `json:"packets_sent"`
	PacketsRecv uint64  `json:"packets_recv"`
	ErrorsIn    uint64  `json:"errors_in"`
	ErrorsOut   uint64  `json:"errors_out"`
	DropsIn     uint64  `json:"drops_in"`
	DropsOut    uint64  `json:"drops_out"`
	BytesSentGB float64 `json:"bytes_sent_gb"`
	BytesRecvGB float64 `json:"bytes_recv_gb"`
}
