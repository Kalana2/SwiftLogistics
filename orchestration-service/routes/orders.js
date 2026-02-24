const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Order = require('../models/Order');
const { createLogger } = require('../../shared/utils/logger');
const { EventTypes, Event } = require('../../shared/models/Event');
const { createOrderProcessingSaga } = require('../saga');

const router = express.Router();
const logger = createLogger('orchestration-orders');

/**
 * @route   POST /api/orchestrator/orders
 * @desc    Receive order, persist to MongoDB, publish to RabbitMQ
 * @access  Internal (from API Gateway)
 */
router.post('/orders', async (req, res) => {
  const rabbitMQ = req.app.locals.rabbitMQ;

  try {
    const { customerId, items, deliveryAddress, metadata } = req.body;

    // Generate unique order ID
    const orderId = `ORD_${Date.now()}_${uuidv4().substring(0, 8)}`;

    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Create order object
    const orderData = {
      orderId,
      customerId,
      items,
      deliveryAddress,
      status: 'RECEIVED',
      totalAmount,
      metadata: {
        ...metadata,
        receivedAt: new Date().toISOString()
      },
      statusHistory: []
    };

    logger.info('Creating new order', {
      orderId,
      customerId,
      itemCount: items.length,
      totalAmount
    });

    // 1. Persist to MongoDB immediately (ensures data consistency)
    const order = new Order(orderData);
    await order.save();

    logger.info('Order persisted to database', { orderId });

    // 2. Update status to PENDING
    await order.updateStatus('PENDING', 'Order queued for processing', 'orchestrator');

    // 3. Publish to RabbitMQ for async processing by adapters
    const orderEvent = new Event(EventTypes.ORDER_RECEIVED, {
      orderId: order.orderId,
      customerId: order.customerId,
      items: order.items,
      deliveryAddress: order.deliveryAddress,
      totalAmount: order.totalAmount
    });

    // Publish to adapters (they consume asynchronously)
    await rabbitMQ.publishToOrderExchange('order.new', orderEvent.toJSON());
    await rabbitMQ.publishToOrderExchange('order.cms', orderEvent.toJSON());
    await rabbitMQ.publishToOrderExchange('order.ros', orderEvent.toJSON());
    await rabbitMQ.publishToOrderExchange('order.wms', orderEvent.toJSON());

    logger.info('Order published to RabbitMQ', { orderId });

    // 4. Execute Saga — sequential CMS → ROS → WMS with compensation
    const ORCHESTRATOR_URL = process.env.SELF_URL || `http://localhost:${process.env.PORT || 3001}`;
    const saga = createOrderProcessingSaga(ORCHESTRATOR_URL);
    const sagaResult = await saga.execute({
      orderId: order.orderId,
      customerId: order.customerId,
      items: order.items,
      deliveryAddress: order.deliveryAddress
    });

    // 5. Save saga execution log to order
    order.sagaLog = (sagaResult.sagaLog || []).map(entry => ({
      step: entry.step,
      status: entry.status,
      error: entry.error,
      duration: entry.duration,
      timestamp: entry.timestamp
    }));

    if (!sagaResult.success) {
      await order.updateStatus(
        'FAILED',
        `Saga failed at step: ${sagaResult.failedStep} — ${sagaResult.error}`,
        'saga-orchestrator'
      );
      logger.error('Saga failed', { orderId, failedStep: sagaResult.failedStep });
    }

    await order.save();

    // Publish notification event
    await rabbitMQ.publishToEventExchange({
      type: EventTypes.NOTIFY_CLIENT,
      payload: {
        customerId: order.customerId,
        orderId: order.orderId,
        message: 'Order received and is being processed',
        status: order.status
      }
    });

    // 6. Return 202 Accepted (Non-blocking response)
    res.status(202).json({
      success: true,
      message: 'Order received and is being processed',
      orderId: order.orderId,
      status: order.status,
      estimatedProcessingTime: '2-5 minutes',
      sagaResult: {
        success: sagaResult.success,
        failedStep: sagaResult.failedStep || null
      }
    });

  } catch (error) {
    logger.error('Error creating order:', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/orchestrator/orders/:orderId
 * @desc    Get order by ID
 * @access  Internal
 */
router.get('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: order
    });

  } catch (error) {
    logger.error('Error fetching order:', {
      orderId: req.params.orderId,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch order'
    });
  }
});

/**
 * @route   GET /api/orchestrator/orders
 * @desc    Get orders by customer ID
 * @access  Internal
 */
