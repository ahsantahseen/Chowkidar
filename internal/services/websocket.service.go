package services

import (
	"chowkidar/internal/models"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// WebSocketMessage represents a message sent over WebSocket
type WebSocketMessage struct {
	Type      string      `json:"type"` // "stats", "auth", "ping", "error"
	Timestamp time.Time   `json:"timestamp"`
	Data      interface{} `json:"data,omitempty"` // Can be json.RawMessage or map[string]interface{}
	Error     string      `json:"error,omitempty"`
	Token     string      `json:"token,omitempty"` // For auth messages from client
}

// StatsPayload represents real-time system stats
type StatsPayload struct {
	CPU       *models.CPUStatus               `json:"cpu"`
	Memory    *models.MemoryStatus            `json:"memory"`
	Disk      *models.DiskStatus              `json:"disk"`
	Network   *models.AggregatedNetworkStatus `json:"network"`
	Processes []models.ProcessStatus          `json:"processes,omitempty"`
	Timestamp time.Time                       `json:"timestamp"`
}

// ClientConnection represents a connected WebSocket client
type ClientConnection struct {
	ID    string
	Conn  *websocket.Conn
	Send  chan WebSocketMessage
	Close chan bool
}

// WebSocketHub manages all connected WebSocket clients
type WebSocketHub struct {
	clients    map[string]*ClientConnection
	broadcast  chan WebSocketMessage
	register   chan *ClientConnection
	unregister chan string
	mu         sync.RWMutex
	ticker     *time.Ticker
	done       chan bool
}

var wsHub *WebSocketHub

// InitWebSocketHub initializes the WebSocket hub
func InitWebSocketHub() *WebSocketHub {
	wsHub = &WebSocketHub{
		clients:    make(map[string]*ClientConnection),
		broadcast:  make(chan WebSocketMessage, 256),
		register:   make(chan *ClientConnection),
		unregister: make(chan string),
		done:       make(chan bool),
	}

	// Start the hub
	go wsHub.run()

	return wsHub
}

// run manages the hub's event loop
func (h *WebSocketHub) run() {
	// Broadcast stats every second
	h.ticker = time.NewTicker(1 * time.Second)
	defer h.ticker.Stop()

	for {
		select {
		case <-h.done:
			return

		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = client
			h.mu.Unlock()
			log.Printf("[WS] Client connected: %s (total: %d)", client.ID, len(h.clients))

		case clientID := <-h.unregister:
			h.mu.Lock()
			if client, exists := h.clients[clientID]; exists {
				delete(h.clients, clientID)
				close(client.Send)
			}
			h.mu.Unlock()
			log.Printf("[WS] Client disconnected: %s (total: %d)", clientID, len(h.clients))

		case msg := <-h.broadcast:
			h.mu.RLock()
			for _, client := range h.clients {
				select {
				case client.Send <- msg:
				default:
					// Client's send channel is full, skip this message
				}
			}
			h.mu.RUnlock()

		case <-h.ticker.C:
			// Broadcast current stats to all clients
			stats := h.gatherStats()
			data, err := json.Marshal(stats)
			if err != nil {
				log.Printf("[WS] Error marshaling stats: %v", err)
				continue
			}

			msg := WebSocketMessage{
				Type:      "stats",
				Timestamp: time.Now(),
				Data:      json.RawMessage(data),
			}

			select {
			case h.broadcast <- msg:
			default:
				// Channel full, skip this broadcast
			}
		}
	}
}

// gatherStats collects current system statistics
func (h *WebSocketHub) gatherStats() *StatsPayload {
	cpu, _ := GetCachedCPU()
	memory, _ := GetCachedMemory()
	disk, _ := GetCachedDisk()
	networkInterfaces, _ := GetCachedNetwork()
	processes, _, _, _ := GetCachedProcesses()

	// Build aggregated network data with real-time rates
	var aggregatedNet *models.AggregatedNetworkStatus
	if networkInterfaces != nil && len(networkInterfaces) > 0 {
		totalBytesSent := uint64(0)
		totalBytesRecv := uint64(0)
		for _, iface := range networkInterfaces {
			totalBytesSent += iface.BytesSent
			totalBytesRecv += iface.BytesRecv
		}

		sentRate, recvRate := GetNetworkRates()
		aggregatedNet = &models.AggregatedNetworkStatus{
			BytesSent:     totalBytesSent,
			BytesRecv:     totalBytesRecv,
			BytesSentRate: sentRate,
			BytesRecvRate: recvRate,
			Interfaces:    networkInterfaces,
		}
	}

	// Limit processes to top 10 to reduce payload
	topProcesses := processes
	if len(topProcesses) > 10 {
		topProcesses = topProcesses[:10]
	}

	return &StatsPayload{
		CPU:       cpu,
		Memory:    memory,
		Disk:      disk,
		Network:   aggregatedNet,
		Processes: topProcesses,
		Timestamp: time.Now(),
	}
}

// Register adds a new client to the hub
func (h *WebSocketHub) Register(client *ClientConnection) {
	h.register <- client
}

// Unregister removes a client from the hub
func (h *WebSocketHub) Unregister(clientID string) {
	h.unregister <- clientID
}

// Broadcast sends a message to all connected clients
func (h *WebSocketHub) Broadcast(msg WebSocketMessage) {
	h.broadcast <- msg
}

// GetHub returns the WebSocket hub
func GetWebSocketHub() *WebSocketHub {
	return wsHub
}

// SendMessage sends a message to a specific client
func SendMessage(clientID string, msg WebSocketMessage) error {
	hub := GetWebSocketHub()
	if hub == nil {
		return nil // Hub not initialized yet
	}

	hub.mu.RLock()
	client, exists := hub.clients[clientID]
	hub.mu.RUnlock()

	if !exists {
		return nil // Client not connected
	}

	select {
	case client.Send <- msg:
		return nil
	default:
		return nil // Send channel full
	}
}

// StopWebSocketHub gracefully stops the hub
func StopWebSocketHub() {
	if wsHub != nil {
		wsHub.done <- true
	}
}
