package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"inspector-gadget-management/backend/internal/gadget"
	"inspector-gadget-management/backend/internal/models"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

// Storage interface for data persistence
type Storage interface {
	PublishEvent(event models.GadgetOutput) error
	QueryEvents(ctx context.Context, filter interface{}) ([]models.GadgetOutput, error)
	RecordSessionStart(ctx context.Context, session models.GadgetSession) error
	RecordSessionEnd(ctx context.Context, sessionID string) error
	GetSessionStats(ctx context.Context, sessionID string) (interface{}, error)
}

// SessionStore interface for distributed session management
type SessionStore interface {
	GetInstanceID() string
	CreateSession(session models.GadgetSession) error
	GetSession(sessionID string) (*models.GadgetSession, error)
	UpdateSession(session models.GadgetSession) error
	DeleteSession(sessionID string) error
	ListSessions() ([]models.GadgetSession, error)
	RegisterWebSocket(sessionID string) error
	UnregisterWebSocket(sessionID string) error
	GetWebSocketBackend(sessionID string) (string, error)
	HasWebSocket(sessionID string) bool
	Close() error
}

// Handler manages HTTP and WebSocket handlers
type Handler struct {
	gadgetClient *gadget.Client
	storage      Storage
	sessionStore SessionStore
	upgrader     websocket.Upgrader
	wsClients    map[string]*WSClient
	mu           sync.RWMutex
}

// WSClient represents a WebSocket client
type WSClient struct {
	SessionID string
	Conn      *websocket.Conn
	Send      chan []byte
}

// NewHandler creates a new handler
func NewHandler(gadgetClient *gadget.Client, storage Storage, sessionStore SessionStore) *Handler {
	return &Handler{
		gadgetClient: gadgetClient,
		storage:      storage,
		sessionStore: sessionStore,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all origins for development
			},
		},
		wsClients: make(map[string]*WSClient),
	}
}

// RegisterRoutes registers all HTTP routes
func (h *Handler) RegisterRoutes(r *mux.Router) {
	// API routes
	r.HandleFunc("/api/gadgets", h.ListGadgets).Methods("GET")
	r.HandleFunc("/api/sessions", h.ListSessions).Methods("GET")
	r.HandleFunc("/api/sessions", h.StartSession).Methods("POST")
	r.HandleFunc("/api/sessions/{sessionId}", h.StopSession).Methods("DELETE")

	// Historical data routes
	r.HandleFunc("/api/events", h.QueryEvents).Methods("GET")
	r.HandleFunc("/api/sessions/{sessionId}/events", h.GetSessionEvents).Methods("GET")
	r.HandleFunc("/api/sessions/{sessionId}/stats", h.GetSessionStats).Methods("GET")

	// WebSocket route
	r.HandleFunc("/ws/{sessionId}", h.HandleWebSocket)
}

