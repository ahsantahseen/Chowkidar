package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// AuthService manages JWT token generation and validation
type AuthService struct {
	secretKey     string
	tokenExpiry   time.Duration
	refreshExpiry time.Duration
}

// CustomClaims represents the JWT claims structure
type CustomClaims struct {
	ServerName string `json:"server_name"`
	UserAgent  string `json:"user_agent"`
	jwt.RegisteredClaims
}

var authService *AuthService

// InitAuthService initializes the authentication service
func InitAuthService(secretKey string, tokenExpiry time.Duration) *AuthService {
	if secretKey == "" {
		// Try multiple locations for the secret key file
		// Primary: User's home directory
		homeDir, _ := os.UserHomeDir()
		keyFile := filepath.Join(homeDir, ".chowkidar-secret-key")

		// Backup: Temp directory
		if homeDir == "" {
			keyFile = filepath.Join(os.TempDir(), ".chowkidar-secret-key")
		}

		// Check if secret key file exists
		if data, err := os.ReadFile(keyFile); err == nil && len(data) > 0 {
			secretKey = strings.TrimSpace(string(data))
			log.Printf("✓ Loaded persisted secret key from %s (length: %d bytes)\n", keyFile, len(secretKey))
		} else {
			// Generate a strong secret key (32+ bytes for HMAC-SHA256)
			hostname, err := os.Hostname()
			if err != nil {
				hostname = "chowkidar-agent"
			}

			// Create a strong random key with hostname
			randomBytes := make([]byte, 16)
			_, err = rand.Read(randomBytes)
			if err != nil {
				// Fallback if random generation fails
				secretKey = fmt.Sprintf("chowkidar-%s-%d-backup", hostname, time.Now().UnixNano())
				log.Printf("⚠️  Warning: Random generation failed, using fallback key\n")
			} else {
				// Use hostname + random bytes (total 32+ bytes when hex encoded)
				randomHex := hex.EncodeToString(randomBytes)
				secretKey = fmt.Sprintf("chowkidar-%s-%s", hostname, randomHex)
			}

			// Save the generated secret key to file for future use
			if err := os.WriteFile(keyFile, []byte(secretKey), 0600); err != nil {
				log.Printf("⚠️  Warning: Could not persist secret key to %s: %v\n", keyFile, err)
			} else {
				log.Printf("✓ Generated and persisted secret key to %s (length: %d bytes)\n", keyFile, len(secretKey))
			}
		}
	}

	if tokenExpiry == 0 {
		tokenExpiry = 90 * 24 * time.Hour // 90 days default
	}

	// Trim any whitespace from secret key
	secretKey = strings.TrimSpace(secretKey)

	// Ensure secret key is at least 32 bytes for HMAC-SHA256
	// Only pad if this is a freshly generated key (not one loaded from file that's already long)
	if len(secretKey) < 32 {
		log.Printf("⚠️  Warning: Secret key is only %d bytes. Recommended minimum is 32 bytes for HMAC-SHA256\n", len(secretKey))
		// Pad with additional random bytes if necessary
		needed := 32 - len(secretKey)
		paddingBytes := make([]byte, needed)
		_, _ = rand.Read(paddingBytes)
		secretKey = secretKey + hex.EncodeToString(paddingBytes)
		log.Printf("Padded secret key to %d bytes\n", len(secretKey))
	}

	authService = &AuthService{
		secretKey:     secretKey,
		tokenExpiry:   tokenExpiry,
		refreshExpiry: 180 * 24 * time.Hour, // 180 days
	}

	return authService
}

// GenerateToken creates a new JWT token with server details
func GenerateToken(serverName string) (string, error) {
	if authService == nil {
		return "", fmt.Errorf("auth service not initialized")
	}

	now := time.Now()
	expiresAt := now.Add(authService.tokenExpiry)

	claims := CustomClaims{
		ServerName: serverName,
		UserAgent:  "chowkidar-agent",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "chowkidar-server",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(authService.secretKey))
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// ValidateToken verifies and parses a JWT token
func ValidateToken(tokenString string) (*CustomClaims, error) {
	if authService == nil {
		return nil, fmt.Errorf("auth service not initialized")
	}

	claims := &CustomClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(authService.secretKey), nil
	})

	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	return claims, nil
}

// GetAuthService returns the initialized auth service
func GetAuthService() *AuthService {
	return authService
}

// GetTokenExpiry returns when the current token will expire
func GetTokenExpiry() time.Time {
	if authService == nil {
		return time.Time{}
	}
	return time.Now().Add(authService.tokenExpiry)
}
