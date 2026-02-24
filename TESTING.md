# SwiftTrack Testing Guide

## Quick Test Scenarios

### 1. Complete Order Flow Test

This test demonstrates the full end-to-end order processing through all adapters.

#### Prerequisites
- All services running (use `npm run start:all`)
- MongoDB and RabbitMQ running

#### Step 1: Authenticate and Get Token

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "client@swifttrack.com",
    "password": "client123"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user_001",
    "username": "client@swifttrack.com",
    "role": "client"
  }
}
```

Save the token for subsequent requests.

#### Step 2: Submit Order

```bash
TOKEN="your_token_here"

curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "items": [
      {
        "sku": "PROD001",
        "name": "Laptop",
        "quantity": 2,
        "price": 999.99,
        "weight": 3
      },
      {
        "sku": "PROD002",
        "name": "Mouse",
        "quantity": 5,
        "price": 29.99,
        "weight": 0.2
      }
    ],
    "deliveryAddress": {
      "street": "123 Main Street",
      "city": "New York",
      "state": "NY",
      "zip": "10001"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Order received and is being processed",
  "orderId": "ORD_1737744000000_abc12345",
  "status": "PENDING",
  "estimatedProcessingTime": "2-5 minutes"
}
```

#### Step 3: Track Order Status

```bash
ORDER_ID="ORD_1737744000000_abc12345"

curl -X GET http://localhost:3000/api/orders/$ORDER_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Status Progression:**
1. `RECEIVED` - Order received
2. `PENDING` - Queued for processing
3. `PROCESSING` - Being processed by adapters
4. `CMS_CONFIRMED` - Inventory confirmed
5. `ROUTE_CALCULATED` - Route optimized
6. `WMS_ASSIGNED` - Warehouse and driver assigned
7. `PROCESSED` - Ready for pickup
8. `IN_TRANSIT` - Out for delivery
9. `DELIVERED` - Completed

#### Step 4: View All Orders

```bash
curl -X GET http://localhost:3000/api/orders \
  -H "Authorization: Bearer $TOKEN"
```

### 2. Driver Workflow Test

#### Step 1: Driver Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "driver@swifttrack.com",
    "password": "driver123"
  }'
```

#### Step 2: Get Delivery Manifest

```bash
DRIVER_TOKEN="driver_token_here"

curl -X GET http://localhost:3000/api/driver/manifest \
  -H "Authorization: Bearer $DRIVER_TOKEN"
```

#### Step 3: Update Delivery Status

```bash
curl -X POST http://localhost:3000/api/driver/delivery/$ORDER_ID/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -d '{
    "status": "IN_TRANSIT",
    "location": {
      "lat": 40.7128,
      "lng": -74.0060
    },
    "notes": "Package picked up from warehouse"
  }'
```

### 3. Service Health Checks

```bash
# API Gateway
curl http://localhost:3000/health

# Orchestration Service
curl http://localhost:3001/health

# CMS Adapter
curl http://localhost:3002/health

# ROS Adapter
curl http://localhost:3003/health

# WMS Adapter
curl http://localhost:3004/health

# Notification Service
curl http://localhost:3005/health

# CMS Mock
curl http://localhost:4000/health

# CMS Mock Inventory
curl http://localhost:4000/inventory
```

### 4. Test Out-of-Stock Scenario

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "items": [
      {
        "sku": "PROD004",
        "name": "Out of Stock Item",
        "quantity": 1,
        "price": 99.99
      }
    ],
    "deliveryAddress": {
      "street": "456 Test Ave",
      "city": "Boston",
      "state": "MA",
      "zip": "02101"
    }
  }'
```

**Expected:** Order should fail with status `FAILED` and reason "Inventory unavailable"

### 5. Load Testing

Test high-volume order submission:

```bash
#!/bin/bash
# Submit 100 orders in parallel

for i in {1..100}; do
  curl -X POST http://localhost:3000/api/orders \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"items\": [{
        \"sku\": \"PROD001\",
        \"quantity\": 1,
        \"price\": 99.99
      }],
      \"deliveryAddress\": {
        \"street\": \"$i Test St\",
        \"city\": \"New York\",
        \"state\": \"NY\",
        \"zip\": \"10001\"
      }
    }" &
done

wait
echo "Load test complete"
```

### 6. Monitoring

#### RabbitMQ Management UI
```
http://localhost:15672
Username: guest
Password: guest
```

Check:
- Queue depths
- Message rates
- Consumer activity

#### MongoDB
```bash
mongosh mongodb://localhost:27017/swifttrack

# View orders
db.orders.find().pretty()

# Count by status
db.orders.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } }
])

# Recent orders
db.orders.find().sort({ createdAt: -1 }).limit(10).pretty()
```

### 7. WebSocket Testing (Real-time Notifications)

Use browser console or a WebSocket client:

```javascript
// Connect to notification service
const socket = io('http://localhost:3005');

// Register for notifications
socket.emit('register', {
  customerId: 'CUST001',
  role: 'client'
});

// Listen for notifications
socket.on('notification', (notification) => {
  console.log('Received notification:', notification);
});

// Subscribe to specific order
socket.emit('subscribe:order', 'ORD_1737744000000_abc12345');

// Listen for order updates
socket.on('order:update', (update) => {
  console.log('Order update:', update);
});
```

## Expected System Behavior

### Successful Order Flow

1. **API Gateway** receives request, validates JWT, forwards to Orchestrator
2. **Orchestrator** saves to MongoDB (status: RECEIVED), publishes to RabbitMQ
3. **CMS Adapter** consumes message, checks inventory via SOAP, confirms order
4. **ROS Adapter** consumes message, calculates route (mock or real API)
5. **WMS Adapter** consumes message, assigns warehouse and driver via TCP
6. **Notification Service** broadcasts updates to connected WebSocket clients
7. Order status progresses: RECEIVED → PENDING → CMS_CONFIRMED → ROUTE_CALCULATED → WMS_ASSIGNED → PROCESSED

### Timing

- **Order submission**: < 100ms (202 Accepted response)
- **Full processing**: 2-5 seconds (all adapters in parallel)
- **Notification latency**: < 100ms (real-time via WebSocket)

## Troubleshooting

### Orders stuck in PENDING
- Check RabbitMQ queues for messages
- Verify adapters are running and consuming
- Check adapter logs for errors

### CMS failures
- Verify CMS Mock is running on port 4000
- Check inventory availability: `curl http://localhost:4000/inventory`
- Review CMS adapter logs

### WMS failures
- Verify WMS Mock TCP server is running on port 4001
- Check if drivers are available
- Review WMS adapter logs

### No notifications received
- Verify Notification Service is running on port 3005
- Check WebSocket connection
- Verify RabbitMQ event exchange bindings