router.get('/orders', async (req, res) => {
  try {
    const { customerId, status, limit = 50 } = req.query;

    const query = {};
    if (customerId) query.customerId = customerId;
    if (status) query.status = status;

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: orders.length,
      data: orders
    });

  } catch (error) {
    logger.error('Error fetching orders:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders'
    });
  }
});

/**
 * @route   PUT /api/orchestrator/orders/:orderId/status
 * @desc    Update order status (called by adapters)
 * @access  Internal
 */
router.put('/orders/:orderId/status', async (req, res) => {
  const rabbitMQ = req.app.locals.rabbitMQ;

  try {
    const { orderId } = req.params;
    const { status, message, source, metadata } = req.body;

    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Update status
    await order.updateStatus(status, message, source);

    // Update metadata if provided
    if (metadata) {
      Object.assign(order.metadata, metadata);
      await order.save();
    }

    logger.info('Order status updated', {
      orderId,
      oldStatus: order.statusHistory[order.statusHistory.length - 2]?.status,
      newStatus: status,
      source
    });

    // Publish notification
    await rabbitMQ.publishToEventExchange({
      type: EventTypes.NOTIFY_CLIENT,
      payload: {
        customerId: order.customerId,
        orderId: order.orderId,
        message: message || `Order status updated to ${status}`,
        status: status
      }
    });

    res.json({
      success: true,
      data: order
    });

  } catch (error) {
    logger.error('Error updating order status:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to update order status'
    });
  }
});

/**
 * @route   POST /api/orchestrator/orders/:orderId/delivery-status
 * @desc    Update delivery status (from driver)
 * @access  Internal
 */
router.post('/orders/:orderId/delivery-status', async (req, res) => {
  const rabbitMQ = req.app.locals.rabbitMQ;

  try {
    const { orderId } = req.params;
    const { driverId, status, location, notes } = req.body;

    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    await order.updateStatus(
      status,
      `Driver update: ${notes || status}`,
      `driver:${driverId}`
    );

    if (status === 'DELIVERED') {
      order.metadata.completedAt = new Date();
    }

    await order.save();

    // Notify customer
    await rabbitMQ.publishToEventExchange({
      type: EventTypes.NOTIFY_CLIENT,
      payload: {
        customerId: order.customerId,
        orderId: order.orderId,
        message: `Delivery ${status.toLowerCase()}${notes ? ': ' + notes : ''}`,
        status: status,
        location
      }
    });

    res.json({
      success: true,
      data: order
    });

  } catch (error) {
    logger.error('Error updating delivery status:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to update delivery status'
    });
  }
});

/**
 * @route   GET /api/orchestrator/driver/:driverId/manifest
 * @desc    Get driver's delivery manifest
 * @access  Internal
 */
router.get('/driver/:driverId/manifest', async (req, res) => {
  try {
    const { driverId } = req.params;

    const orders = await Order.find({
      'metadata.driverId': driverId,
      status: { $in: ['WMS_ASSIGNED', 'IN_TRANSIT'] }
    }).sort({ 'metadata.estimatedDelivery': 1 });

    res.json({
      success: true,
      driverId,
      deliveryCount: orders.length,
      deliveries: orders.map(order => ({
        orderId: order.orderId,
        customerId: order.customerId,
        deliveryAddress: order.deliveryAddress,
        status: order.status,
        items: order.items,
        estimatedDelivery: order.metadata.estimatedDelivery
      }))
    });

  } catch (error) {
    logger.error('Error fetching driver manifest:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch manifest'
    });
  }
});

/**
 * @route   POST /api/orchestrator/orders/:orderId/proof
 * @desc    Store proof of delivery (photo + signature)
 * @access  Internal (from API Gateway)
 */
router.post('/orders/:orderId/proof', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { photo, signature, capturedBy } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    order.proofOfDelivery = {
      photo: photo || null,
      signature: signature || null,
      capturedAt: new Date(),
      capturedBy: capturedBy || 'driver'
    };

    await order.save();

    logger.info('Proof of delivery stored', { orderId, hasPhoto: !!photo, hasSig: !!signature });

    res.json({ success: true, message: 'Proof of delivery recorded', data: order.proofOfDelivery });
  } catch (error) {
    logger.error('Error storing proof of delivery:', error);
    res.status(500).json({ success: false, error: 'Failed to store proof' });
  }
});

module.exports = router;
