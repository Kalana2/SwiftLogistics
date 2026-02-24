const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  customerId: {
    type: String,
    required: true,
    index: true
  },
  items: [{
    sku: { type: String, required: true },
    name: String,
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    weight: { type: Number, default: 0 }
  }],
  deliveryAddress: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String, required: true },
    country: { type: String, default: 'USA' },
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  status: {
    type: String,
    enum: [
      'RECEIVED',
      'PENDING',
      'PROCESSING',
      'CMS_CONFIRMED',
      'ROUTE_CALCULATED',
      'WMS_ASSIGNED',
      'PROCESSED',
      'IN_TRANSIT',
      'DELIVERED',
      'FAILED',
      'CANCELLED'
    ],
    default: 'RECEIVED',
    index: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  metadata: {
    cmsReference: String,
    routeId: String,
    warehouseId: String,
    driverId: String,
    estimatedDelivery: Date,
    submittedBy: String,
    submittedAt: Date,
    completedAt: Date,
    failureReason: String
  },
  statusHistory: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    message: String,
    source: String
  }]
}, {
  timestamps: true
});

// Add status to history before saving
orderSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
      message: `Status changed to ${this.status}`
    });
  }
  next();
});

// Instance method to update status
orderSchema.methods.updateStatus = function(newStatus, message, source) {
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    timestamp: new Date(),
    message: message || `Status changed to ${newStatus}`,
    source: source || 'system'
  });
  return this.save();
};

module.exports = mongoose.model('Order', orderSchema);
