package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"inspector-gadget-management/backend/internal/gadget"
	"inspector-gadget-management/backend/internal/handler"
	"inspector-gadget-management/backend/internal/sessionstore"
	"inspector-gadget-management/backend/internal/storage"

	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	ctx := context.Background()

	// Initialize storage (Redis + TimescaleDB)
	storageConfig := storage.Config{
		RedisAddr: getEnv("REDIS_ADDR", "redis:6379"),
		RedisPass: getEnv("REDIS_PASSWORD", ""),
		PostgresURL: getEnv("POSTGRES_URL",
			"postgres://gadget:gadget_password_change_in_production@timescaledb:5432/gadget_events"),
	}

	store, err := storage.NewStorage(ctx, storageConfig)
	if err != nil {
		log.Printf("Warning: Failed to initialize storage: %v", err)
		log.Printf("Continuing without persistence layer...")
		store = nil
	} else {
		defer store.Close()

		// Start consumer worker in background
		go func() {
			if err := store.StartConsumer(ctx); err != nil {
				log.Printf("Consumer stopped: %v", err)
			}
		}()

		log.Printf("Storage layer initialized successfully")
	}

	// Initialize session store for distributed session management
	sessionStoreConfig := sessionstore.Config{
		RedisAddr: getEnv("REDIS_ADDR", "redis:6379"),
		RedisPass: getEnv("REDIS_PASSWORD", ""),
	}

	sessionStore, err := sessionstore.NewSessionStore(ctx, sessionStoreConfig)
	if err != nil {
		log.Printf("Warning: Failed to initialize session store: %v", err)
		log.Printf("Continuing without distributed session management...")
		sessionStore = nil
	} else {
		defer sessionStore.Close()
		log.Printf("Session store initialized with instance ID: %s", sessionStore.GetInstanceID())
	}

	// Initialize gadget client
	gadgetClient := gadget.NewClient()

	// Initialize handler with storage and session store
	h := handler.NewHandler(gadgetClient, store, sessionStore)

	// Setup router
	r := mux.NewRouter()
	h.RegisterRoutes(r)

	// Health check endpoint
	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}).Methods("GET")

	// CORS middleware
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	handler := c.Handler(r)

	// Setup graceful shutdown
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: handler,
	}

	// Start server in goroutine
	go func() {
		log.Printf("Starting server on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Graceful shutdown with timeout
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}

// getEnv gets an environment variable with a default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
