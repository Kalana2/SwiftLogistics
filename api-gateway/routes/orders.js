const express = require('express');
const axios = require('axios');
const { body, param, validationResult } = require('express-validator');
const { authenticateJWT } = require('../../shared/utils/jwt');
const { createLogger } = require('../../shared/utils/logger');

const router = express.Router();
const logger = createLogger('api-gateway-orders');

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3001';

/**
 * @route   POST /api/orders
 * @desc    Submit new order to orchestration service
 * @access  Private (requires JWT)
 */
router.post('/',
  authenticateJWT,
  [
    body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.sku').notEmpty().withMessage('SKU is required'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('items.*.price').isFloat({ min: 0 }).withMessage('Price must be non-negative'),
    body('deliveryAddress.street').notEmpty(),
    body('deliveryAddress.city').notEmpty(),
    body('deliveryAddress.state').notEmpty(),
    body('deliveryAddress.zip').notEmpty()
  ],
  async (req, res) => {
    // Input validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    try {
      const orderData = {
        customerId: req.user.customerId || req.user.userId,
        items: req.body.items,
        deliveryAddress: req.body.deliveryAddress,
        metadata: {
          submittedBy: req.user.username,
          submittedAt: new Date().toISOString()
        }
      };

      logger.info('Forwarding order to orchestrator', {
        customerId: orderData.customerId,
        itemCount: orderData.items.length
      });

      // Forward to Orchestration Service
      const response = await axios.post(
        `${ORCHESTRATOR_URL}/api/orchestrator/orders`,
        orderData,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Gateway-Request': 'true'
          },
          timeout: 5000
        }
      );

      // Return 202 Accepted (Non-blocking response)
      res.status(202).json({
        success: true,
        message: 'Order received and is being processed',
        data: response.data
      });

    } catch (error) {
      logger.error('Error forwarding order to orchestrator', {
        error: error.message,
        stack: error.stack
      });

      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          error: 'Service temporarily unavailable',
          message: 'Orchestration service is not available'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to process order',
        message: error.response?.data?.message || error.message
      });
    }
  }
);

/**
 * @route   GET /api/orders/:orderId
 * @desc    Get order status
 * @access  Private
 */
router.get('/:orderId',
  authenticateJWT,
  [
    param('orderId').notEmpty().withMessage('Order ID is required')
  ],
  async (req, res) => {
    try {
      const { orderId } = req.params;

      logger.info('Fetching order status', { orderId });

      const response = await axios.get(
        `${ORCHESTRATOR_URL}/api/orchestrator/orders/${orderId}`,
        { timeout: 5000 }
      );

      res.json({
        success: true,
        data: response.data
      });

    } catch (error) {
      logger.error('Error fetching order', {
        orderId: req.params.orderId,
        error: error.message
      });

      if (error.response?.status === 404) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to fetch order'
      });
    }
  }
);

/**
 * @route   GET /api/orders
 * @desc    Get all orders for authenticated customer
 * @access  Private
 */
router.get('/',
  authenticateJWT,
  async (req, res) => {
    try {
      const customerId = req.user.customerId || req.user.userId;

      logger.info('Fetching customer orders', { customerId });

      const response = await axios.get(
        `${ORCHESTRATOR_URL}/api/orchestrator/orders`,
        {
          params: { customerId },
          timeout: 5000
        }
      );

      res.json({
        success: true,
        data: response.data
      });

    } catch (error) {
      logger.error('Error fetching orders', {
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch orders'
      });
    }
  }
);

module.exports = router;
