# Build stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy go.mod first
COPY go.mod ./

# Copy go.sum if it exists, otherwise create empty
COPY go.sum* ./

# Copy the rest of the source code
COPY . .

# Run go mod tidy to update dependencies
RUN go mod tidy

# Download dependencies separately (this helps with cross-platform builds)
RUN go mod download && go mod verify

# Build the application (TARGETARCH is automatically set by Docker/Podman)
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH:-amd64} go build -o server ./cmd/server

# Runtime stage
FROM alpine:latest

# TARGETARCH is automatically set by Docker/Podman based on --platform
ARG TARGETARCH

# Install kubectl-gadget for the correct architecture
RUN apk add --no-cache ca-certificates curl tar && \
    if [ "$TARGETARCH" = "arm64" ]; then \
        GADGET_ARCH="arm64"; \
    else \
        GADGET_ARCH="amd64"; \
    fi && \
    GADGET_VERSION=$(curl -s https://api.github.com/repos/inspektor-gadget/inspektor-gadget/releases/latest | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/') && \
    curl -sL https://github.com/inspektor-gadget/inspektor-gadget/releases/download/${GADGET_VERSION}/kubectl-gadget-linux-${GADGET_ARCH}-${GADGET_VERSION}.tar.gz -o /tmp/kubectl-gadget.tar.gz && \
    tar -xzf /tmp/kubectl-gadget.tar.gz -C /tmp && \
    mv /tmp/kubectl-gadget /usr/local/bin/kubectl-gadget && \
    chmod +x /usr/local/bin/kubectl-gadget && \
    rm -f /tmp/kubectl-gadget.tar.gz

# Install kubectl for the correct architecture
RUN if [ "$TARGETARCH" = "arm64" ]; then \
        KUBECTL_ARCH="arm64"; \
    else \
        KUBECTL_ARCH="amd64"; \
    fi && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/${KUBECTL_ARCH}/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/

WORKDIR /root/

# Copy the binary from builder
COPY --from=builder /app/server .

# Expose port
EXPOSE 8080

# Run the application
CMD ["./server"]
