// Order Status Enumeration
const OrderStatus = {
  RECEIVED: 'RECEIVED',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  CMS_CONFIRMED: 'CMS_CONFIRMED',
  ROUTE_CALCULATED: 'ROUTE_CALCULATED',
  WMS_ASSIGNED: 'WMS_ASSIGNED',
  PROCESSED: 'PROCESSED',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
};

// Order Model Schema
class Order {
  constructor({
    orderId,
    customerId,
    items,
    deliveryAddress,
    status = OrderStatus.RECEIVED,
    totalAmount,
    createdAt = new Date(),
    updatedAt = new Date(),
    metadata = {}
  }) {
    this.orderId = orderId;
    this.customerId = customerId;
    this.items = items;
    this.deliveryAddress = deliveryAddress;
    this.status = status;
    this.totalAmount = totalAmount || this.calculateTotal();
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.metadata = metadata; // CMS reference, route info, warehouse assignment
  }

  calculateTotal() {
    return this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  updateStatus(newStatus) {
    this.status = newStatus;
    this.updatedAt = new Date();
  }

  addMetadata(key, value) {
    this.metadata[key] = value;
    this.updatedAt = new Date();
  }

  toJSON() {
    return {
      orderId: this.orderId,
      customerId: this.customerId,
      items: this.items,
      deliveryAddress: this.deliveryAddress,
      status: this.status,
      totalAmount: this.totalAmount,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      metadata: this.metadata
    };
  }
}

// Order Item Model
class OrderItem {
  constructor({ sku, name, quantity, price, weight = 0 }) {
    this.sku = sku;
    this.name = name;
    this.quantity = quantity;
    this.price = price;
    this.weight = weight;
  }
}

// Address Model
class Address {
  constructor({ street, city, state, zip, country = 'USA', coordinates = null }) {
    this.street = street;
    this.city = city;
    this.state = state;
    this.zip = zip;
    this.country = country;
    this.coordinates = coordinates; // { lat, lng }
  }

  toString() {
    return `${this.street}, ${this.city}, ${this.state} ${this.zip}, ${this.country}`;
  }
}

module.exports = {
  Order,
  OrderItem,
  Address,
  OrderStatus
};
