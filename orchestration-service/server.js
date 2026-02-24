const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const RabbitMQClient = require('../shared/utils/rabbitmq');
const { createLogger } = require('../shared/utils/logger');
const orderRoutes = require('./routes/orders');

const app = express();
const logger = createLogger('orchestration-service');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'orchestration-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Routes
app.use('/api/orchestrator', orderRoutes);

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack
  });
  
  res.status(err.status || 500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/swifttrack';

// Initialize services
async function startServer() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    logger.info('MongoDB connected successfully');

    // Connect to RabbitMQ
    const rabbitMQ = new RabbitMQClient(process.env.RABBITMQ_URL);
    await rabbitMQ.connect();
    
    // Make RabbitMQ client available to routes
    app.locals.rabbitMQ = rabbitMQ;

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`Orchestration Service running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down gracefully...');
  
  try {
    if (app.locals.rabbitMQ) {
      await app.locals.rabbitMQ.close();
    }
    await mongoose.connection.close();
    logger.info('All connections closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the server
startServer();

module.exports = app;
