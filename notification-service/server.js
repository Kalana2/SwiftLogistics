const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const RabbitMQClient = require('../shared/utils/rabbitmq');
const { createLogger } = require('../shared/utils/logger');
const { EventTypes } = require('../shared/models/Event');

const app = express();
const server = http.createServer(app);
const logger = createLogger('notification-service');

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'notification-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: io.sockets.sockets.size
  });
});

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Store connected clients by customer ID
const connectedClients = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info('Client connected', {
    socketId: socket.id,
    address: socket.handshake.address
  });

  // Client registers with their customer ID
  socket.on('register', (data) => {
    const { customerId, userId, role } = data;
    
    socket.customerId = customerId || userId;
    socket.role = role;
    
    // Store connection
    if (!connectedClients.has(socket.customerId)) {
      connectedClients.set(socket.customerId, new Set());
    }
    connectedClients.get(socket.customerId).add(socket.id);

    logger.info('Client registered', {
      socketId: socket.id,
      customerId: socket.customerId,
      role: socket.role,
      totalClients: connectedClients.size
    });

    // Send confirmation
    socket.emit('registered', {
      success: true,
      message: 'Successfully registered for notifications',
      customerId: socket.customerId
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    logger.info('Client disconnected', {
      socketId: socket.id,
      customerId: socket.customerId
    });

    if (socket.customerId && connectedClients.has(socket.customerId)) {
      connectedClients.get(socket.customerId).delete(socket.id);
      
      if (connectedClients.get(socket.customerId).size === 0) {
        connectedClients.delete(socket.customerId);
      }
    }
  });

  // Handle subscription to specific order updates
  socket.on('subscribe:order', (orderId) => {
    socket.join(`order:${orderId}`);
    logger.info('Client subscribed to order', {
      socketId: socket.id,
      orderId
    });
  });

  socket.on('unsubscribe:order', (orderId) => {
    socket.leave(`order:${orderId}`);
    logger.info('Client unsubscribed from order', {
      socketId: socket.id,
      orderId
    });
  });
});

/**
 * Send notification to specific customer
 */
function notifyCustomer(customerId, notification) {
  const clientSockets = connectedClients.get(customerId);
  
  if (clientSockets && clientSockets.size > 0) {
    clientSockets.forEach(socketId => {
      io.to(socketId).emit('notification', notification);
    });

    logger.info('Notification sent to customer', {
      customerId,
      type: notification.type,
      socketCount: clientSockets.size
    });

    return true;
  }

  logger.debug('No connected clients for customer', { customerId });
  return false;
}

/**
 * Broadcast notification to specific order room
 */
function notifyOrder(orderId, notification) {
  io.to(`order:${orderId}`).emit('order:update', notification);
  
  logger.info('Order update broadcast', {
    orderId,
    status: notification.status
  });
}

/**
 * Broadcast to all drivers
 */
function notifyDrivers(notification) {
  io.emit('driver:notification', notification);
  
  logger.info('Broadcast to all drivers', {
    type: notification.type
  });
}

const PORT = process.env.PORT || 3005;

async function startService() {
  try {
    // Initialize RabbitMQ
    const rabbitMQ = new RabbitMQClient(process.env.RABBITMQ_URL);
    await rabbitMQ.connect();

    logger.info('Notification Service initialized, listening for events...');

    // Subscribe to notification queue
    await rabbitMQ.consume(
      rabbitMQ.queues.notifications,
      async (message) => {
        await processNotificationEvent(message);
      }
    );

    // Start HTTP/WebSocket server
    server.listen(PORT, () => {
      logger.info(`Notification Service running on port ${PORT}`);
      logger.info(`WebSocket server ready`);
    });

    app.locals.rabbitMQ = rabbitMQ;

  } catch (error) {
    logger.error('Failed to start Notification Service:', error);
    process.exit(1);
  }
}

/**
 * Process notification events from RabbitMQ
 */
async function processNotificationEvent(message) {
  const { type, payload } = message;

  logger.info('Processing notification event', {
    type,
    orderId: payload.orderId,
    customerId: payload.customerId
  });

  try {
    const notification = {
      id: `notif_${Date.now()}`,
      type: type,
      timestamp: new Date().toISOString(),
      ...payload
    };

    // Route notification based on type
    switch (type) {
      case EventTypes.NOTIFY_CLIENT:
        if (payload.customerId) {
          notifyCustomer(payload.customerId, notification);
        }
        if (payload.orderId) {
          notifyOrder(payload.orderId, notification);
        }
        break;

      case EventTypes.NOTIFY_DRIVER:
        notifyDrivers(notification);
        break;

      case EventTypes.ORDER_COMPLETED:
      case EventTypes.CMS_SUCCESS:
      case EventTypes.ROS_SUCCESS:
      case EventTypes.WMS_SUCCESS:
        if (payload.orderId) {
          notifyOrder(payload.orderId, notification);
        }
        break;

      case EventTypes.CMS_FAILURE:
      case EventTypes.ROS_FAILURE:
      case EventTypes.WMS_FAILURE:
      case EventTypes.ORDER_FAILED:
        if (payload.customerId) {
          notifyCustomer(payload.customerId, {
            ...notification,
            severity: 'error'
          });
        }
        break;

      default:
        logger.debug('Unhandled notification type', { type });
    }

  } catch (error) {
    logger.error('Error processing notification', {
      error: error.message,
      type: message.type
    });
  }
}

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down Notification Service...');
  
  io.close();
  
  if (app.locals.rabbitMQ) {
    await app.locals.rabbitMQ.close();
  }
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the service
startService();

module.exports = { app, io };
