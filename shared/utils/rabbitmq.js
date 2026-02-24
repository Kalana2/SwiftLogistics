const amqp = require('amqplib');

class RabbitMQClient {
  constructor(url = 'amqp://localhost:5672') {
    this.url = url;
    this.connection = null;
    this.channel = null;
    this.exchanges = {
      orders: 'order_exchange',
      events: 'event_exchange'
    };
    this.queues = {
      newOrders: 'new_order_queue',
      cmsRequests: 'cms_request_queue',
      rosRequests: 'ros_request_queue',
      wmsRequests: 'wms_request_queue',
      orderCompleted: 'order_completed_queue',
      notifications: 'notification_queue'
    };
  }

  async connect() {
    try {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();
      
      console.log('[RabbitMQ] Connected successfully');
      
      // Handle connection errors
      this.connection.on('error', (err) => {
        console.error('[RabbitMQ] Connection error:', err);
      });
      
      this.connection.on('close', () => {
        console.log('[RabbitMQ] Connection closed');
      });
      
      await this.setupExchangesAndQueues();
      
      return this.channel;
    } catch (error) {
      console.error('[RabbitMQ] Connection failed:', error);
      throw error;
    }
  }

  async setupExchangesAndQueues() {
    // Declare exchanges
    await this.channel.assertExchange(this.exchanges.orders, 'topic', { durable: true });
    await this.channel.assertExchange(this.exchanges.events, 'fanout', { durable: true });
    
    // Declare queues
    await this.channel.assertQueue(this.queues.newOrders, { durable: true });
    await this.channel.assertQueue(this.queues.cmsRequests, { durable: true });
    await this.channel.assertQueue(this.queues.rosRequests, { durable: true });
    await this.channel.assertQueue(this.queues.wmsRequests, { durable: true });
    await this.channel.assertQueue(this.queues.orderCompleted, { durable: true });
    await this.channel.assertQueue(this.queues.notifications, { durable: true });
    
    // Bind queues to exchanges
    await this.channel.bindQueue(this.queues.newOrders, this.exchanges.orders, 'order.new');
    await this.channel.bindQueue(this.queues.cmsRequests, this.exchanges.orders, 'order.cms');
    await this.channel.bindQueue(this.queues.rosRequests, this.exchanges.orders, 'order.ros');
    await this.channel.bindQueue(this.queues.wmsRequests, this.exchanges.orders, 'order.wms');
    await this.channel.bindQueue(this.queues.notifications, this.exchanges.events, '');
    
    console.log('[RabbitMQ] Exchanges and queues setup complete');
  }

  async publish(exchange, routingKey, message) {
    try {
      const content = Buffer.from(JSON.stringify(message));
      this.channel.publish(exchange, routingKey, content, {
        persistent: true,
        contentType: 'application/json',
        timestamp: Date.now()
      });
      console.log(`[RabbitMQ] Published to ${exchange} with key ${routingKey}`);
      return true;
    } catch (error) {
      console.error('[RabbitMQ] Publish error:', error);
      return false;
    }
  }

  async publishToOrderExchange(routingKey, order) {
    return this.publish(this.exchanges.orders, routingKey, order);
  }

  async publishToEventExchange(event) {
    return this.publish(this.exchanges.events, '', event);
  }

  async consume(queue, callback, options = {}) {
    try {
      await this.channel.consume(queue, async (msg) => {
        if (msg) {
          try {
            const content = JSON.parse(msg.content.toString());
            console.log(`[RabbitMQ] Consumed from ${queue}`);
            
            await callback(content, msg);
            
            // Acknowledge message
            if (!options.noAck) {
              this.channel.ack(msg);
            }
          } catch (error) {
            console.error(`[RabbitMQ] Error processing message from ${queue}:`, error);
            
            // Reject and requeue if processing fails
            if (options.requeue !== false) {
              this.channel.nack(msg, false, true);
            } else {
              this.channel.nack(msg, false, false);
            }
          }
        }
      }, { noAck: options.noAck || false });
      
      console.log(`[RabbitMQ] Consuming from ${queue}`);
    } catch (error) {
      console.error(`[RabbitMQ] Consume error on ${queue}:`, error);
      throw error;
    }
  }

  async close() {
    try {
      await this.channel?.close();
      await this.connection?.close();
      console.log('[RabbitMQ] Connection closed gracefully');
    } catch (error) {
      console.error('[RabbitMQ] Error closing connection:', error);
    }
  }
}

module.exports = RabbitMQClient;
