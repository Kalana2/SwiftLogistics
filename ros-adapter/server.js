const express = require('express');
const axios = require('axios');
require('dotenv').config();

const RabbitMQClient = require('../shared/utils/rabbitmq');
const { createLogger } = require('../shared/utils/logger');
const { EventTypes } = require('../shared/models/Event');

const app = express();
const logger = createLogger('ros-adapter');

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ros-adapter',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3003;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3001';
const ROS_API_URL = process.env.ROS_API_URL;
const ROS_API_KEY = process.env.ROS_API_KEY;

// Warehouse location (mock)
const WAREHOUSE_LOCATION = {
  lat: 40.7128,
  lng: -74.0060,
  address: '100 Warehouse Blvd, New York, NY 10001'
};

/**
 * Calculate optimized route using REST API (or mock)
 */
async function calculateRoute(deliveryAddress) {
  try {
    // If no API configured, use mock route calculation
    if (!ROS_API_URL || !ROS_API_KEY) {
      logger.info('Using mock route calculation');
      return calculateMockRoute(deliveryAddress);
    }

    // Use real routing API (e.g., Mapbox, Google Maps)
    logger.info('Calculating route using external API', {
      from: WAREHOUSE_LOCATION.address,
      to: deliveryAddress
    });

    // Example: Mapbox Directions API
    const origin = `${WAREHOUSE_LOCATION.lng},${WAREHOUSE_LOCATION.lat}`;
    const destination = await geocodeAddress(deliveryAddress);
    const destinationCoords = `${destination.lng},${destination.lat}`;

    const response = await axios.get(
      `${ROS_API_URL}/mapbox/driving/${origin};${destinationCoords}`,
      {
        params: {
          access_token: ROS_API_KEY,
          geometries: 'geojson',
          overview: 'full'
        },
        timeout: 10000
      }
    );

    const route = response.data.routes[0];

    return {
      routeId: `ROUTE_${Date.now()}`,
      distance: route.distance, // meters
      duration: route.duration, // seconds
      geometry: route.geometry,
      waypoints: [
        WAREHOUSE_LOCATION,
        destination
      ],
      estimatedArrival: new Date(Date.now() + route.duration * 1000).toISOString()
    };

  } catch (error) {
    logger.error('Route calculation failed, using fallback', {
      error: error.message
    });
    
    // Fallback to mock calculation
    return calculateMockRoute(deliveryAddress);
  }
}

/**
 * Mock route calculation (when no API available)
 */
function calculateMockRoute(deliveryAddress) {
  // Simulate route calculation
  const distance = Math.floor(Math.random() * 50000) + 5000; // 5-55 km
  const duration = Math.floor(distance / 10); // ~10 m/s average speed
  
  return {
    routeId: `ROUTE_MOCK_${Date.now()}`,
    distance: distance,
    duration: duration,
    waypoints: [
      WAREHOUSE_LOCATION,
      {
        address: `${deliveryAddress.street}, ${deliveryAddress.city}, ${deliveryAddress.state} ${deliveryAddress.zip}`,
        lat: 40.7128 + (Math.random() - 0.5) * 0.5,
        lng: -74.0060 + (Math.random() - 0.5) * 0.5
      }
    ],
    estimatedArrival: new Date(Date.now() + duration * 1000).toISOString(),
    mock: true
  };
}

/**
 * Geocode address (mock or real)
 */
async function geocodeAddress(address) {
  // Mock geocoding
  return {
    lat: 40.7128 + (Math.random() - 0.5) * 0.5,
    lng: -74.0060 + (Math.random() - 0.5) * 0.5,
    formatted: `${address.street}, ${address.city}, ${address.state} ${address.zip}`
  };
}

async function startAdapter() {
  try {
    // Initialize RabbitMQ
    const rabbitMQ = new RabbitMQClient(process.env.RABBITMQ_URL);
    await rabbitMQ.connect();

    logger.info('ROS Adapter initialized, waiting for messages...');

    // Subscribe to ROS request queue
    await rabbitMQ.consume(
      rabbitMQ.queues.rosRequests,
      async (message) => {
        await processROSRequest(message, rabbitMQ);
      },
      { requeue: true }
    );

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`ROS Adapter running on port ${PORT}`);
    });

    app.locals.rabbitMQ = rabbitMQ;

  } catch (error) {
    logger.error('Failed to start ROS Adapter:', error);
    process.exit(1);
  }
}

/**
 * Process ROS request from RabbitMQ
 */
async function processROSRequest(message, rabbitMQ) {
  const { payload } = message;
  const { orderId, deliveryAddress } = payload;

  logger.info('Processing route optimization request', {
    orderId,
    destination: `${deliveryAddress.city}, ${deliveryAddress.state}`
  });

  try {
    // Calculate optimized route
    const route = await calculateRoute(deliveryAddress);

    logger.info('Route calculated successfully', {
      orderId,
      routeId: route.routeId,
      distance: `${(route.distance / 1000).toFixed(2)} km`,
      duration: `${Math.floor(route.duration / 60)} minutes`,
      mock: route.mock || false
    });

    // Update order status
    await updateOrderStatus(
      orderId,
      'ROUTE_CALCULATED',
      `Optimized route calculated: ${(route.distance / 1000).toFixed(2)} km, ETA ${Math.floor(route.duration / 60)} min`,
      {
        routeId: route.routeId,
        distance: route.distance,
        duration: route.duration,
        estimatedDelivery: route.estimatedArrival,
        waypoints: route.waypoints
      }
    );

    // Publish success event
    await rabbitMQ.publishToEventExchange({
      type: EventTypes.ROS_SUCCESS,
      payload: {
        orderId,
        routeId: route.routeId,
        distance: route.distance,
        duration: route.duration,
        estimatedArrival: route.estimatedArrival
      }
    });

    logger.info('ROS processing completed successfully', { orderId });

  } catch (error) {
    logger.error('ROS processing failed', {
      orderId,
      error: error.message,
      stack: error.stack
    });

    // Update order status
    await updateOrderStatus(
      orderId,
      'PROCESSING',
      `Route calculation warning: ${error.message}`,
      {
        routeError: error.message
      }
    );

    // Publish failure event
    await rabbitMQ.publishToEventExchange({
      type: EventTypes.ROS_FAILURE,
      payload: {
        orderId,
        reason: error.message
      }
    });
  }
}

/**
 * Update order status in Orchestrator
 */
async function updateOrderStatus(orderId, status, message, metadata = {}) {
  try {
    await axios.put(
      `${ORCHESTRATOR_URL}/api/orchestrator/orders/${orderId}/status`,
      {
        status,
        message,
        source: 'ros-adapter',
        metadata
      },
      { timeout: 5000 }
    );

    logger.info('Order status updated', { orderId, status });
  } catch (error) {
    logger.error('Failed to update order status', {
      orderId,
      status,
      error: error.message
    });
  }
}

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down ROS Adapter...');
  
  if (app.locals.rabbitMQ) {
    await app.locals.rabbitMQ.close();
  }
  
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the adapter
startAdapter();

module.exports = app;
