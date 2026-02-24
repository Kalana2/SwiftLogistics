const express = require('express');
const axios = require('axios');
require('dotenv').config();

const RabbitMQClient = require('../shared/utils/rabbitmq');
const { createLogger } = require('../shared/utils/logger');
const CMSClient = require('./cms-client');
const { EventTypes } = require('../shared/models/Event');

const app = express();
const logger = createLogger('cms-adapter');

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'cms-adapter',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3002;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3001';

async function startAdapter() {
  try {
    // Initialize RabbitMQ
    const rabbitMQ = new RabbitMQClient(process.env.RABBITMQ_URL);
    await rabbitMQ.connect();

    // Initialize CMS SOAP client
    const cmsClient = new CMSClient(process.env.CMS_SOAP_URL);

    logger.info('CMS Adapter initialized, waiting for messages...');

    // Subscribe to CMS request queue
    await rabbitMQ.consume(
      rabbitMQ.queues.cmsRequests,
      async (message) => {
        await processCMSRequest(message, cmsClient, rabbitMQ);
      },
      { requeue: true }
    );

    // Start HTTP server for health checks
    app.listen(PORT, () => {
      logger.info(`CMS Adapter running on port ${PORT}`);
    });

    app.locals.rabbitMQ = rabbitMQ;

  } catch (error) {
    logger.error('Failed to start CMS Adapter:', error);
    process.exit(1);
  }
}

/**
 * Process CMS request from RabbitMQ
 */
async function processCMSRequest(message, cmsClient, rabbitMQ) {
  const { payload } = message;
  const { orderId, customerId, items, totalAmount } = payload;

  logger.info('Processing CMS request', {
    orderId,
    customerId,
    itemCount: items?.length
  });

  try {
    // Step 1: Check inventory availability
    logger.info('Checking inventory in CMS', { orderId });
    
    const inventoryCheck = await cmsClient.checkInventory(orderId, items);

    if (!inventoryCheck.available) {
      logger.warn('Inventory not available', {
        orderId,
        message: inventoryCheck.message
      });

      // Update order status to FAILED
      await updateOrderStatus(orderId, 'FAILED', 'Inventory unavailable', {
        failureReason: inventoryCheck.message
      });

      // Publish failure event
      await rabbitMQ.publishToEventExchange({
        type: EventTypes.CMS_FAILURE,
        payload: {
          orderId,
          reason: 'Inventory unavailable',
          details: inventoryCheck
        }
      });

      return;
    }

    // Step 2: Confirm order in CMS
    logger.info('Confirming order in CMS', { orderId });

    const confirmation = await cmsClient.confirmOrder(
      orderId,
      customerId,
      items,
      totalAmount
    );

    if (!confirmation.success) {
      throw new Error(confirmation.message || 'CMS confirmation failed');
    }

    logger.info('Order confirmed in CMS', {
      orderId,
      cmsReference: confirmation.cmsReference
    });

    // Update order status
    await updateOrderStatus(
      orderId,
      'CMS_CONFIRMED',
      'Inventory reserved and order confirmed in CMS',
      {
        cmsReference: confirmation.cmsReference,
        cmsTimestamp: confirmation.timestamp
      }
    );

    // Publish success event
    await rabbitMQ.publishToEventExchange({
      type: EventTypes.CMS_SUCCESS,
      payload: {
        orderId,
        cmsReference: confirmation.cmsReference,
        message: 'Order confirmed in CMS'
      }
    });

    logger.info('CMS processing completed successfully', { orderId });

  } catch (error) {
    logger.error('CMS processing failed', {
      orderId,
      error: error.message,
      stack: error.stack
    });

    // Update order status to FAILED
    await updateOrderStatus(orderId, 'FAILED', `CMS error: ${error.message}`, {
      failureReason: error.message
    });

    // Publish failure event
    await rabbitMQ.publishToEventExchange({
      type: EventTypes.CMS_FAILURE,
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
        source: 'cms-adapter',
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
  logger.info('Shutting down CMS Adapter...');
  
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
