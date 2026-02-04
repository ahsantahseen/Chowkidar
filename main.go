package main

import (
	"chowkidar/internal/controllers"
	"chowkidar/internal/middleware"
	"chowkidar/internal/routes"
	"chowkidar/internal/services"
	"flag"
	"log"
	"net"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func main() {
	printTokenOnly := flag.Bool("print-token", false, "print a token and exit")
	flag.Parse()

	// ============================================================
	// Initialize Services
	// ============================================================
	// Initialize auth service (generates JWT tokens)
	secretKey := os.Getenv("CHOWKIDAR_SECRET_KEY")
	_ = services.InitAuthService(secretKey, 7*24*time.Hour)
	log.Println("✓ Auth service initialized")

	// Initialize WebSocket hub for real-time stats
	_ = services.InitWebSocketHub()
	log.Println("✓ WebSocket hub initialized")

	// Initialize security services
	rateLimiter := middleware.NewRateLimiter()
	tokenRateLimiter := middleware.NewTokenRateLimiter()
	_ = middleware.NewSecurityLogger() // Initializes global security logger
	log.Println("✓ Security middleware initialized")

	// Resolve bind address (supports separate instances via env vars)
	bindAddr := os.Getenv("CHOWKIDAR_BIND_ADDR")
	host := os.Getenv("CHOWKIDAR_HOST")
	port := os.Getenv("CHOWKIDAR_PORT")
	if bindAddr != "" {
		if parsedHost, parsedPort, err := net.SplitHostPort(bindAddr); err == nil {
			if host == "" {
				host = parsedHost
			}
			if port == "" {
				port = parsedPort
			}
		}
	} else {
		if host == "" {
			host = "127.0.0.1"
		}
		if port == "" {
			port = "8080"
		}
		bindAddr = net.JoinHostPort(host, port)
	}
	displayHost := host
	if displayHost == "" {
		displayHost = "127.0.0.1"
	}
	if displayHost == "0.0.0.0" || displayHost == "::" {
		displayHost = "localhost"
	}

	// Generate initial token
	token, err := services.GenerateToken("chowkidar-agent")
	if err != nil {
		log.Fatalf("Failed to generate token: %v", err)
	}
	if *printTokenOnly {
		log.Println(token)
		return
	}
	go func() {
		ticker := time.NewTicker(7 * 24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			rotated, err := services.GenerateToken("chowkidar-agent")
			if err != nil {
				log.Printf("Failed to rotate token: %v", err)
				continue
			}
			log.Printf("Rotated token: %s", rotated[:20]+"...")
		}
	}()
	log.Printf("\n"+
		"=====================================\n"+
		"🔐 Server Token Generated\n"+
		"=====================================\n"+
		"Token: %s\n"+
		"Expires: %v\n"+
		"WebSocket URL: ws://%s:%s/ws?token=%s\n"+
		"=====================================\n",
		token[:20]+"...", services.GetTokenExpiry(), displayHost, port, token)

	// Initialize Gin router with default middleware (Logger + Recovery)
	r := gin.Default()

	// ============================================================
	// Security Middleware
	// ============================================================
	// Add security headers to all responses
	r.Use(middleware.SecurityHeadersMiddleware())

	// Add rate limiting to all endpoints
	r.Use(middleware.RateLimitMiddleware(rateLimiter))

	// Configure CORS - allow localhost and specific origins
	allowedOrigins := []string{"http://localhost:3000", "http://localhost:8080", "http://127.0.0.1:8080", "chowkidar://app"}
	if port != "" {
		allowedOrigins = append(allowedOrigins, "http://"+net.JoinHostPort(displayHost, port))
	}
	corsEnv := os.Getenv("CHOWKIDAR_ALLOWED_ORIGINS")
	if corsEnv != "" {
		for _, origin := range strings.Split(corsEnv, ",") {
			trimmed := strings.TrimSpace(origin)
			if trimmed != "" {
				allowedOrigins = append(allowedOrigins, trimmed)
			}
		}
	}
	r.Use(middleware.CORSMiddleware(allowedOrigins))

	// ============================================================
	// Background Services
	// ============================================================
	// Start metric collectors (1-second for real-time, 1-minute for 1h history)
	services.StartProcessCollector(time.Second)
	services.StartHistoryCollector(1 * time.Minute)

	// ============================================================
	// API Routes
	// ============================================================
	routes.RegisterMonitorRoutes(r) // /metrics/* endpoints
	routes.RegisterProcessRoutes(r) // /processes/* endpoints

	// Auth routes with stricter rate limiting
	authRoutes := r.Group("/auth")
	authRoutes.Use(middleware.TokenRateLimitMiddleware(tokenRateLimiter))
	{
		authRoutes.GET("/status", controllers.HandleTokenStatus)
	}

	// WebSocket endpoint with rate limiting
	r.GET("/ws", middleware.RateLimitMiddleware(rateLimiter), controllers.HandleWebSocket)

	// ============================================================
	// Start Server
	// ============================================================
	r.Run(bindAddr)
}
