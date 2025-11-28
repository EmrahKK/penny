package gadget

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"
	"time"

	"inspector-gadget-management/backend/internal/models"
)

// Client manages gadget operations
type Client struct {
	mu       sync.RWMutex
	sessions map[string]*Session
}

// Session represents an active gadget session
type Session struct {
	ID          string
	Type        models.GadgetType
	Namespace   string
	PodName     string
	Cmd         *exec.Cmd
	Cancel      context.CancelFunc
	OutputCh    chan models.GadgetOutput
	ErrorCh     chan error
	Status      string
	StartTime   time.Time
	Timeout     time.Duration
	// TCP trace specific options
	AcceptOnly  bool
	ConnectOnly bool
	FailureOnly bool
}

// NewClient creates a new gadget client
func NewClient() *Client {
	return &Client{
		sessions: make(map[string]*Session),
	}
}

// RunGadget starts a new gadget session
func (c *Client) RunGadget(ctx context.Context, req models.GadgetRequest, sessionID string) (*Session, error) {
	cmdCtx, cancel := context.WithCancel(ctx)

	var args []string
	switch req.Type {
	case models.GadgetTraceSNI:
		args = []string{"run", "trace_sni:latest"}
		if req.Namespace != "" {
			args = append(args, "-n", req.Namespace)
		} else {
			// When no namespace is specified, trace all namespaces
			args = append(args, "-A")
		}
		if req.PodName != "" {
			args = append(args, "--podname", req.PodName)
		}
		args = append(args, "-o", "json")

	case models.GadgetTraceTCP:
		args = []string{"run", "trace_tcp:latest"}
		if req.Namespace != "" {
			args = append(args, "-n", req.Namespace)
		} else {
			// When no namespace is specified, trace all namespaces
			args = append(args, "-A")
		}
		if req.PodName != "" {
			args = append(args, "--podname", req.PodName)
		}
		// Add TCP trace flags
		if req.AcceptOnly {
			args = append(args, "--accept-only")
		}
		if req.ConnectOnly {
			args = append(args, "--connect-only")
		}
		if req.FailureOnly {
			args = append(args, "--failure-only")
		}
		args = append(args, "-o", "json")

	case models.GadgetSnapshotProc:
		args = []string{"run", "snapshot_process:latest"}
		if req.Namespace != "" {
			args = append(args, "-n", req.Namespace)
		} else {
			// When no namespace is specified, trace all namespaces
			args = append(args, "-A")
		}
		if req.PodName != "" {
			args = append(args, "--podname", req.PodName)
		}
		args = append(args, "-o", "json")

	case models.GadgetSnapshotSocket:
		args = []string{"run", "snapshot_socket:latest"}
		if req.Namespace != "" {
			args = append(args, "-n", req.Namespace)
		} else {
			// When no namespace is specified, trace all namespaces
			args = append(args, "-A")
		}
		if req.PodName != "" {
			args = append(args, "--podname", req.PodName)
		}
		args = append(args, "-o", "json")

	default:
		cancel()
		return nil, fmt.Errorf("unsupported gadget type: %s", req.Type)
	}

	cmd := exec.CommandContext(cmdCtx, "kubectl-gadget", args...)

	session := &Session{
		ID:          sessionID,
		Type:        req.Type,
		Namespace:   req.Namespace,
		PodName:     req.PodName,
		Cmd:         cmd,
		Cancel:      cancel,
		OutputCh:    make(chan models.GadgetOutput, 100),
		ErrorCh:     make(chan error, 10),
		Status:      "running",
		StartTime:   time.Now(),
		Timeout:     30 * time.Minute, // Default 30 minute timeout
		AcceptOnly:  req.AcceptOnly,
		ConnectOnly: req.ConnectOnly,
		FailureOnly: req.FailureOnly,
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("failed to get stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		cancel()
		return nil, fmt.Errorf("failed to start gadget: %w", err)
	}

	// Log command start
	fmt.Printf("Started gadget: kubectl-gadget %v\n", args)

	c.mu.Lock()
	c.sessions[sessionID] = session
	c.mu.Unlock()

	// Handle stdout
	go c.handleOutput(session, stdout)

	// Handle stderr
	go c.handleErrors(session, stderr)

	// Start timeout timer
	go func() {
		timer := time.NewTimer(session.Timeout)
		defer timer.Stop()

		select {
		case <-timer.C:
			// Timeout reached, stop the gadget
			fmt.Printf("Gadget session %s timed out after %v, stopping...\n", sessionID, session.Timeout)
			c.StopGadget(sessionID)
		case <-cmdCtx.Done():
			// Context cancelled before timeout
			return
		}
	}()

	// Wait for command completion
	go func() {
		err := cmd.Wait()
		if err != nil && cmdCtx.Err() == nil {
			fmt.Printf("Gadget exited with error: %v\n", err)
			session.ErrorCh <- fmt.Errorf("gadget exited with error: %w", err)
		} else if cmdCtx.Err() != nil {
			if cmdCtx.Err() == context.DeadlineExceeded {
				fmt.Printf("Gadget session %s timed out\n", sessionID)
			} else {
				fmt.Printf("Gadget cancelled: %v\n", cmdCtx.Err())
			}
		} else {
			fmt.Printf("Gadget exited normally\n")
		}
		session.Status = "stopped"
		close(session.OutputCh)
		close(session.ErrorCh)
	}()

	return session, nil
}

// handleOutput processes gadget output
func (c *Client) handleOutput(session *Session, reader io.Reader) {
	// Snapshot gadgets return a JSON array, trace gadgets return JSON objects
	if session.Type == models.GadgetSnapshotProc || session.Type == models.GadgetSnapshotSocket {
		c.handleSnapshotOutput(session, reader)
	} else {
		c.handleStreamingOutput(session, reader)
	}
}

// handleStreamingOutput processes streaming gadget output (trace gadgets)
func (c *Client) handleStreamingOutput(session *Session, reader io.Reader) {
	decoder := json.NewDecoder(reader)

	for {
		var rawData map[string]interface{}
		if err := decoder.Decode(&rawData); err != nil {
			if err != io.EOF {
				session.ErrorCh <- fmt.Errorf("failed to decode output: %w", err)
			}
			return
		}

		output := models.GadgetOutput{
			SessionID: session.ID,
			Timestamp: time.Now(),
			Data:      rawData,
			EventType: string(session.Type),
		}

		select {
		case session.OutputCh <- output:
		default:
			// Channel full, skip event
		}
	}
}

// handleSnapshotOutput processes snapshot gadget output (array of items)
func (c *Client) handleSnapshotOutput(session *Session, reader io.Reader) {
	decoder := json.NewDecoder(reader)

	var rawArray []map[string]interface{}
	if err := decoder.Decode(&rawArray); err != nil {
		if err != io.EOF {
			session.ErrorCh <- fmt.Errorf("failed to decode snapshot output: %w", err)
		}
		return
	}

	// Send each item in the array as a separate output
	for _, rawData := range rawArray {
		output := models.GadgetOutput{
			SessionID: session.ID,
			Timestamp: time.Now(),
			Data:      rawData,
			EventType: string(session.Type),
		}

		select {
		case session.OutputCh <- output:
		default:
			// Channel full, skip event
		}
	}

	fmt.Printf("Snapshot gadget returned %d items\n", len(rawArray))
}

// handleErrors processes gadget errors
func (c *Client) handleErrors(session *Session, reader io.Reader) {
	buf := make([]byte, 4096)
	for {
		n, err := reader.Read(buf)
		if n > 0 {
			errMsg := strings.TrimSpace(string(buf[:n]))
			if errMsg != "" {
				fmt.Printf("Gadget stderr: %s\n", errMsg)
				session.ErrorCh <- fmt.Errorf("gadget error: %s", errMsg)
			}
		}
		if err != nil {
			if err != io.EOF {
				fmt.Printf("Error reading stderr: %v\n", err)
			}
			return
		}
	}
}

// StopGadget stops a running gadget session
func (c *Client) StopGadget(sessionID string) error {
	c.mu.Lock()
	session, exists := c.sessions[sessionID]
	if !exists {
		c.mu.Unlock()
		return fmt.Errorf("session not found: %s", sessionID)
	}
	delete(c.sessions, sessionID)
	c.mu.Unlock()

	session.Cancel()
	session.Status = "stopped"

	return nil
}

// GetSession retrieves a session by ID
func (c *Client) GetSession(sessionID string) (*Session, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	session, exists := c.sessions[sessionID]
	return session, exists
}

// ListSessions returns all active sessions
func (c *Client) ListSessions() []models.GadgetSession {
	c.mu.RLock()
	defer c.mu.RUnlock()

	sessions := make([]models.GadgetSession, 0, len(c.sessions))
	for _, s := range c.sessions {
		sessions = append(sessions, models.GadgetSession{
			ID:          s.ID,
			Type:        s.Type,
			Namespace:   s.Namespace,
			PodName:     s.PodName,
			StartTime:   s.StartTime,
			Status:      s.Status,
			Timeout:     s.Timeout,
			AcceptOnly:  s.AcceptOnly,
			ConnectOnly: s.ConnectOnly,
			FailureOnly: s.FailureOnly,
		})
	}
	return sessions
}
