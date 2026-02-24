const net = require('net');
require('dotenv').config();

const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('wms-mock');

const PORT = process.env.PORT || 4001;

// Mock warehouses
const warehouses = [
  {
    id: 'WH_NYC_001',
    name: 'New York Distribution Center',
    location: { city: 'New York', state: 'NY', lat: 40.7128, lng: -74.0060 },
    capacity: 10000
  },
  {
    id: 'WH_LA_001',
    name: 'Los Angeles Distribution Center',
    location: { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
    capacity: 8000
  },
  {
    id: 'WH_CHI_001',
    name: 'Chicago Distribution Center',
    location: { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
    capacity: 12000
  }
];

// Mock drivers
const drivers = [
  {
    id: 'DRV001',
    name: 'John Smith',
    phone: '+1-555-0101',
    vehicleId: 'VAN-101',
    status: 'available',
    currentLocation: warehouses[0].id
  },
  {
    id: 'DRV002',
    name: 'Sarah Johnson',
    phone: '+1-555-0102',
    vehicleId: 'TRUCK-201',
    status: 'available',
    currentLocation: warehouses[0].id
  },
  {
    id: 'DRV003',
    name: 'Mike Davis',
    phone: '+1-555-0103',
    vehicleId: 'VAN-102',
    status: 'available',
    currentLocation: warehouses[1].id
  }
];

// Store order assignments
const assignments = new Map();

/**
 * Assign warehouse based on destination
 */
function assignWarehouse(destination) {
  // Simple assignment logic based on state
  const stateMapping = {
    'NY': warehouses[0],
    'NJ': warehouses[0],
    'PA': warehouses[0],
    'CA': warehouses[1],
    'NV': warehouses[1],
    'AZ': warehouses[1],
    'IL': warehouses[2],
    'WI': warehouses[2],
    'IN': warehouses[2]
  };

  const warehouse = stateMapping[destination.state] || warehouses[0];
  
  logger.info('Warehouse assigned', {
    destination: `${destination.city}, ${destination.state}`,
    warehouse: warehouse.name
  });

  return warehouse;
}

/**
 * Assign available driver
 */
function assignDriver(warehouseId) {
  // Find available driver at the warehouse
  const driver = drivers.find(d => 
    d.status === 'available' && d.currentLocation === warehouseId
  );

  if (!driver) {
    // If no driver at this warehouse, assign any available driver
    const anyDriver = drivers.find(d => d.status === 'available');
    if (anyDriver) {
      logger.info('Driver assigned from different warehouse', {
        driverId: anyDriver.id,
        name: anyDriver.name
      });
      return anyDriver;
    }
    
    throw new Error('No drivers available');
  }

  logger.info('Driver assigned', {
    driverId: driver.id,
    name: driver.name,
    vehicleId: driver.vehicleId
  });

  return driver;
}

/**
 * Process WMS messages
 */
function processMessage(message) {
  const { type, orderId } = message;

  logger.info('Processing WMS request', {
    type,
    orderId
  });

  switch (type) {
    case 'ASSIGN_WAREHOUSE':
      return handleAssignWarehouse(message);
    
    case 'ASSIGN_DRIVER':
      return handleAssignDriver(message);
    
    case 'UPDATE_STATUS':
      return handleUpdateStatus(message);
    
    default:
      return {
        success: false,
        message: 'Unknown request type'
      };
  }
}

/**
 * Handle warehouse assignment
 */
function handleAssignWarehouse(message) {
  const { orderId, destination } = message;
  
  const warehouse = assignWarehouse(destination);

  assignments.set(orderId, {
    orderId,
    warehouseId: warehouse.id,
    timestamp: new Date().toISOString()
  });

  return {
    success: true,
    orderId,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    location: warehouse.location,
    message: 'Warehouse assigned successfully'
  };
}

/**
 * Handle driver assignment
 */
function handleAssignDriver(message) {
  const { orderId, warehouseId, routeDuration } = message;
  
  const driver = assignDriver(warehouseId);

  // Calculate pickup time (current time + prep time)
  const prepTime = 15 * 60 * 1000; // 15 minutes
  const pickupTime = new Date(Date.now() + prepTime).toISOString();

  // Update driver status
  driver.status = 'assigned';

  // Update assignment
  const assignment = assignments.get(orderId);
  if (assignment) {
    assignment.driverId = driver.id;
    assignment.pickupTime = pickupTime;
  }

  return {
    success: true,
    orderId,
    driverId: driver.id,
    driverName: driver.name,
    driverPhone: driver.phone,
    vehicleId: driver.vehicleId,
    pickupTime,
    message: 'Driver assigned successfully'
  };
}

/**
 * Handle status update
 */
function handleUpdateStatus(message) {
  const { orderId, status } = message;
  
  const assignment = assignments.get(orderId);
  if (assignment) {
    assignment.status = status;
    assignment.updatedAt = new Date().toISOString();
  }

  // If delivered, free up the driver
  if (status === 'DELIVERED') {
    const driver = drivers.find(d => d.id === assignment?.driverId);
    if (driver) {
      driver.status = 'available';
    }
  }

  return {
    success: true,
    orderId,
    status,
    message: 'Status updated successfully'
  };
}

/**
 * TCP Server
 */
const server = net.createServer((socket) => {
  logger.info('Client connected', {
    remoteAddress: socket.remoteAddress,
    remotePort: socket.remotePort
  });

  let buffer = '';

  socket.on('data', (data) => {
    buffer += data.toString();

    // Check if we have a complete message (ends with newline)
    if (buffer.includes('\n')) {
      const messages = buffer.split('\n');
      buffer = messages.pop(); // Keep incomplete message in buffer

      messages.forEach(messageStr => {
        if (messageStr.trim()) {
          try {
            const message = JSON.parse(messageStr);
            
            logger.info('Received message', {
              type: message.type,
              orderId: message.orderId
            });

            const response = processMessage(message);
            
            // Send response
            socket.write(JSON.stringify(response) + '\n');

            logger.info('Response sent', {
              orderId: message.orderId,
              success: response.success
            });

          } catch (error) {
            logger.error('Error processing message', {
              error: error.message,
              message: messageStr
            });

            socket.write(JSON.stringify({
              success: false,
              error: error.message
            }) + '\n');
          }
        }
      });
    }
  });

  socket.on('end', () => {
    logger.info('Client disconnected');
  });

  socket.on('error', (err) => {
    logger.error('Socket error', { error: err.message });
  });
});

server.listen(PORT, () => {
  logger.info(`WMS Mock TCP Server running on port ${PORT}`);
  logger.info(`Warehouses: ${warehouses.length}, Drivers: ${drivers.length}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Shutting down WMS Mock Server...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('Shutting down WMS Mock Server...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = server;
