package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"inspector-gadget-management/backend/internal/models"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const (
	// Redis stream name for gadget events
	EventsStreamName = "gadget:events"
	// Consumer group name
	ConsumerGroup = "gadget-processors"
	// Consumer name
	ConsumerName = "processor-1"
)

// Storage handles data persistence for gadget events
type Storage struct {
	redis *redis.Client
	db    *pgxpool.Pool
	ctx   context.Context
}

// Config holds storage configuration
type Config struct {
	RedisAddr    string
	RedisPass    string
	PostgresURL  string
}

// NewStorage creates a new storage instance
func NewStorage(ctx context.Context, cfg Config) (*Storage, error) {
	// Initialize Redis client
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPass,
		DB:       0,
	})

	// Test Redis connection
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	log.Printf("Connected to Redis at %s", cfg.RedisAddr)

	// Initialize PostgreSQL connection pool
	dbPool, err := pgxpool.New(ctx, cfg.PostgresURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to PostgreSQL: %w", err)
	}

	// Test database connection
	if err := dbPool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping PostgreSQL: %w", err)
	}

	log.Printf("Connected to PostgreSQL")

	// Create consumer group if it doesn't exist
	// MKSTREAM creates the stream if it doesn't exist
	err = rdb.XGroupCreateMkStream(ctx, EventsStreamName, ConsumerGroup, "0").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		log.Printf("Warning: Failed to create consumer group: %v", err)
	}

	return &Storage{
		redis: rdb,
		db:    dbPool,
		ctx:   ctx,
	}, nil
}

// PublishEvent publishes a gadget event to Redis Streams
func (s *Storage) PublishEvent(event models.GadgetOutput) error {
	// Serialize event data
	eventData, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	// Publish to Redis Stream
	values := map[string]interface{}{
		"session_id": event.SessionID,
		"event_type": event.EventType,
		"timestamp":  event.Timestamp.Format(time.RFC3339Nano),
		"data":       string(eventData),
	}

	_, err = s.redis.XAdd(s.ctx, &redis.XAddArgs{
		Stream: EventsStreamName,
		Values: values,
	}).Result()

	if err != nil {
		return fmt.Errorf("failed to publish event to Redis: %w", err)
	}

	return nil
}

// StartConsumer starts consuming events from Redis Streams and writes to TimescaleDB
func (s *Storage) StartConsumer(ctx context.Context) error {
	log.Printf("Starting event consumer...")

	for {
		select {
		case <-ctx.Done():
			log.Printf("Consumer stopped")
			return ctx.Err()
		default:
			// Read from stream
			streams, err := s.redis.XReadGroup(ctx, &redis.XReadGroupArgs{
				Group:    ConsumerGroup,
				Consumer: ConsumerName,
				Streams:  []string{EventsStreamName, ">"},
				Count:    10,
				Block:    5 * time.Second,
			}).Result()

			if err != nil {
				if err == redis.Nil {
					// No new messages
					continue
				}
				log.Printf("Error reading from stream: %v", err)
				time.Sleep(1 * time.Second)
				continue
			}

			// Process messages
			for _, stream := range streams {
				for _, message := range stream.Messages {
					if err := s.processMessage(ctx, message); err != nil {
						log.Printf("Error processing message %s: %v", message.ID, err)
						continue
					}

					// Acknowledge message
					s.redis.XAck(ctx, EventsStreamName, ConsumerGroup, message.ID)
				}
			}
		}
	}
}

// processMessage processes a single message from the stream
func (s *Storage) processMessage(ctx context.Context, msg redis.XMessage) error {
	// Extract fields
	sessionID, _ := msg.Values["session_id"].(string)
	eventType, _ := msg.Values["event_type"].(string)
	timestampStr, _ := msg.Values["timestamp"].(string)
	dataStr, _ := msg.Values["data"].(string)

	// Parse timestamp
	timestamp, err := time.Parse(time.RFC3339Nano, timestampStr)
	if err != nil {
		return fmt.Errorf("failed to parse timestamp: %w", err)
	}

	// Parse event data
	var event models.GadgetOutput
	if err := json.Unmarshal([]byte(dataStr), &event); err != nil {
		return fmt.Errorf("failed to unmarshal event: %w", err)
	}

	// Extract namespace and pod_name from event data if available
	// Try top-level first
	namespace, _ := event.Data["namespace"].(string)
	podName, _ := event.Data["pod"].(string)
	if podName == "" {
		podName, _ = event.Data["podName"].(string)
	}

	// If not found, try nested k8s object (common in trace gadgets)
	if namespace == "" {
		if k8sData, ok := event.Data["k8s"].(map[string]interface{}); ok {
			namespace, _ = k8sData["namespace"].(string)
			if podName == "" {
				podName, _ = k8sData["podName"].(string)
			}
		}
	}

	// Insert into TimescaleDB
	dataJSON, err := json.Marshal(event.Data)
	if err != nil {
		return fmt.Errorf("failed to marshal data: %w", err)
	}

	query := `
		INSERT INTO gadget_events (time, session_id, event_type, namespace, pod_name, data)
		VALUES ($1, $2, $3, $4, $5, $6)
	`

	_, err = s.db.Exec(ctx, query, timestamp, sessionID, eventType, namespace, podName, dataJSON)
	if err != nil {
		return fmt.Errorf("failed to insert event into database: %w", err)
	}

	return nil
}

