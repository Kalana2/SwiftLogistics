const express = require('express');
const axios = require('axios');
require('dotenv').config();

const RabbitMQClient = require('../shared/utils/rabbitmq');
const { createLogger } = require('../shared/utils/logger');
const WMSClient = require('./wms-client');
const { EventTypes } = require('../shared/models/Event');

const app = express();
const logger = createLogger('wms-adapter');

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'wms-adapter',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3004;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3001';
const WMS_TCP_HOST = process.env.WMS_TCP_HOST || 'localhost';
const WMS_TCP_PORT = parseInt(process.env.WMS_TCP_PORT) || 4001;

async function startAdapter() {
  try {
    // Initialize RabbitMQ
    const rabbitMQ = new RabbitMQClient(process.env.RABBITMQ_URL);
    await rabbitMQ.connect();

    logger.info('WMS Adapter initialized, waiting for messages...');

    // Subscribe to WMS request queue
    await rabbitMQ.consume(
      rabbitMQ.queues.wmsRequests,
      async (message) => {
        await processWMSRequest(message, rabbitMQ);
      },
      { requeue: true }
    );

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`WMS Adapter running on port ${PORT}`);
      logger.info(`WMS TCP target: ${WMS_TCP_HOST}:${WMS_TCP_PORT}`);
    });

    app.locals.rabbitMQ = rabbitMQ;

  } catch (error) {
    logger.error('Failed to start WMS Adapter:', error);
    process.exit(1);
  }
}

/**
 * Process WMS request from RabbitMQ
 */
async function processWMSRequest(message, rabbitMQ) {
  const { payload } = message;
  const { orderId, items, deliveryAddress } = payload;

  logger.info('Processing warehouse assignment request', {
    orderId,
    destination: `${deliveryAddress.city}, ${deliveryAddress.state}`
  });

  const wmsClient = new WMSClient(WMS_TCP_HOST, WMS_TCP_PORT);

  try {
    // Step 1: Assign warehouse
    logger.info('Requesting warehouse assignment', { orderId });

    const warehouseAssignment = await wmsClient.assignWarehouse(
      orderId,
      items,
      deliveryAddress
    );

    if (!warehouseAssignment.success) {
      throw new Error(warehouseAssignment.message || 'Warehouse assignment failed');
    }

    logger.info('Warehouse assigned', {
      orderId,
      warehouseId: warehouseAssignment.warehouseId,
      warehouseName: warehouseAssignment.warehouseName
    });

    // Step 2: Get route info from order (set by ROS adapter)
    const orderResponse = await axios.get(
      `${ORCHESTRATOR_URL}/api/orchestrator/orders/${orderId}`,
      { timeout: 5000 }
    );

    const order = orderResponse.data.data;
    const routeInfo = {
      distance: order.metadata?.distance || 10000,
      duration: order.metadata?.duration || 1800,
      estimatedArrival: order.metadata?.estimatedDelivery || new Date(Date.now() + 3600000).toISOString()
    };

    // Step 3: Assign driver
    logger.info('Requesting driver assignment', { orderId });

    const driverAssignment = await wmsClient.assignDriver(
      orderId,
      warehouseAssignment.warehouseId,
      routeInfo
    );

    if (!driverAssignment.success) {
      throw new Error(driverAssignment.message || 'Driver assignment failed');
    }

    logger.info('Driver assigned', {
      orderId,
      driverId: driverAssignment.driverId,
      driverName: driverAssignment.driverName
    });

    // Update order status
    await updateOrderStatus(
      orderId,
      'WMS_ASSIGNED',
      `Warehouse and driver assigned: ${driverAssignment.driverName}`,
      {
        warehouseId: warehouseAssignment.warehouseId,
        warehouseName: warehouseAssignment.warehouseName,
        warehouseLocation: warehouseAssignment.location,
        driverId: driverAssignment.driverId,
        driverName: driverAssignment.driverName,
        driverPhone: driverAssignment.driverPhone,
        vehicleId: driverAssignment.vehicleId,
        pickupTime: driverAssignment.pickupTime
      }
    );

    // Publish success event
    await rabbitMQ.publishToEventExchange({
      type: EventTypes.WMS_SUCCESS,
      payload: {
        orderId,
        warehouseId: warehouseAssignment.warehouseId,
        driverId: driverAssignment.driverId,
        pickupTime: driverAssignment.pickupTime
      }
    });

    // Mark order as fully processed
    await updateOrderStatus(
      orderId,
      'PROCESSED',
      'Order fully processed and ready for pickup',
      {}
    );

    logger.info('WMS processing completed successfully', { orderId });

  } catch (error) {
    logger.error('WMS processing failed', {
      orderId,
      error: error.message,
      stack: error.stack
    });

    // Update order status
    await updateOrderStatus(
      orderId,
      'PROCESSING',
      `WMS warning: ${error.message}`,
      {
        wmsError: error.message
      }
    );

    // Publish failure event
    await rabbitMQ.publishToEventExchange({
      type: EventTypes.WMS_FAILURE,
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
        source: 'wms-adapter',
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
  logger.info('Shutting down WMS Adapter...');
  
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
