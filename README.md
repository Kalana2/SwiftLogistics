# SwiftTrack - Event-Driven Middleware System

## High-Level System Architecture

An **Event-Driven, Service-Oriented Architecture (SOA)** that decouples modern front-end applications from legacy back-end systems using a robust Node.js middleware layer.

### Architecture Type
- **Asynchronous, Event-Driven Middleware**
- **Core Philosophy**: Non-blocking I/O for high-volume order processing

## Technology Stack

All components use **open-source technologies**:

- **Runtime**: Node.js (Event loop for async processing)
- **Web Framework**: Express.js (API Gateway & REST APIs)
- **Message Broker**: RabbitMQ (Publish-Subscribe pattern)
- **Database**: MongoDB (NoSQL document store for order state)
- **Real-Time Engine**: Socket.io (WebSocket connections)
- **Frontend**: React.js (Client UI & Driver Interface)

## System Components

### 1. API Gateway (Port: 3000)
- Single entry point for all external traffic
- JWT authentication
- Rate limiting for DDoS protection
- Routes requests to appropriate services

### 2. Orchestration Service (Port: 3001)
- Manages order lifecycle
- Ensures data consistency
- Publishes to RabbitMQ
- Non-blocking 202 Accepted responses

### 3. Integration Adapters

#### CMS Adapter (Port: 3002)
- SOAP consumer for legacy CMS
- Converts JSON to XML envelopes
- Handles inventory management

#### ROS Adapter (Port: 3003)
- REST client for route optimization
- Extracts address data
- Calculates optimal delivery routes

#### WMS Adapter (Port: 3004)
- TCP client for warehouse system
- Raw socket communication
- Binary/text-delimited protocols

### 4. Notification Service (Port: 3005)
- Real-time WebSocket broadcasting
- Listens to RabbitMQ events
- Instant UI updates

### 5. Mock Services

#### CMS Mock (Port: 4000)
- Simulates legacy SOAP service

#### WMS Mock (Port: 4001)
- Simulates warehouse TCP server

## Architecture Patterns

| Pattern | Usage | Rationale |
|---------|-------|-----------|
| API Gateway | Entry Point | Hides legacy protocol complexity |
| Publish-Subscribe | Core Communication | Decouples submission from processing |
| Adapter Pattern | Legacy Integration | Translates disparate protocols |
| Saga Pattern | Transaction Management | Manages distributed transactions |

## Security Features

1. **TLS/HTTPS**: Encrypted data in transit
2. **Input Sanitization**: JSON schema validation
3. **Network Isolation**: Private network for adapters
4. **JWT Authentication**: Token-based access control

## Data Flow: Order Submission

1. Client → POST /api/orders (JSON)
2. Gateway → JWT verification → Orchestrator
3. Orchestrator → MongoDB (PENDING) → 202 Accepted
4. Orchestrator → RabbitMQ publish
5. Adapters consume in parallel:
   - CMS Adapter → SOAP Request
   - ROS Adapter → REST Request
   - WMS Adapter → TCP Packet
6. Adapters → Completion events → RabbitMQ
7. Notification Service → Socket.io → Client UI

## Prerequisites

- Node.js v18+
- MongoDB v6+
- RabbitMQ v3.12+
- Docker (optional, for containerization)

## Quick Start

### 1. Install Dependencies

```bash
npm run install-all
```

### 2. Start RabbitMQ

```bash
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

### 3. Start MongoDB

```bash
docker run -d --name mongodb -p 27017:27017 mongo:6
```

### 4. Configure Environment

Copy `.env.example` to `.env` in each service directory and configure accordingly.

### 5. Start All Services

```bash
npm run start:all
```

Or start services individually:

```bash
npm run dev:gateway
npm run dev:orchestrator
npm run dev:cms-adapter
npm run dev:ros-adapter
npm run dev:wms-adapter
npm run dev:notification
npm run dev:cms-mock
npm run dev:wms-mock
npm run dev:client
```

## Service Ports

| Service | Port |
|---------|------|
| API Gateway | 3000 |
| Orchestration Service | 3001 |
| CMS Adapter | 3002 |
| ROS Adapter | 3003 |
| WMS Adapter | 3004 |
| Notification Service | 3005 |
| CMS Mock (SOAP) | 4000 |
| WMS Mock (TCP) | 4001 |
| Client UI | 5173 |
| RabbitMQ Management | 15672 |
| MongoDB | 27017 |

## API Endpoints

### API Gateway

- `POST /api/orders` - Submit new order
- `GET /api/orders/:id` - Get order status
- `POST /api/auth/login` - Authenticate user
- `GET /api/driver/manifest` - Get driver delivery manifest

## Testing

### Submit an Order

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "customerId": "CUST123",
    "items": [
      {
        "sku": "PROD001",
        "quantity": 2,
        "price": 29.99
      }
    ],
    "deliveryAddress": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zip": "10001"
    }
  }'
```

## Monitoring

- RabbitMQ Management UI: http://localhost:15672 (guest/guest)
- Check service health endpoints: `GET /health` on each service

## Project Structure

```
Swift/
├── api-gateway/              # API Gateway service
├── orchestration-service/    # Order orchestrator
├── cms-adapter/              # CMS SOAP adapter
├── ros-adapter/              # ROS REST adapter
├── wms-adapter/              # WMS TCP adapter
├── notification-service/     # WebSocket notification service
├── client-ui/                # React client application
├── mock-services/
│   ├── cms-mock/            # Mock SOAP CMS
│   └── wms-mock/            # Mock TCP WMS
├── shared/
│   ├── models/              # Shared data models
│   └── utils/               # Shared utilities
└── config/                  # Configuration files
```

## Contributing

This is an academic prototype demonstrating event-driven architecture patterns for legacy system integration.

## License

MIT
