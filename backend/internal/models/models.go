package models

import "time"

// GadgetType represents the type of gadget
type GadgetType string

const (
	GadgetTraceSNI       GadgetType = "trace_sni"
	GadgetTraceTCP       GadgetType = "trace_tcp"
	GadgetSnapshotProc   GadgetType = "snapshot_process"
	GadgetSnapshotSocket GadgetType = "snapshot_socket"
)

// GadgetRequest represents a request to run a gadget
type GadgetRequest struct {
	Type      GadgetType             `json:"type"`
	Namespace string                 `json:"namespace,omitempty"`
	PodName   string                 `json:"podName,omitempty"`
	Container string                 `json:"container,omitempty"`
	Params    map[string]interface{} `json:"params,omitempty"`
	// TCP trace specific flags
	AcceptOnly  bool `json:"acceptOnly,omitempty"`
	ConnectOnly bool `json:"connectOnly,omitempty"`
	FailureOnly bool `json:"failureOnly,omitempty"`
}

// GadgetSession represents an active gadget session
type GadgetSession struct {
	ID          string        `json:"id"`
	Type        GadgetType    `json:"type"`
	Namespace   string        `json:"namespace"`
	PodName     string        `json:"podName,omitempty"`
	StartTime   time.Time     `json:"startTime"`
	Status      string        `json:"status"` // "running", "stopped", "error"
	Timeout     time.Duration `json:"timeout,omitempty"`
	AcceptOnly  bool          `json:"acceptOnly,omitempty"`
	ConnectOnly bool          `json:"connectOnly,omitempty"`
	FailureOnly bool          `json:"failureOnly,omitempty"`
}

// GadgetOutput represents output from a gadget
type GadgetOutput struct {
	SessionID string                 `json:"sessionId"`
	Timestamp time.Time              `json:"timestamp"`
	Data      map[string]interface{} `json:"data"`
	EventType string                 `json:"eventType"`
}

// TraceSNIEvent represents a trace SNI event
type TraceSNIEvent struct {
	Timestamp string `json:"timestamp"`
	Node      string `json:"node"`
	Namespace string `json:"namespace"`
	Pod       string `json:"pod"`
	Container string `json:"container"`
	Comm      string `json:"comm"`
	PID       int32  `json:"pid"`
	UID       int32  `json:"uid"`
	GID       int32  `json:"gid"`
	Name      string `json:"name"` // SNI server name
}

// TraceTCPEvent represents a trace tcp event
type TraceTCPEvent struct {
	Timestamp string `json:"timestamp"`
	Node      string `json:"node"`
	Namespace string `json:"namespace"`
	Pod       string `json:"pod"`
	Container string `json:"container"`
	Comm      string `json:"comm"`
	PID       int32  `json:"pid"`
	SrcIP     string `json:"srcIp"`
	DstIP     string `json:"dstIp"`
	SrcPort   uint16 `json:"srcPort"`
	DstPort   uint16 `json:"dstPort"`
	Type      string `json:"type"` // "connect", "accept", "close"
}

// SnapshotProcess represents a process snapshot
type SnapshotProcess struct {
	Node      string `json:"node"`
	Namespace string `json:"namespace"`
	Pod       string `json:"pod"`
	Container string `json:"container"`
	Comm      string `json:"comm"`
	PID       int32  `json:"pid"`
	TID       int32  `json:"tid"`
	UID       int32  `json:"uid"`
	GID       int32  `json:"gid"`
}

// SnapshotSocket represents a socket snapshot
type SnapshotSocket struct {
	Node      string `json:"node"`
	Namespace string `json:"namespace"`
	Pod       string `json:"pod"`
	Container string `json:"container"`
	Protocol  string `json:"protocol"`
	LocalAddr string `json:"localAddr"`
	LocalPort uint16 `json:"localPort"`
	RemoteAddr string `json:"remoteAddr"`
	RemotePort uint16 `json:"remotePort"`
	Status    string `json:"status"`
	Inode     uint64 `json:"inode"`
	UID       uint32 `json:"uid"`
}
