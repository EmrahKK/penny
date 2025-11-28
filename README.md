# <img src="logo.svg" alt="PENNY Logo" width="48" height="48" align="center" /> PENNY

**P**owerful **E**BPF-based **N**etwork & System I**n**spection Manager for **Y**our Kubernetes

A modern, full-featured web interface for [Inspektor Gadget](https://github.com/inspektor-gadget/inspektor-gadget) that brings powerful eBPF-based observability tools to your Kubernetes clusters with real-time monitoring, historical analysis, and an intuitive user experience.

## Why PENNY?

PENNY transforms complex eBPF-based observability into an accessible, visual experience:

- 🎯 **No kubectl required** - Manage gadgets through an intuitive web interface
- 📊 **Real-time streaming** - Live event updates via WebSocket connections
- 📚 **Historical analysis** - Review past sessions with session replay
- 🔄 **Multiple sessions** - Run and monitor multiple gadgets simultaneously
- 🌓 **Modern UI** - Beautiful dark/light mode with responsive design
- 💾 **Data persistence** - Store and query historical events with TimescaleDB
- 🚀 **Production ready** - Scalable architecture with Redis for distributed sessions

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Browser                                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │           PENNY Web UI (React + TypeScript)                   │  │
│  │  • Gadget Catalog  • Active Sessions  • History & Replay     │  │
│  │  • Dark Mode       • Real-time Tables • Filtering            │  │
│  └───────────┬──────────────────────────────┬───────────────────┘  │
└──────────────┼──────────────────────────────┼──────────────────────┘
               │ REST API                     │ WebSocket
               │                              │
┌──────────────▼──────────────────────────────▼──────────────────────┐
│                    Frontend Service (Nginx)                          │
│              • Static assets serving                                 │
│              • API proxy to backend                                  │
└──────────────┬──────────────────────────────────────────────────────┘
               │ /api/* → backend:8080
               │
┌──────────────▼──────────────────────────────────────────────────────┐
│                    Backend Service (Go)                              │
│  ┌────────────────┬─────────────────┬──────────────────────────┐   │
│  │ HTTP Handlers  │ WebSocket Hub   │  Gadget Manager          │   │
│  │ • REST API     │ • Event Stream  │  • kubectl-gadget CLI    │   │
│  │ • CORS         │ • Fan-out       │  • Process Management    │   │
│  └────────┬───────┴────────┬────────┴──────────┬───────────────┘   │
│           │                │                    │                    │
│  ┌────────▼────────┬───────▼────────┬──────────▼───────────────┐   │
│  │ Session Store   │ Event Consumer │  Storage Layer           │   │
│  │ • In-memory     │ • Redis Stream │  • TimescaleDB Client    │   │
│  │ • Redis sync    │ • Event handler│  • Event persistence     │   │
│  └────────┬────────┴───────┬────────┴──────────┬───────────────┘   │
└───────────┼────────────────┼───────────────────┼───────────────────┘
            │                │                   │
    ┌───────▼────────┐  ┌───▼──────────┐  ┌────▼──────────────┐
    │     Redis      │  │ Redis Streams│  │   TimescaleDB     │
    │ • Session data │  │ • Events pub │  │ • Event history   │
    │ • Distributed  │  │ • Real-time  │  │ • Session logs    │
    │   state        │  │   distribution│  │ • Hypertables     │
    └────────────────┘  └──────────────┘  └───────────────────┘

                           │
              ┌────────────▼───────────────┐
              │  Kubernetes API Server     │
              │  • RBAC permissions        │
              │  • Pod/Node access         │
              └────────────┬───────────────┘
                           │
              ┌────────────▼───────────────┐
              │    Inspektor Gadget        │
              │    (DaemonSet)             │
              │  • eBPF programs           │
              │  • Kernel tracing          │
              │  • Network monitoring      │
              └────────────────────────────┘
```

## Components

### Frontend (React + TypeScript + Vite)
- **Technology**: Modern React 18 with TypeScript, Vite for fast builds
- **UI Framework**: Tailwind CSS with custom dark mode implementation
- **Icons**: Lucide React for consistent iconography
- **State Management**: React hooks and context for theme management
- **Routing**: Client-side navigation between gadget catalog, active sessions, and history
- **WebSocket Client**: Real-time event streaming from backend
- **Key Features**:
  - Gadget catalog with categorized view
  - Live session monitoring with multiple concurrent sessions
  - Historical session replay
  - Dark/light mode toggle with persistence
  - Responsive tables with search, filter, and sort
  - Summary views with aggregated statistics

### Backend (Go)
- **Technology**: Go 1.23 with gorilla/mux for routing
- **Architecture**: Multi-goroutine event processing with channels
- **Components**:
  - **Gadget Manager**: Spawns and manages kubectl-gadget processes
  - **WebSocket Hub**: Broadcasts events to connected clients
  - **Session Store**: Manages active gadget sessions with Redis sync
  - **Storage Layer**: Persists events to TimescaleDB
  - **Event Consumer**: Processes Redis streams for real-time distribution
- **Key Features**:
  - Process lifecycle management for gadgets
  - Output parsing for different gadget types (trace, snapshot)
  - CORS-enabled REST API
  - Health check endpoints
  - Graceful shutdown handling
  - Distributed session support for horizontal scaling

### Redis
- **Purpose**: Real-time event streaming and distributed session management
- **Configuration**:
  - Streams for event distribution
  - AOF persistence enabled
  - LRU eviction policy (256MB max memory)
- **Usage**:
  - Session state synchronization across backend replicas
  - Real-time event pub/sub for WebSocket clients
  - Temporary event buffering

### TimescaleDB (PostgreSQL)
- **Purpose**: Long-term storage and querying of historical gadget events
- **Schema**:
  - `gadget_events` - Hypertable partitioned by time
    - Stores all gadget output events
    - JSONB data for flexible event structure
    - Indexed by session_id, event_type, namespace
  - `gadget_sessions` - Session metadata
    - Session lifecycle tracking
    - Event count aggregation
- **Features**:
  - Automatic data retention policies
  - Compression for historical data
  - Efficient time-based queries
  - GIN indexes on JSONB data for fast searches

### Inspektor Gadget
- **Deployment**: DaemonSet running on all cluster nodes
- **Integration**: Accessed via kubectl-gadget CLI embedded in backend
- **Supported Gadgets**:
  - `trace_sni` - TLS SNI monitoring
  - `trace_tcp` - TCP connection tracing
  - `snapshot_process` - Process snapshots
  - `snapshot_socket` - Socket listings

## Data Flow

### Starting a Gadget Session

```
User clicks "Start Gadget"
         │
         ▼
Frontend sends POST /api/sessions
         │
         ▼
Backend creates session in SessionStore
         │
         ▼
Backend spawns kubectl-gadget process
         │
         ▼
kubectl-gadget starts eBPF program on nodes
         │
         ▼
Session ID returned to frontend
         │
         ▼
Frontend opens WebSocket connection
```

### Real-time Event Flow

```
eBPF program captures kernel event
         │
         ▼
Inspektor Gadget formats event
         │
         ▼
kubectl-gadget outputs JSON to stdout
         │
         ▼
Backend reads stdout, parses JSON
         │
         ├─────────────────┬──────────────────┐
         ▼                 ▼                  ▼
  WebSocket Hub     Redis Stream      TimescaleDB
   (immediate)      (distributed)     (persistent)
         │                 │                  │
         ▼                 ▼                  ▼
  Connected           Other Backend      Event history
   Clients              Instances         stored
```

### Session History & Replay

```
User opens History view
         │
         ▼
Frontend fetches GET /api/history
         │
         ▼
Backend queries TimescaleDB
         │
         ▼
Returns session list with metadata
         │
         ▼
User clicks on session to replay
         │
         ▼
Frontend fetches GET /api/history/{sessionId}
         │
         ▼
Backend retrieves all events for session
         │
         ▼
Frontend displays events in read-only mode
```

## Features

- **Modern Web UI**: React 18 + TypeScript with Vite for lightning-fast development
- **Real-time Streaming**: WebSocket-based live event streaming with automatic reconnection
- **Multiple Gadget Types**:
  - **Trace SNI**: Monitor TLS Server Name Indication (SNI) from HTTPS requests
  - **Trace TCP**: Track TCP connections, accepts, and failures with summary statistics
  - **Snapshot Process**: Capture current running processes across cluster
  - **Snapshot Socket**: List open network sockets with protocol and state
- **Session Management**:
  - Run multiple concurrent gadget sessions (no limits)
  - Switch between active sessions seamlessly
  - Session history with full replay capability
  - Session metadata tracking (start time, event count, status)
- **Advanced Filtering**:
  - Filter by namespace, pod name, container
  - Client-side search across all event fields
  - Sort by any column in table views
  - Custom TCP filters (all, accept-only, connect-only, failure-only)
- **Data Persistence**:
  - All events stored in TimescaleDB hypertables
  - Automatic time-based partitioning
  - Efficient JSONB queries for flexible event structure
- **Event Streaming**:
  - Redis Streams for reliable event distribution
  - Consumer group support for horizontal scaling
  - Automatic event fan-out to multiple clients
- **Active Sessions View**: Monitor all running gadgets with live event counts
- **Session Replay**: Review historical gadget outputs with original formatting
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices
- **Dark Mode**: System preference detection with manual toggle and localStorage persistence

## Prerequisites

- Kubernetes cluster (k3s, k3d, minikube, etc.)
- [Inspektor Gadget](https://www.inspektor-gadget.io/docs/latest/quick-start/) installed on the cluster (Tested with v0.46.0)
- Podman or Docker for building images
- kubectl configured to access your cluster

## Quick Start

### 1. Install Inspektor Gadget

If you haven't already installed Inspektor Gadget on your cluster:

```bash
kubectl gadget deploy
```

Verify the installation:

```bash
kubectl gadget version
```

### 2. Build Container Images

The build script automatically detects whether you're using Podman or Docker:

```bash
./build.sh
```

For k3s, import the images:

```bash
# Using Podman
podman save penny-backend:latest | sudo k3s ctr images import -
podman save penny-frontend:latest | sudo k3s ctr images import -

# Or using the Makefile
make import-k3s
```

For k3d:

```bash
k3d image import penny-backend:latest penny-frontend:latest -c mycluster
```

For minikube:

```bash
minikube image load penny-backend:latest
minikube image load penny-frontend:latest
```

### 3. Deploy to Kubernetes

```bash
./deploy.sh
```

### 4. Access the Application

**Option 1: Port Forward**

```bash
kubectl port-forward -n penny svc/frontend 3000:80
```

Then open http://localhost:3000

**Option 2: NodePort**

Access via NodePort (default: 30080):

```bash
# For k3s/k3d
http://localhost:30080

# For other clusters, get the node IP
kubectl get nodes -o wide
# Then access: http://<NODE_IP>:30080
```

**Option 3: Ingress (Optional)**

Deploy the Ingress resource:

```bash
kubectl apply -f k8s/ingress.yaml
```

Add to `/etc/hosts`:

```
127.0.0.1 penny.lima.local
```

Access: http://penny.lima.local

## Usage

### Starting a Gadget

1. Select a gadget from the catalog (Trace SNI, Trace TCP, Snapshot Process, or Snapshot Socket)
2. Configure filtering options (namespace, pod name, etc.)
3. Click "Start" to begin the gadget session
4. View real-time events streaming in the output panel

### Managing Sessions

- **Active Sessions View**: Click "Active Sessions" in the sidebar to see all running gadgets
- **Switch Sessions**: Click on any session card to view its live output
- **Stop Session**: Use the stop button on any session
- **Multiple Sessions**: Run multiple gadgets simultaneously

### Session History & Replay

- **History View**: Access historical sessions from the sidebar
- **Session Replay**: Click on any past session to replay its events
- **Search & Filter**: Find specific sessions by type, namespace, or time

### Example Workflows

**Monitor TLS Traffic:**
1. Start a "Trace SNI" gadget
2. Make HTTPS requests from your pods
3. See SNI data (domains, IPs, ports) in real-time

**Debug TCP Connections:**
1. Start a "Trace TCP" gadget
2. Filter by namespace if needed
3. View connection attempts, accepts, and failures
4. Switch to "Summary View" for aggregated statistics

**Inspect Running Processes:**
1. Start a "Snapshot Process" gadget
2. Get instant snapshot of all processes
3. Filter and sort by PID, command, namespace

**Analyze Network Sockets:**
1. Start a "Snapshot Socket" gadget
2. See all open TCP/UDP sockets
3. Filter by status (LISTEN, ESTABLISHED, etc.)

## Project Structure

```
.
├── backend/                           # Go backend service
│   ├── cmd/
│   │   └── server/
│   │       └── main.go               # Application entry point
│   ├── internal/
│   │   ├── gadget/
│   │   │   └── gadget.go            # kubectl-gadget process manager
│   │   ├── handler/
│   │   │   ├── handler.go           # HTTP REST handlers
│   │   │   └── websocket.go         # WebSocket hub and connections
│   │   ├── models/
│   │   │   └── models.go            # Data structures (Session, Event)
│   │   ├── sessionstore/
│   │   │   └── sessionstore.go      # Session state management + Redis sync
│   │   ├── storage/
│   │   │   └── storage.go           # TimescaleDB persistence layer
│   │   └── parser/
│   │       └── parser.go            # Gadget output parsing (JSON, text)
│   ├── Dockerfile                    # Multi-stage build (Alpine + kubectl-gadget)
│   ├── go.mod
│   └── go.sum
│
├── frontend/                          # React frontend
│   ├── public/
│   │   ├── logo.svg                  # PENNY logo
│   │   └── logo-with-text.svg        # Logo with text variant
│   ├── src/
│   │   ├── components/
│   │   │   ├── GadgetCard.tsx       # Catalog item component
│   │   │   ├── Runner.tsx           # Gadget execution view
│   │   │   ├── ActiveSessionsView.tsx
│   │   │   ├── HistoryView.tsx      # Session history browser
│   │   │   ├── SessionReplay.tsx    # Historical session viewer
│   │   │   ├── SessionPicker.tsx    # Multi-session selector
│   │   │   ├── ThemeToggle.tsx      # Dark mode toggle
│   │   │   ├── TraceSNITable.tsx    # SNI trace visualization
│   │   │   ├── TCPSummaryTable.tsx  # TCP aggregated stats
│   │   │   ├── ProcessSnapshotTable.tsx
│   │   │   └── SocketSnapshotTable.tsx
│   │   ├── contexts/
│   │   │   └── ThemeContext.tsx     # Theme state management
│   │   ├── services/
│   │   │   └── api.ts               # REST and WebSocket client
│   │   ├── types.ts                 # TypeScript interfaces
│   │   ├── App.tsx                  # Main application component
│   │   └── main.tsx                 # React entry point
│   ├── Dockerfile                    # Multi-stage (Node build + Nginx serve)
│   ├── nginx.conf                    # Nginx proxy configuration
│   ├── vite.config.ts               # Vite build configuration
│   ├── tailwind.config.js           # Tailwind CSS customization
│   ├── package.json
│   └── tsconfig.json
│
├── k8s/                               # Kubernetes manifests
│   ├── namespace.yaml                # penny namespace
│   ├── backend-rbac.yaml             # ServiceAccount + ClusterRole + Binding
│   ├── backend-deployment.yaml       # Backend + Service (ClusterIP)
│   ├── frontend-deployment.yaml      # Frontend + Service (NodePort 30080)
│   ├── redis-deployment.yaml         # Redis + PVC + ConfigMap
│   ├── timescaledb-deployment.yaml   # TimescaleDB + PVC + Init Job
│   └── ingress.yaml                  # Traefik ingress (optional)
│
├── demo/                              # Demo services for testing
│   ├── README.md
│   ├── deploy.sh
│   ├── Dockerfile
│   ├── app.py                        # Python Flask test services
│   └── *.yaml                        # Demo deployments (apples, oranges, bananas)
│
├── build.sh                           # Build and tag Docker images
├── push.sh                            # Push images to Docker Hub
├── deploy.sh                          # Deploy all K8s resources
├── logo.svg                           # PENNY logo (for README)
└── README.md                          # This file
```

## API Endpoints

### REST API

- `GET /api/gadgets` - List available gadgets
- `GET /api/sessions` - List active sessions
- `POST /api/sessions` - Start a new gadget session
- `DELETE /api/sessions/{sessionId}` - Stop a session
- `GET /api/history` - Get historical sessions
- `GET /api/history/{sessionId}` - Get specific session history
- `GET /health` - Health check

### WebSocket

- `WS /ws/{sessionId}` - Stream real-time gadget output for a session

## Container Runtime Notes

This project supports both **Podman** and **Docker**. The build script automatically detects which one is available on your system.

**Platform Support:** Images are built for **linux/amd64** by default, which is compatible with most Kubernetes clusters.

### Using Podman

Podman is a daemonless container engine that can run containers without root privileges:

```bash
# Build images (auto-detects ARM64 or AMD64)
./build.sh  # Automatically uses podman if available

# Import to k3s
make import-k3s

# Or manually
podman save penny-backend:latest | sudo k3s ctr images import -
podman save penny-frontend:latest | sudo k3s ctr images import -
```

**Note for Apple Silicon (M1/M2/M3):** The build script automatically detects ARM64 architecture and builds native images for better performance.

### Using Docker

If you prefer Docker, the scripts will automatically use it if Podman is not available:

```bash
# Build images (auto-detects platform)
./build.sh  # Automatically uses docker if podman not found

# Import to k3s
docker save penny-backend:latest | sudo k3s ctr images import -
docker save penny-frontend:latest | sudo k3s ctr images import -
```

## Development

### Backend Development

```bash
cd backend
go mod download
go run cmd/server/main.go
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at http://localhost:3000 with hot reload.

## Configuration

### Backend Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | HTTP server port | `8080` | No |
| `REDIS_ADDR` | Redis server address | `redis:6379` | Yes |
| `REDIS_PASSWORD` | Redis password | `` (empty) | No |
| `POSTGRES_URL` | PostgreSQL connection string | `postgres://gadget:password@timescaledb:5432/gadget_events` | Yes |

**Example PostgreSQL URL format:**
```
postgres://username:password@host:port/database?sslmode=disable
```

### Frontend Environment Variables

Create a `.env` file in the `frontend` directory for local development:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `VITE_API_URL` | Backend API base URL | `/api` | No |
| `VITE_WS_URL` | WebSocket URL | `window.location.host` | No |

**Note**: In production (Kubernetes), the frontend nginx proxies API requests to the backend, so these variables typically don't need to be changed.

### Deployment Considerations

#### Resource Requirements

Minimum recommended resources:
- **Backend**: 100m CPU, 128Mi RAM (request) / 500m CPU, 512Mi RAM (limit)
- **Frontend**: 50m CPU, 64Mi RAM (request) / 200m CPU, 256Mi RAM (limit)
- **Redis**: 100m CPU, 128Mi RAM (request) / 500m CPU, 512Mi RAM (limit)
- **TimescaleDB**: 200m CPU, 256Mi RAM (request) / 1000m CPU, 1Gi RAM (limit)

#### Horizontal Scaling

The backend supports horizontal scaling:

```bash
kubectl scale deployment backend -n penny --replicas=3
```

**Requirements for multi-replica deployment:**
- Redis must be accessible to all backend pods (already configured)
- Session state is synchronized via Redis
- WebSocket connections are load-balanced by the ingress/service
- Event consumers use Redis consumer groups to avoid duplicate processing

#### Persistent Storage

Both Redis and TimescaleDB require persistent volumes:
- **Redis**: 5Gi for session data and event streams
- **TimescaleDB**: 10Gi for historical event data (scales with retention period)

**Data Retention**: Configure TimescaleDB retention policies in the init job:
```sql
SELECT add_retention_policy('gadget_events', INTERVAL '30 days');
```

#### Security Considerations

1. **RBAC Permissions**: Backend requires cluster-level permissions to run kubectl-gadget
2. **Network Policies**: Consider restricting backend network access
3. **Secrets Management**: Store TimescaleDB credentials in Kubernetes Secrets (already configured)
4. **TLS/HTTPS**: Use ingress with TLS for production deployments
5. **Authentication**: Currently no authentication - add auth proxy if exposing publicly

## Troubleshooting

### Backend Shows 502 Bad Gateway Errors

**Symptom**: Frontend shows 502 errors, API requests fail

**Cause**: Backend failed to initialize connections to Redis or TimescaleDB (usually because backend started before these services were ready)

**Solution**:
```bash
# Restart the backend pod to reinitialize connections
kubectl delete pods -n penny -l app=penny-backend

# Verify backend logs show successful connections
kubectl logs -n penny -l app=penny-backend
# Should see: "Connected to Redis", "Connected to PostgreSQL", "Session store initialized"
```

### Pods Not Starting

**Symptom**: Pods stuck in `Pending`, `ContainerCreating`, or `CrashLoopBackOff`

**Diagnosis**:
```bash
# Check pod status and events
kubectl get pods -n penny
kubectl describe pod -n penny <pod-name>

# Check logs for errors
kubectl logs -n penny -l app=penny-backend
kubectl logs -n penny -l app=penny-frontend
kubectl logs -n penny -l app=redis
kubectl logs -n penny -l app=timescaledb
```

**Common issues**:
- **PVC not bound**: Check if persistent volumes are available
  ```bash
  kubectl get pvc -n penny
  ```
- **Image pull errors**: Verify images exist and are accessible
  ```bash
  kubectl describe pod -n penny <pod-name> | grep -A 10 Events
  ```
- **Resource constraints**: Check if cluster has enough resources
  ```bash
  kubectl top nodes
  ```

### kubectl-gadget Not Working

**Symptom**: Gadgets fail to start, or show "kubectl-gadget command not found"

**Diagnosis**:
```bash
# Verify Inspektor Gadget is installed
kubectl get pods -n gadget
kubectl gadget version

# Check if kubectl-gadget is available in backend
kubectl exec -n penny deployment/backend -- kubectl-gadget version
```

**Solution**:
```bash
# Install Inspektor Gadget if not present
kubectl gadget deploy

# Wait for daemonset to be ready
kubectl wait --for=condition=ready pod -l k8s-app=gadget -n gadget --timeout=300s
```

### Permission Errors

**Symptom**: Gadgets fail with "forbidden" or "unauthorized" errors

**Diagnosis**:
```bash
# Check if RBAC resources exist
kubectl get clusterrole penny-backend-role
kubectl get clusterrolebinding penny-backend-binding
kubectl get serviceaccount -n penny penny-backend

# Verify backend pod is using the correct service account
kubectl get pod -n penny -l app=penny-backend -o jsonpath='{.items[0].spec.serviceAccountName}'
```

**Solution**:
```bash
# Reapply RBAC configuration
kubectl apply -f k8s/backend-rbac.yaml
```

### WebSocket Connection Failed

**Symptom**: Events not streaming, "WebSocket connection error" in browser console

**Diagnosis**:
1. Check backend is running and healthy:
   ```bash
   kubectl get pods -n penny -l app=penny-backend
   kubectl exec -n penny deployment/backend -- wget -qO- http://localhost:8080/health
   ```

2. Check browser console for specific errors:
   - `Failed to connect to WebSocket`: Backend not reachable
   - `WebSocket closed with code 1006`: Network interruption
   - `404 Not Found`: Incorrect WebSocket URL

**Solution**:
- Verify API endpoint is accessible from browser
- Check if ingress/service is properly configured
- Ensure no network policies blocking WebSocket upgrades
- For ingress, ensure WebSocket headers are preserved:
  ```yaml
  nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
  nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
  ```

### TimescaleDB Init Job Fails

**Symptom**: `timescaledb-init` job shows errors or doesn't complete

**Diagnosis**:
```bash
kubectl logs -n penny job/timescaledb-init
```

**Common issues**:
- **Connection timeout**: TimescaleDB not ready yet
  ```bash
  # Check TimescaleDB pod status
  kubectl get pods -n penny -l app=timescaledb
  ```
- **Permission denied**: Check credentials in secret
  ```bash
  kubectl get secret -n penny timescaledb-secret -o yaml
  ```

**Solution**:
```bash
# Delete and recreate the job (it will retry)
kubectl delete job -n penny timescaledb-init
kubectl apply -f k8s/timescaledb-deployment.yaml
```

### Frontend Shows Blank Page

**Symptom**: Browser shows empty page, no UI visible

**Diagnosis**:
1. Check browser console for JavaScript errors
2. Verify frontend pod is running:
   ```bash
   kubectl get pods -n penny -l app=penny-frontend
   ```
3. Check if static assets are served:
   ```bash
   curl -I http://localhost:30080/
   curl -I http://localhost:30080/logo.svg
   ```

**Solution**:
- Rebuild frontend image with correct build output
- Check nginx configuration in `frontend/nginx.conf`
- Verify file permissions in the image (should be readable)

### Redis Connection Issues

**Symptom**: Backend logs show "failed to connect to Redis"

**Diagnosis**:
```bash
# Check Redis is running
kubectl get pods -n penny -l app=redis

# Test connection from backend
kubectl exec -n penny deployment/backend -- nc -zv redis 6379
```

**Solution**:
```bash
# Restart Redis if needed
kubectl delete pods -n penny -l app=redis

# Then restart backend to reconnect
kubectl delete pods -n penny -l app=penny-backend
```

### High Memory Usage

**Symptom**: Pods being OOMKilled or running out of memory

**Diagnosis**:
```bash
# Check current resource usage
kubectl top pods -n penny

# Check resource limits
kubectl describe pod -n penny <pod-name> | grep -A 10 "Limits\|Requests"
```

**Solution**:
- Increase memory limits in deployment YAML
- For TimescaleDB: Add retention policy to delete old data
- For Redis: Tune `maxmemory` and eviction policy
- Enable compression in TimescaleDB

## Clean Up

Remove the deployment:

```bash
kubectl delete namespace penny
# or using Makefile
make clean
```

Remove container images:

```bash
# Using Podman
podman rmi penny-backend:latest penny-frontend:latest

# Using Docker
docker rmi penny-backend:latest penny-frontend:latest
```

## Future Enhancements

### Gadget Support
- [ ] `trace_dns` - DNS query monitoring
- [ ] `trace_exec` - Process execution tracing
- [ ] `trace_open` - File open operations
- [ ] `top_block_io` - Block I/O statistics
- [ ] `top_tcp` - TCP traffic statistics
- [ ] `top_file` - File I/O by process
- [ ] `profile_cpu` - CPU profiling
- [ ] `profile_block_io` - I/O profiling

### Data Export & Integration
- [ ] Export sessions to JSON/CSV/PCAP formats
- [ ] Prometheus metrics integration
- [ ] Grafana dashboard templates
- [ ] Webhook notifications for events
- [ ] S3/Object storage backup for historical data

### User Experience
- [ ] Saved filter presets
- [ ] Custom dashboard layouts
- [ ] Event annotations and comments
- [ ] Session sharing via URL
- [ ] Keyboard shortcuts
- [ ] Advanced search with query language
- [ ] Event correlation across sessions

### Security & Access Control
- [ ] OAuth/OIDC authentication
- [ ] Role-based access control (RBAC)
- [ ] Namespace-level permissions
- [ ] Audit logging
- [ ] Session encryption
- [ ] API key management

### Platform Features
- [ ] Multi-cluster support with cluster selector
- [ ] Helm chart for easy deployment
- [ ] High availability configuration
- [ ] Backup and restore procedures
- [ ] Resource usage dashboard
- [ ] Cost monitoring and optimization

### Performance & Scalability
- [ ] Event sampling and rate limiting
- [ ] Automatic data archival to cold storage
- [ ] Query result caching
- [ ] Read replicas for TimescaleDB
- [ ] Redis cluster mode support

### Developer Experience
- [ ] REST API documentation (OpenAPI/Swagger)
- [ ] Client SDKs (Python, Go, JavaScript)
- [ ] Gadget plugin system
- [ ] Custom event parsers
- [ ] Webhook integration framework

### Monitoring & Observability
- [ ] Built-in performance monitoring
- [ ] Resource usage alerts
- [ ] Automatic error reporting
- [ ] Health check dashboard
- [ ] SLO/SLA tracking

### Completed Features ✅
- [x] Persistent storage for historical data (TimescaleDB)
- [x] Session replay functionality
- [x] Dark mode support
- [x] Multiple concurrent sessions
- [x] Real-time event streaming
- [x] Redis-based distributed sessions
- [x] Horizontal backend scaling
- [x] WebSocket event distribution
- [x] Advanced table filtering and search
- [x] Summary views for aggregated data

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Resources

- [Inspektor Gadget Documentation](https://www.inspektor-gadget.io/docs/)
- [eBPF Introduction](https://ebpf.io/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
