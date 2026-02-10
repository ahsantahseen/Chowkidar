package middleware

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// Package-level security logger instance
var GlobalSecurityLogger *SecurityLogger

// RateLimiter implements token bucket rate limiting per IP
type RateLimiter struct {
	limiters map[string]*rate.Limiter
	mu       sync.RWMutex
}

// NewRateLimiter creates a new rate limiter
func NewRateLimiter() *RateLimiter {
	return &RateLimiter{
		limiters: make(map[string]*rate.Limiter),
	}
}

// GetLimiter gets or creates a limiter for an IP address
func (rl *RateLimiter) GetLimiter(ip string) *rate.Limiter {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	if limiter, exists := rl.limiters[ip]; exists {
		return limiter
	}

	// 100 requests per second per IP, burst of 200
	limiter := rate.NewLimiter(rate.Limit(100), 200)
	rl.limiters[ip] = limiter
	return limiter
}

// RateLimitMiddleware enforces rate limiting per IP
func RateLimitMiddleware(limiter *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !limiter.GetLimiter(ip).Allow() {
			log.Printf("[SECURITY] Rate limit exceeded for IP: %s", ip)
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "rate limit exceeded",
				"retry_after": 60,
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// TokenRateLimiter limits token generation per IP (stricter than general rate limiting)
type TokenRateLimiter struct {
	limiters map[string]*rate.Limiter
	mu       sync.RWMutex
}

// NewTokenRateLimiter creates a new token-specific rate limiter
func NewTokenRateLimiter() *TokenRateLimiter {
	return &TokenRateLimiter{
		limiters: make(map[string]*rate.Limiter),
	}
}

// GetLimiter gets or creates a limiter for an IP address
func (tr *TokenRateLimiter) GetLimiter(ip string) *rate.Limiter {
	tr.mu.Lock()
	defer tr.mu.Unlock()

	if limiter, exists := tr.limiters[ip]; exists {
		return limiter
	}

	// 5 token requests per minute per IP, burst of 10
	limiter := rate.NewLimiter(rate.Every(12*time.Second), 10)
	tr.limiters[ip] = limiter
	return limiter
}

// TokenRateLimitMiddleware enforces stricter rate limiting on token endpoints
func TokenRateLimitMiddleware(limiter *TokenRateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !limiter.GetLimiter(ip).Allow() {
			log.Printf("[SECURITY] Token rate limit exceeded for IP: %s (possible token enumeration attempt)", ip)
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "token endpoint rate limited",
				"retry_after": 60,
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// SecurityHeadersMiddleware adds security headers to all responses
func SecurityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		c.Next()
	}
}

// CORSMiddleware configures CORS with security restrictions
func CORSMiddleware(allowedOrigins []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		normalizedOrigin := strings.TrimRight(origin, "/")

		// Check if origin is in allowed list
		allowed := false
		if len(allowedOrigins) == 0 {
			allowed = normalizedOrigin != ""
		} else {
			for _, o := range allowedOrigins {
				trimmed := strings.TrimSpace(o)
				if trimmed == "" {
					continue
				}
				trimmed = strings.TrimRight(trimmed, "/")
				if trimmed == "*" || normalizedOrigin == trimmed {
					allowed = true
					break
				}
				if trimmed == "chowkidar://app" && strings.HasPrefix(normalizedOrigin, "chowkidar://") {
					allowed = true
					break
				}
				if normalizedOrigin == "null" && trimmed == "chowkidar://app" {
					allowed = true
					break
				}
				if !strings.Contains(trimmed, "://") {
					if parsed, err := url.Parse(normalizedOrigin); err == nil && parsed.Host == trimmed {
						allowed = true
						break
					}
				}
			}
		}

		if allowed {
			c.Header("Vary", "Origin")
			if normalizedOrigin != "" {
				c.Header("Access-Control-Allow-Origin", normalizedOrigin)
			}
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
			c.Header("Access-Control-Max-Age", "86400")
		}

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// IPWhitelistMiddleware restricts access to whitelisted IPs
type IPWhitelist struct {
	ips map[string]bool
	mu  sync.RWMutex
}

// NewIPWhitelist creates a new IP whitelist
func NewIPWhitelist(ips []string) *IPWhitelist {
	wl := &IPWhitelist{
		ips: make(map[string]bool),
	}
	for _, ip := range ips {
		wl.ips[ip] = true
	}
	return wl
}

// IsAllowed checks if an IP is whitelisted
func (wl *IPWhitelist) IsAllowed(ip string) bool {
	wl.mu.RLock()
	defer wl.mu.RUnlock()

	// Allow localhost always
	if ip == "127.0.0.1" || ip == "::1" || ip == "localhost" {
		return true
	}

	// If no whitelist configured, allow all
	if len(wl.ips) == 0 {
		return true
	}

	// Strip port from IP if present
	ipOnly, _, _ := net.SplitHostPort(ip)
	if ipOnly == "" {
		ipOnly = ip
	}

	return wl.ips[ipOnly]
}

// IPWhitelistMiddleware enforces IP whitelisting
func IPWhitelistMiddleware(whitelist *IPWhitelist) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !whitelist.IsAllowed(ip) {
			log.Printf("[SECURITY] Access denied for non-whitelisted IP: %s", ip)
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// SecurityLogger logs security events
type SecurityLogger struct {
	mu sync.Mutex
}

// LogTokenShared logs when a token might be shared publicly
func (sl *SecurityLogger) LogTokenShared(token string, ip string) {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	tokenPreview := ""
	if len(token) > 10 {
		tokenPreview = token[:10] + "..."
	}
	log.Printf("[SECURITY-WARNING] Possible token sharing: %s from IP %s", tokenPreview, ip)
}

// LogFailedAuth logs failed authentication attempts
func (sl *SecurityLogger) LogFailedAuth(ip string, reason string) {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	log.Printf("[SECURITY-WARNING] Failed authentication from IP %s: %s", ip, reason)
}

// LogTokenGenerated logs successful token generation
func (sl *SecurityLogger) LogTokenGenerated(ip string, serverName string) {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	log.Printf("[SECURITY] Token generated for server %s from IP %s", serverName, ip)
}

// LogWebSocketConnected logs successful WebSocket connections
func (sl *SecurityLogger) LogWebSocketConnected(ip string, serverName string) {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	log.Printf("[SECURITY] WebSocket connected for server %s from IP %s", serverName, ip)
}

// LogWebSocketDisconnected logs WebSocket disconnections
func (sl *SecurityLogger) LogWebSocketDisconnected(ip string, clientID string) {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	log.Printf("[SECURITY] WebSocket disconnected: %s from IP %s", clientID, ip)
}

// NewSecurityLogger creates a new security logger
func NewSecurityLogger() *SecurityLogger {
	sl := &SecurityLogger{}
	GlobalSecurityLogger = sl
	return sl
}

// InputValidator validates and sanitizes user input
type InputValidator struct{}

// ValidateToken checks if token format is valid
func (iv *InputValidator) ValidateToken(token string) bool {
	// JWT tokens are in format: header.payload.signature
	if len(token) < 20 || len(token) > 4096 {
		return false
	}

	// Count dots
	dotCount := 0
	for _, c := range token {
		if c == '.' {
			dotCount++
		}
	}

	return dotCount == 2
}

// ValidateServerName checks if server name is safe
func (iv *InputValidator) ValidateServerName(name string) bool {
	if len(name) < 1 || len(name) > 255 {
		return false
	}

	// Allow alphanumeric, hyphens, underscores, dots
	for _, c := range name {
		if !((c >= 'a' && c <= 'z') ||
			(c >= 'A' && c <= 'Z') ||
			(c >= '0' && c <= '9') ||
			c == '-' || c == '_' || c == '.') {
			return false
		}
	}

	return true
}

// NewInputValidator creates a new input validator
func NewInputValidator() *InputValidator {
	return &InputValidator{}
}

// TLSConfig holds TLS configuration
type TLSConfig struct {
	Enabled  bool
	CertFile string
	KeyFile  string
}

// GenerateSelfSignedCert generates a self-signed certificate for testing
func GenerateSelfSignedCert(certFile, keyFile string) error {
	// This would require crypto/x509 and crypto/rand
	// For now, just log that it's needed
	log.Printf("[TLS] Self-signed certificate generation not yet implemented")
	log.Printf("[TLS] To enable TLS, provide certFile and keyFile paths")
	return fmt.Errorf("TLS not configured")
}
