# Demo Services for TCP Flow Visualization

Bu klasör, PENNY arayüzünde TCP flow haritasını test etmek için 3 demo servis içerir.

## Servisler

### 1. **Apples** (Deployment - 2 replicas)
- Port: 8080
- Çağrılar:
  - `oranges` servisini her 60 saniyede bir çağırır
  - `bananas` servisini her 120 saniyede bir çağırır

### 2. **Oranges** (Deployment - 2 replicas)
- Port: 8080
- Çağrılar:
  - `bananas` servisini her 60 saniyede bir çağırır

### 3. **Bananas** (StatefulSet - 2 replicas)
- Port: 8080
- Çağrılar:
  - `apples` servisini her 180 saniyede bir (3 dakika) çağırır

## Traffic Flow

```
    apples -----(60s)-----> oranges
      |                        |
      |                      (60s)
      |                        |
    (120s)                     v
      |                     bananas
      |                        |
      +--------(180s)---------+
```

## Deployment

### 1. Otomatik Deploy

```bash
cd demo
./deploy.sh
```

### 2. Manuel Deploy

```bash
# Docker image oluştur
podman build --platform linux/arm64 -t demo-service:latest .

# k3s'e import et
podman save demo-service:latest | sudo k3s ctr images import -

# Namespace oluştur
kubectl apply -f namespace.yaml

# Servisleri deploy et
kubectl apply -f apples.yaml
kubectl apply -f oranges.yaml
kubectl apply -f bananas.yaml
```

## Kullanım

### Pod'ları Görüntüle
```bash
kubectl get pods -n demo
```

### Logları İzle
```bash
# Apples logları
kubectl logs -n demo -l app=apples -f

# Oranges logları
kubectl logs -n demo -l app=oranges -f

# Bananas logları
kubectl logs -n demo -l app=bananas -f
```

### TCP Trace Başlat

PENNY arayüzünde:
1. "Trace TCP" gadget'ını seçin
2. Namespace: `demo` seçin
3. "Start" butonuna tıklayın
4. "Summary View" görünümüne geçerek TCP bağlantılarını görselleştirin

### Servislere Erişim

```bash
# Apples servisini çağır
kubectl exec -n demo deployment/apples -- curl http://apples:8080

# Oranges servisini çağır
kubectl exec -n demo deployment/oranges -- curl http://oranges:8080

# Bananas servisini çağır
kubectl exec -n demo statefulset/bananas -- curl http://bananas:8080
```

## Temizlik

```bash
kubectl delete namespace demo
```

## Özellikler

- ✅ Her container'da `curl` komutu mevcut
- ✅ HTTP request yapabilir ve alabilir
- ✅ Basit Python Flask servisi
- ✅ Health check endpoint'leri (`/health`)
- ✅ Liveness ve Readiness probe'ları
- ✅ Periyodik HTTP çağrıları (background thread'ler)