// QueryEvents retrieves events from TimescaleDB
func (s *Storage) QueryEvents(ctx context.Context, filterInterface interface{}) ([]models.GadgetOutput, error) {
	// Convert interface{} to map
	filterMap, ok := filterInterface.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid filter type")
	}

	query := `
		SELECT time, session_id, event_type, namespace, pod_name, data
		FROM gadget_events
		WHERE 1=1
	`
	args := []interface{}{}
	argPos := 1

	// Add filters
	if sessionID, ok := filterMap["session_id"].(string); ok && sessionID != "" {
		query += fmt.Sprintf(" AND session_id = $%d", argPos)
		args = append(args, sessionID)
		argPos++
	}

	if eventType, ok := filterMap["event_type"].(string); ok && eventType != "" {
		query += fmt.Sprintf(" AND event_type = $%d", argPos)
		args = append(args, eventType)
		argPos++
	}

	if namespace, ok := filterMap["namespace"].(string); ok && namespace != "" {
		query += fmt.Sprintf(" AND namespace = $%d", argPos)
		args = append(args, namespace)
		argPos++
	}

	if startTime, ok := filterMap["start_time"].(time.Time); ok && !startTime.IsZero() {
		query += fmt.Sprintf(" AND time >= $%d", argPos)
		args = append(args, startTime)
		argPos++
	}

	if endTime, ok := filterMap["end_time"].(time.Time); ok && !endTime.IsZero() {
		query += fmt.Sprintf(" AND time <= $%d", argPos)
		args = append(args, endTime)
		argPos++
	}

	// Order by time and limit
	query += " ORDER BY time DESC"
	if limit, ok := filterMap["limit"].(int); ok && limit > 0 {
		query += fmt.Sprintf(" LIMIT $%d", argPos)
		args = append(args, limit)
	} else {
		query += " LIMIT 1000" // Default limit
	}

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query events: %w", err)
	}
	defer rows.Close()

	var events []models.GadgetOutput
	for rows.Next() {
		var (
			timestamp time.Time
			sessionID string
			eventType string
			namespace *string
			podName   *string
			dataJSON  []byte
		)

		err := rows.Scan(&timestamp, &sessionID, &eventType, &namespace, &podName, &dataJSON)
		if err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}

		var data map[string]interface{}
		if err := json.Unmarshal(dataJSON, &data); err != nil {
			return nil, fmt.Errorf("failed to unmarshal data: %w", err)
		}

		events = append(events, models.GadgetOutput{
			SessionID: sessionID,
			EventType: eventType,
			Timestamp: timestamp,
			Data:      data,
		})
	}

	return events, nil
}

// RecordSessionStart records when a session starts
func (s *Storage) RecordSessionStart(ctx context.Context, session models.GadgetSession) error {
	query := `
		INSERT INTO gadget_sessions (id, type, namespace, pod_name, status, start_time)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (id) DO UPDATE
		SET status = EXCLUDED.status,
		    updated_at = NOW()
	`

	_, err := s.db.Exec(ctx, query,
		session.ID,
		session.Type,
		session.Namespace,
		session.PodName,
		session.Status,
		session.StartTime,
	)

	return err
}

// RecordSessionEnd records when a session ends
func (s *Storage) RecordSessionEnd(ctx context.Context, sessionID string) error {
	query := `
		UPDATE gadget_sessions
		SET status = 'stopped',
		    end_time = NOW(),
		    updated_at = NOW()
		WHERE id = $1
	`

	_, err := s.db.Exec(ctx, query, sessionID)
	return err
}

// GetSessionStats retrieves statistics for a session
func (s *Storage) GetSessionStats(ctx context.Context, sessionID string) (interface{}, error) {
	query := `
		SELECT
			s.id,
			s.type,
			s.namespace,
			s.pod_name,
			s.status,
			s.start_time,
			s.end_time,
			COUNT(e.time) as event_count,
			MIN(e.time) as first_event,
			MAX(e.time) as last_event
		FROM gadget_sessions s
		LEFT JOIN gadget_events e ON s.id = e.session_id
		WHERE s.id = $1
		GROUP BY s.id, s.type, s.namespace, s.pod_name, s.status, s.start_time, s.end_time
	`

	var stats SessionStats
	var endTime *time.Time
	var firstEvent, lastEvent *time.Time

	err := s.db.QueryRow(ctx, query, sessionID).Scan(
		&stats.SessionID,
		&stats.Type,
		&stats.Namespace,
		&stats.PodName,
		&stats.Status,
		&stats.StartTime,
		&endTime,
		&stats.EventCount,
		&firstEvent,
		&lastEvent,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get session stats: %w", err)
	}

	if endTime != nil {
		stats.EndTime = *endTime
	}
	if firstEvent != nil {
		stats.FirstEvent = *firstEvent
	}
	if lastEvent != nil {
		stats.LastEvent = *lastEvent
	}

	return &stats, nil
}

// Close closes all storage connections
func (s *Storage) Close() {
	if s.redis != nil {
		s.redis.Close()
	}
	if s.db != nil {
		s.db.Close()
	}
}

// EventFilter represents query filters for events
type EventFilter struct {
	SessionID string
	EventType string
	Namespace string
	StartTime time.Time
	EndTime   time.Time
	Limit     int
}

// SessionStats holds statistics about a session
type SessionStats struct {
	SessionID  string    `json:"session_id"`
	Type       string    `json:"type"`
	Namespace  string    `json:"namespace"`
	PodName    string    `json:"pod_name"`
	Status     string    `json:"status"`
	StartTime  time.Time `json:"start_time"`
	EndTime    time.Time `json:"end_time,omitempty"`
	EventCount int64     `json:"event_count"`
	FirstEvent time.Time `json:"first_event,omitempty"`
	LastEvent  time.Time `json:"last_event,omitempty"`
}
