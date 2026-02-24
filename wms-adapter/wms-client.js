const net = require('net');
const { createLogger } = require('../shared/utils/logger');

const logger = createLogger('wms-tcp-client');

class WMSClient {
  constructor(host = 'localhost', port = 4001) {
    this.host = host;
    this.port = port;
    this.client = null;
  }

  /**
   * Connect to WMS TCP server
   */
  connect() {
    return new Promise((resolve, reject) => {
      this.client = new net.Socket();
      
      this.client.connect(this.port, this.host, () => {
        logger.info('Connected to WMS TCP server', {
          host: this.host,
          port: this.port
        });
        resolve();
      });

      this.client.on('error', (err) => {
        logger.error('WMS TCP connection error', { error: err.message });
        reject(err);
      });

      this.client.on('close', () => {
        logger.info('WMS TCP connection closed');
      });
    });
  }

  /**
   * Send message to WMS and wait for response
   */
  sendMessage(message) {
    return new Promise((resolve, reject) => {
      if (!this.client || this.client.destroyed) {
        return reject(new Error('Not connected to WMS'));
      }

      let responseData = '';

      // Setup one-time data listener for this request
      const dataHandler = (data) => {
        responseData += data.toString();
        
        // Check if we have a complete message (ends with delimiter)
        if (responseData.includes('\n')) {
          this.client.removeListener('data', dataHandler);
          
          try {
            const response = JSON.parse(responseData.trim());
            resolve(response);
          } catch (error) {
            reject(new Error('Invalid response from WMS'));
          }
        }
      };

      this.client.on('data', dataHandler);

      // Send message
      const messageStr = JSON.stringify(message) + '\n';
      this.client.write(messageStr);

      logger.info('Sent message to WMS', {
        messageType: message.type,
        size: messageStr.length
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        this.client.removeListener('data', dataHandler);
        reject(new Error('WMS request timeout'));
      }, 10000);
    });
  }

  /**
   * Request warehouse assignment for order
   */
  async assignWarehouse(orderId, items, deliveryAddress) {
    try {
      await this.connect();

      const message = {
        type: 'ASSIGN_WAREHOUSE',
        orderId,
        items: items.map(item => ({
          sku: item.sku,
          quantity: item.quantity,
          weight: item.weight || 1
        })),
        destination: {
          city: deliveryAddress.city,
          state: deliveryAddress.state,
          zip: deliveryAddress.zip
        },
        timestamp: new Date().toISOString()
      };

      const response = await this.sendMessage(message);
      
      this.close();
      
      return response;

    } catch (error) {
      this.close();
      throw error;
    }
  }

  /**
   * Request driver assignment
   */
  async assignDriver(orderId, warehouseId, routeInfo) {
    try {
      await this.connect();

      const message = {
        type: 'ASSIGN_DRIVER',
        orderId,
        warehouseId,
        routeDistance: routeInfo.distance,
        routeDuration: routeInfo.duration,
        estimatedDelivery: routeInfo.estimatedArrival,
        timestamp: new Date().toISOString()
      };

      const response = await this.sendMessage(message);
      
      this.close();
      
      return response;

    } catch (error) {
      this.close();
      throw error;
    }
  }

  /**
   * Update order status in WMS
   */
  async updateOrderStatus(orderId, status) {
    try {
      await this.connect();

      const message = {
        type: 'UPDATE_STATUS',
        orderId,
        status,
        timestamp: new Date().toISOString()
      };

      const response = await this.sendMessage(message);
      
      this.close();
      
      return response;

    } catch (error) {
      this.close();
      throw error;
    }
  }

  /**
   * Close connection
   */
  close() {
    if (this.client && !this.client.destroyed) {
      this.client.destroy();
    }
  }
}

module.exports = WMSClient;
