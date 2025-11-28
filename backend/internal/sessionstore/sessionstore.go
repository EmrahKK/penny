package sessionstore

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"inspector-gadget-management/backend/internal/models"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const (
	// Redis key patterns
	sessionKeyPrefix     = "session:"
	sessionIndexKey      = "sessions:active"
	backendSessionsKey   = "backend:%s:sessions"
	backendHeartbeatKey  = "backend:%s:heartbeat"
	wsConnectionKey      = "ws:%s"
	lockKeyPrefix        = "lock:session:"

	// Lock settings
	lockTimeout      = 10 * time.Second
	lockRetryDelay   = 100 * time.Millisecond
	maxLockRetries   = 50

	// Heartbeat settings
	heartbeatInterval = 5 * time.Second
	heartbeatTimeout  = 15 * time.Second
)

// SessionStore handles distributed session management with Redis
type SessionStore struct {
	redis      *redis.Client
	instanceID string
	ctx        context.Context
}

// Config holds session store configuration
type Config struct {
	RedisAddr string
	RedisPass string
}

// NewSessionStore creates a new distributed session store
func NewSessionStore(ctx context.Context, cfg Config) (*SessionStore, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPass,
		DB:       0,
	})

	// Test connection
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	// Generate unique instance ID
	instanceID := uuid.New().String()

	store := &SessionStore{
		redis:      rdb,
		instanceID: instanceID,
		ctx:        ctx,
	}

	// Start heartbeat goroutine
	go store.sendHeartbeats()

	return store, nil
}

// GetInstanceID returns the backend instance ID
func (s *SessionStore) GetInstanceID() string {
	return s.instanceID
}

// CreateSession creates a new session in Redis
func (s *SessionStore) CreateSession(session models.GadgetSession) error {
	// Acquire lock
	lockKey := lockKeyPrefix + session.ID
	if err := s.acquireLock(lockKey); err != nil {
		return fmt.Errorf("failed to acquire lock: %w", err)
	}
	defer s.releaseLock(lockKey)

	// Serialize session
	sessionData, err := json.Marshal(session)
	if err != nil {
		return fmt.Errorf("failed to marshal session: %w", err)
	}

	pipe := s.redis.Pipeline()

	// Store session data
	sessionKey := sessionKeyPrefix + session.ID
	pipe.Set(s.ctx, sessionKey, sessionData, 0)

	// Add to active sessions index
	pipe.SAdd(s.ctx, sessionIndexKey, session.ID)

	// Add to this backend's sessions
	backendSessions := fmt.Sprintf(backendSessionsKey, s.instanceID)
	pipe.SAdd(s.ctx, backendSessions, session.ID)

	_, err = pipe.Exec(s.ctx)
	if err != nil {
		return fmt.Errorf("failed to create session in Redis: %w", err)
	}

	return nil
}

// GetSession retrieves a session from Redis
func (s *SessionStore) GetSession(sessionID string) (*models.GadgetSession, error) {
	sessionKey := sessionKeyPrefix + sessionID
	data, err := s.redis.Get(s.ctx, sessionKey).Result()
	if err == redis.Nil {
		return nil, fmt.Errorf("session not found: %s", sessionID)
	} else if err != nil {
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	var session models.GadgetSession
	if err := json.Unmarshal([]byte(data), &session); err != nil {
		return nil, fmt.Errorf("failed to unmarshal session: %w", err)
	}

	return &session, nil
}

// UpdateSession updates a session in Redis
func (s *SessionStore) UpdateSession(session models.GadgetSession) error {
	lockKey := lockKeyPrefix + session.ID
	if err := s.acquireLock(lockKey); err != nil {
		return fmt.Errorf("failed to acquire lock: %w", err)
	}
	defer s.releaseLock(lockKey)

	sessionData, err := json.Marshal(session)
	if err != nil {
		return fmt.Errorf("failed to marshal session: %w", err)
	}

	sessionKey := sessionKeyPrefix + session.ID
	if err := s.redis.Set(s.ctx, sessionKey, sessionData, 0).Err(); err != nil {
		return fmt.Errorf("failed to update session: %w", err)
	}

	return nil
}

// DeleteSession removes a session from Redis
func (s *SessionStore) DeleteSession(sessionID string) error {
	lockKey := lockKeyPrefix + sessionID
	if err := s.acquireLock(lockKey); err != nil {
		return fmt.Errorf("failed to acquire lock: %w", err)
	}
	defer s.releaseLock(lockKey)

	pipe := s.redis.Pipeline()

	// Remove session data
	sessionKey := sessionKeyPrefix + sessionID
	pipe.Del(s.ctx, sessionKey)

	// Remove from active sessions index
	pipe.SRem(s.ctx, sessionIndexKey, sessionID)

	// Remove from backend sessions
	backendSessions := fmt.Sprintf(backendSessionsKey, s.instanceID)
	pipe.SRem(s.ctx, backendSessions, sessionID)

	// Remove WebSocket connection tracking
	wsKey := fmt.Sprintf(wsConnectionKey, sessionID)
	pipe.Del(s.ctx, wsKey)

	_, err := pipe.Exec(s.ctx)
	if err != nil {
		return fmt.Errorf("failed to delete session: %w", err)
	}

	return nil
}

// ListSessions returns all active sessions
func (s *SessionStore) ListSessions() ([]models.GadgetSession, error) {
	sessionIDs, err := s.redis.SMembers(s.ctx, sessionIndexKey).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to list sessions: %w", err)
	}

	sessions := make([]models.GadgetSession, 0, len(sessionIDs))
	for _, sessionID := range sessionIDs {
		session, err := s.GetSession(sessionID)
		if err != nil {
			// Session might have been deleted, skip it
			continue
		}
		sessions = append(sessions, *session)
	}

	return sessions, nil
}

