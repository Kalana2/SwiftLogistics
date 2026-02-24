// Event Types for RabbitMQ
const EventTypes = {
  // Order Events
  ORDER_RECEIVED: 'order.received',
  ORDER_VALIDATED: 'order.validated',
  ORDER_PROCESSING: 'order.processing',
  ORDER_COMPLETED: 'order.completed',
  ORDER_FAILED: 'order.failed',
  
  // CMS Events
  CMS_REQUEST: 'cms.request',
  CMS_SUCCESS: 'cms.success',
  CMS_FAILURE: 'cms.failure',
  
  // ROS Events
  ROS_REQUEST: 'ros.request',
  ROS_SUCCESS: 'ros.success',
  ROS_FAILURE: 'ros.failure',
  
  // WMS Events
  WMS_REQUEST: 'wms.request',
  WMS_SUCCESS: 'wms.success',
  WMS_FAILURE: 'wms.failure',
  
  // Notification Events
  NOTIFY_CLIENT: 'notify.client',
  NOTIFY_DRIVER: 'notify.driver'
};

// Event Message Structure
class Event {
  constructor(type, payload, metadata = {}) {
    this.eventId = this.generateEventId();
    this.type = type;
    this.payload = payload;
    this.timestamp = new Date();
    this.metadata = metadata;
  }

  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  toJSON() {
    return {
      eventId: this.eventId,
      type: this.type,
      payload: this.payload,
      timestamp: this.timestamp,
      metadata: this.metadata
    };
  }
}

module.exports = {
  Event,
  EventTypes
};