// ListGadgets returns available gadgets
func (h *Handler) ListGadgets(w http.ResponseWriter, r *http.Request) {
	gadgets := []map[string]interface{}{
		{
			"type":        models.GadgetTraceTCP,
			"name":        "Trace TCP",
			"description": "Trace TCP connections",
			"category":    "trace",
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gadgets)
}

// ListSessions returns all active sessions
func (h *Handler) ListSessions(w http.ResponseWriter, r *http.Request) {
	var sessions []models.GadgetSession
	var err error

	// Use sessionStore if available for distributed session management
	if h.sessionStore != nil {
		sessions, err = h.sessionStore.ListSessions()
		if err != nil {
			log.Printf("Failed to list sessions from store: %v", err)
			// Fallback to local sessions
			sessions = h.gadgetClient.ListSessions()
		}
	} else {
		// No session store, use local sessions only
		sessions = h.gadgetClient.ListSessions()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sessions)
}

// StartSession starts a new gadget session
func (h *Handler) StartSession(w http.ResponseWriter, r *http.Request) {
	var req models.GadgetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	sessionID := uuid.New().String()

	// Use background context so gadget continues running after HTTP request completes
	session, err := h.gadgetClient.RunGadget(context.Background(), req, sessionID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to start gadget: %v", err), http.StatusInternalServerError)
		return
	}

	response := models.GadgetSession{
		ID:          session.ID,
		Type:        session.Type,
		Namespace:   session.Namespace,
		PodName:     session.PodName,
		Status:      session.Status,
		StartTime:   session.StartTime,
		Timeout:     session.Timeout,
		AcceptOnly:  session.AcceptOnly,
		ConnectOnly: session.ConnectOnly,
		FailureOnly: session.FailureOnly,
	}

	// Store session in distributed session store
	if h.sessionStore != nil {
		if err := h.sessionStore.CreateSession(response); err != nil {
			log.Printf("Failed to create session in store: %v", err)
			// Continue anyway - session will be local only
		}
	}

	// Record session start in storage (for historical data)
	if h.storage != nil {
		if err := h.storage.RecordSessionStart(r.Context(), response); err != nil {
			log.Printf("Failed to record session start: %v", err)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// StopSession stops a running gadget session
func (h *Handler) StopSession(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	// Stop the gadget locally
	if err := h.gadgetClient.StopGadget(sessionID); err != nil {
		http.Error(w, fmt.Sprintf("Failed to stop session: %v", err), http.StatusInternalServerError)
		return
	}

	// Remove from distributed session store
	if h.sessionStore != nil {
		if err := h.sessionStore.DeleteSession(sessionID); err != nil {
			log.Printf("Failed to delete session from store: %v", err)
		}
	}

	// Record session end in storage (for historical data)
	if h.storage != nil {
		if err := h.storage.RecordSessionEnd(r.Context(), sessionID); err != nil {
			log.Printf("Failed to record session end: %v", err)
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleWebSocket handles WebSocket connections for real-time gadget output
func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	// Check if this backend has the local gadget session
	session, exists := h.gadgetClient.GetSession(sessionID)
	if !exists {
		// Session not found locally
		// In a distributed setup, check if another backend has it
		if h.sessionStore != nil {
			backendID, err := h.sessionStore.GetWebSocketBackend(sessionID)
			if err == nil && backendID != h.sessionStore.GetInstanceID() {
				// Session is on a different backend
				http.Error(w, "Session is on a different backend instance", http.StatusBadGateway)
				return
			}
		}
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	// Register WebSocket in session store
	if h.sessionStore != nil {
		if err := h.sessionStore.RegisterWebSocket(sessionID); err != nil {
			log.Printf("Failed to register WebSocket: %v", err)
			// Continue anyway
		}
	}

	client := &WSClient{
		SessionID: sessionID,
		Conn:      conn,
		Send:      make(chan []byte, 256),
	}

	h.mu.Lock()
	h.wsClients[sessionID] = client
	h.mu.Unlock()

	// Start goroutines for reading and writing
	go h.wsWriter(client)
	go h.wsReader(client)
	go h.forwardGadgetOutput(session, client)
}

// wsWriter writes messages to WebSocket
func (h *Handler) wsWriter(client *WSClient) {
	defer func() {
		client.Conn.Close()
		h.mu.Lock()
		delete(h.wsClients, client.SessionID)
		h.mu.Unlock()

		// Unregister WebSocket from session store
		if h.sessionStore != nil {
			if err := h.sessionStore.UnregisterWebSocket(client.SessionID); err != nil {
				log.Printf("Failed to unregister WebSocket: %v", err)
			}
		}
	}()

	for {
		message, ok := <-client.Send
		if !ok {
			client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
			return
		}

		if err := client.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
			log.Printf("WebSocket write error: %v", err)
			return
		}
	}
}

// wsReader reads messages from WebSocket (for keepalive)
func (h *Handler) wsReader(client *WSClient) {
	defer client.Conn.Close()

	for {
		_, _, err := client.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket read error: %v", err)
			}
			break
		}
	}
}

// forwardGadgetOutput forwards gadget output to WebSocket client
func (h *Handler) forwardGadgetOutput(session *gadget.Session, client *WSClient) {
	for {
		select {
		case output, ok := <-session.OutputCh:
			if !ok {
				// Channel closed, session ended
				message := map[string]interface{}{
					"type":   "session_ended",
					"status": session.Status,
				}
				if data, err := json.Marshal(message); err == nil {
					client.Send <- data
				}
				close(client.Send)
				return
			}

			// Publish to storage for persistence
			if h.storage != nil {
				if err := h.storage.PublishEvent(output); err != nil {
					log.Printf("Failed to publish event to storage: %v", err)
				}
			}

			// Forward output to WebSocket
			if data, err := json.Marshal(output); err == nil {
				select {
				case client.Send <- data:
				default:
					// Client send buffer full, skip message
				}
			}

		case err, ok := <-session.ErrorCh:
			if !ok {
				continue
			}

			// Forward error to WebSocket
			errorMsg := map[string]interface{}{
				"type":    "error",
				"message": err.Error(),
			}
			if data, err := json.Marshal(errorMsg); err == nil {
				select {
				case client.Send <- data:
				default:
					// Client send buffer full, skip message
				}
			}
		}
	}
}

// QueryEvents handles requests for historical events with filters
func (h *Handler) QueryEvents(w http.ResponseWriter, r *http.Request) {
	if h.storage == nil {
		http.Error(w, "Storage not configured", http.StatusServiceUnavailable)
		return
	}

	// Parse query parameters
	query := r.URL.Query()
	
	filter := map[string]interface{}{
		"event_type": query.Get("event_type"),
		"namespace":  query.Get("namespace"),
		"session_id": query.Get("session_id"),
	}

	// Parse time range
	if startStr := query.Get("start_time"); startStr != "" {
		if startTime, err := time.Parse(time.RFC3339, startStr); err == nil {
			filter["start_time"] = startTime
		}
	}
	if endStr := query.Get("end_time"); endStr != "" {
		if endTime, err := time.Parse(time.RFC3339, endStr); err == nil {
			filter["end_time"] = endTime
		}
	}

	// Parse limit
	if limitStr := query.Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil {
			filter["limit"] = limit
		}
	}

	events, err := h.storage.QueryEvents(r.Context(), filter)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to query events: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

// GetSessionEvents retrieves all events for a specific session
func (h *Handler) GetSessionEvents(w http.ResponseWriter, r *http.Request) {
	if h.storage == nil {
		http.Error(w, "Storage not configured", http.StatusServiceUnavailable)
		return
	}

	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	filter := map[string]interface{}{
		"session_id": sessionID,
	}

	// Parse limit from query params
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil {
			filter["limit"] = limit
		}
	}

	events, err := h.storage.QueryEvents(r.Context(), filter)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to query session events: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

// GetSessionStats retrieves statistics for a session
func (h *Handler) GetSessionStats(w http.ResponseWriter, r *http.Request) {
	if h.storage == nil {
		http.Error(w, "Storage not configured", http.StatusServiceUnavailable)
		return
	}

	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	stats, err := h.storage.GetSessionStats(r.Context(), sessionID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get session stats: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}
