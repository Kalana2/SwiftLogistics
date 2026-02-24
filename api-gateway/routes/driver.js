const express = require('express');
const axios = require('axios');
const { authenticateJWT } = require('../../shared/utils/jwt');
const { createLogger } = require('../../shared/utils/logger');

const router = express.Router();
const logger = createLogger('api-gateway-driver');

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3001';

/**
 * @route   GET /api/driver/manifest
 * @desc    Get delivery manifest for driver
 * @access  Private (Driver only)
 */
router.get('/manifest',
  authenticateJWT,
  async (req, res) => {
    try {
      // Check if user is a driver
      if (req.user.role !== 'driver') {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Driver role required.'
        });
      }

      const driverId = req.user.driverId;

      logger.info('Fetching driver manifest', { driverId });

      // In a real system, this would query the orchestrator or a dedicated driver service
      const response = await axios.get(
        `${ORCHESTRATOR_URL}/api/orchestrator/driver/${driverId}/manifest`,
        { timeout: 5000 }
      );

      res.json({
        success: true,
        data: response.data
      });

    } catch (error) {
      logger.error('Error fetching driver manifest', {
        driverId: req.user.driverId,
        error: error.message
      });

      if (error.response?.status === 404) {
        return res.json({
          success: true,
          data: {
            driverId: req.user.driverId,
            deliveries: [],
            message: 'No deliveries assigned'
          }
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to fetch manifest'
      });
    }
  }
);

/**
 * @route   POST /api/driver/delivery/:orderId/status
 * @desc    Update delivery status
 * @access  Private (Driver only)
 */
router.post('/delivery/:orderId/status',
  authenticateJWT,
  async (req, res) => {
    try {
      if (req.user.role !== 'driver') {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Driver role required.'
        });
      }

      const { orderId } = req.params;
      const { status, location, notes } = req.body;

      logger.info('Updating delivery status', {
        orderId,
        driverId: req.user.driverId,
        status
      });

      const response = await axios.post(
        `${ORCHESTRATOR_URL}/api/orchestrator/orders/${orderId}/delivery-status`,
        {
          driverId: req.user.driverId,
          status,
          location,
          notes,
          timestamp: new Date().toISOString()
        },
        { timeout: 5000 }
      );

      res.json({
        success: true,
        data: response.data
      });

    } catch (error) {
      logger.error('Error updating delivery status', {
        orderId: req.params.orderId,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update delivery status'
      });
    }
  }
);

/**
 * @route   POST /api/driver/delivery/:orderId/proof
 * @desc    Upload proof of delivery (photo + signature)
 * @access  Private (Driver only)
 */
router.post('/delivery/:orderId/proof',
  authenticateJWT,
  async (req, res) => {
    try {
      if (req.user.role !== 'driver') {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Driver role required.'
        });
      }

      const { orderId } = req.params;
      const { photo, signature } = req.body;

      if (!photo && !signature) {
        return res.status(400).json({
          success: false,
          error: 'Either photo or signature is required'
        });
      }

      logger.info('Uploading proof of delivery', {
        orderId,
        driverId: req.user.driverId,
        hasPhoto: !!photo,
        hasSignature: !!signature
      });

      const response = await axios.post(
        `${ORCHESTRATOR_URL}/api/orchestrator/orders/${orderId}/proof`,
        {
          photo,
          signature,
          capturedBy: req.user.driverId
        },
        { timeout: 10000 }
      );

      res.json({
        success: true,
        data: response.data
      });

    } catch (error) {
      logger.error('Error uploading proof of delivery', {
        orderId: req.params.orderId,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Failed to upload proof of delivery'
      });
    }
  }
);

module.exports = router;
