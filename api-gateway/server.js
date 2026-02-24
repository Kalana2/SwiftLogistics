const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const driverRoutes = require('./routes/driver');
const { createLogger } = require('../shared/utils/logger');

const app = express();
const logger = createLogger('api-gateway');

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));

// Rate limiting - Protection against DDoS attacks during peak times like Black Friday
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/driver', driverRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });

  res.status(err.status || 500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const { registry } = require('../shared/utils/service-registry');

const PORT = process.env.PORT || 3000;

// Service Discovery endpoint
app.get('/api/services', (req, res) => {
  res.json({
    success: true,
    services: registry.getAllServices(),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
  logger.info(`CORS enabled for: ${process.env.CORS_ORIGIN}`);

  // Register all known services in the registry
  registry.register('api-gateway', 'localhost', PORT);
  registry.register('orchestration-service', 'localhost', process.env.ORCHESTRATOR_PORT || 3001);
  registry.register('cms-adapter', 'localhost', 3002);
  registry.register('ros-adapter', 'localhost', 3003);
  registry.register('wms-adapter', 'localhost', 3004);
  registry.register('notification-service', 'localhost', 3005);
  registry.register('cms-mock', 'localhost', 4000);
  registry.register('wms-mock', 'localhost', 4001);

  // Start health check monitoring
  registry.startHealthChecks(10000);
  logger.info('Service discovery registry initialized with 8 services');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;