// RegisterWebSocket registers that this backend instance has a WebSocket for the session
func (s *SessionStore) RegisterWebSocket(sessionID string) error {
	wsKey := fmt.Sprintf(wsConnectionKey, sessionID)
	return s.redis.Set(s.ctx, wsKey, s.instanceID, 0).Err()
}

// UnregisterWebSocket removes the WebSocket registration
func (s *SessionStore) UnregisterWebSocket(sessionID string) error {
	wsKey := fmt.Sprintf(wsConnectionKey, sessionID)
	return s.redis.Del(s.ctx, wsKey).Err()
}

// GetWebSocketBackend returns the backend instance ID that has the WebSocket for this session
func (s *SessionStore) GetWebSocketBackend(sessionID string) (string, error) {
	wsKey := fmt.Sprintf(wsConnectionKey, sessionID)
	instanceID, err := s.redis.Get(s.ctx, wsKey).Result()
	if err == redis.Nil {
		return "", fmt.Errorf("no WebSocket registered for session: %s", sessionID)
	}
	return instanceID, err
}

// HasWebSocket checks if this backend instance has the WebSocket for the session
func (s *SessionStore) HasWebSocket(sessionID string) bool {
	instanceID, err := s.GetWebSocketBackend(sessionID)
	if err != nil {
		return false
	}
	return instanceID == s.instanceID
}

// acquireLock acquires a distributed lock for a session
func (s *SessionStore) acquireLock(lockKey string) error {
	lockValue := s.instanceID + ":" + time.Now().String()

	for attempt := 0; attempt < maxLockRetries; attempt++ {
		success, err := s.redis.SetNX(s.ctx, lockKey, lockValue, lockTimeout).Result()
		if err != nil {
			return fmt.Errorf("failed to acquire lock: %w", err)
		}

		if success {
			return nil
		}

		// Lock is held by someone else, wait and retry
		time.Sleep(lockRetryDelay)
	}

	return fmt.Errorf("failed to acquire lock after %d attempts", maxLockRetries)
}

// releaseLock releases a distributed lock
func (s *SessionStore) releaseLock(lockKey string) error {
	return s.redis.Del(s.ctx, lockKey).Err()
}

// sendHeartbeats periodically sends heartbeats to indicate this backend is alive
func (s *SessionStore) sendHeartbeats() {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			heartbeatKey := fmt.Sprintf(backendHeartbeatKey, s.instanceID)
			s.redis.Set(s.ctx, heartbeatKey, time.Now().Unix(), heartbeatTimeout)
		}
	}
}

// RecoverSessions attempts to recover sessions from a failed backend instance
func (s *SessionStore) RecoverSessions() error {
	// Get all backend instances
	pattern := fmt.Sprintf(backendHeartbeatKey, "*")
	keys, err := s.redis.Keys(s.ctx, pattern).Result()
	if err != nil {
		return fmt.Errorf("failed to list backend instances: %w", err)
	}

	now := time.Now().Unix()

	// Check each backend's heartbeat
	for _, key := range keys {
		lastHeartbeat, err := s.redis.Get(s.ctx, key).Int64()
		if err == redis.Nil {
			continue
		} else if err != nil {
			continue
		}

		// If heartbeat is too old, backend is dead
		if now-lastHeartbeat > int64(heartbeatTimeout.Seconds()) {
			// Extract instance ID from key
			// TODO: Mark sessions from dead backend as failed
			// This would require reconnecting to gadget-daemon
			// For now, we'll just log it
			fmt.Printf("Detected dead backend instance: %s\n", key)
		}
	}

	return nil
}

// Close closes the session store
func (s *SessionStore) Close() error {
	// Clean up this instance's sessions
	backendSessions := fmt.Sprintf(backendSessionsKey, s.instanceID)
	s.redis.Del(s.ctx, backendSessions)

	// Remove heartbeat
	heartbeatKey := fmt.Sprintf(backendHeartbeatKey, s.instanceID)
	s.redis.Del(s.ctx, heartbeatKey)

	return s.redis.Close()
}
