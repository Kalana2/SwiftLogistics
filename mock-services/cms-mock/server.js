const express = require('express');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
require('dotenv').config();

const { createLogger } = require('../../shared/utils/logger');

const app = express();
const logger = createLogger('cms-mock');

app.use(express.text({ type: 'text/xml' }));
app.use(express.json());

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true
});

// Mock inventory database
const inventory = {
  'PROD001': { available: 100, reserved: 0 },
  'PROD002': { available: 50, reserved: 0 },
  'PROD003': { available: 200, reserved: 0 },
  'PROD004': { available: 0, reserved: 0 }, // Out of stock
};

// Mock confirmed orders
const confirmedOrders = new Map();

/**
 * SOAP endpoint for CMS operations
 */
app.post('/cms/soap', (req, res) => {
  try {
    const xmlBody = req.body;

    logger.info('Received SOAP request', {
      contentLength: xmlBody.length
    });

    // Parse XML
    const parsed = xmlParser.parse(xmlBody);
    const envelope = parsed['soap:Envelope'];
    const body = envelope['soap:Body'];

    let response;

    // Check Inventory Request
    if (body['cms:CheckInventoryRequest']) {
      response = handleCheckInventory(body['cms:CheckInventoryRequest']);
    }
    // Confirm Order Request
    else if (body['cms:ConfirmOrderRequest']) {
      response = handleConfirmOrder(body['cms:ConfirmOrderRequest']);
    }
    // Cancel Order Request
    else if (body['cms:CancelOrderRequest']) {
      response = handleCancelOrder(body['cms:CancelOrderRequest']);
    }
    else {
      response = createErrorResponse('Unknown request type');
    }

    // Build SOAP response
    const xmlResponse = xmlBuilder.build(response);

    logger.info('Sending SOAP response', {
      responseSize: xmlResponse.length
    });

    res.set('Content-Type', 'text/xml; charset=utf-8');
    res.send(xmlResponse);

  } catch (error) {
    logger.error('Error processing SOAP request', {
      error: error.message,
      stack: error.stack
    });

    const errorResponse = createErrorResponse(error.message);
    res.status(500).set('Content-Type', 'text/xml').send(xmlBuilder.build(errorResponse));
  }
});

/**
 * Handle inventory check request
 */
function handleCheckInventory(request) {
  const orderId = request['cms:OrderId'];
  const items = Array.isArray(request['cms:Items']['cms:Item'])
    ? request['cms:Items']['cms:Item']
    : [request['cms:Items']['cms:Item']];

  logger.info('Checking inventory', {
    orderId,
    itemCount: items.length
  });

  // Check if all items are available
  let allAvailable = true;
  const itemStatuses = items.map(item => {
    const sku = item['cms:SKU'];
    const quantity = parseInt(item['cms:Quantity']);
    const inv = inventory[sku];

    const available = inv && (inv.available >= quantity);
    if (!available) allAvailable = false;

    return {
      'cms:SKU': sku,
      'cms:RequestedQuantity': quantity,
      'cms:Available': available ? 'true' : 'false',
      'cms:AvailableStock': inv?.available || 0
    };
  });

  return {
    'soap:Envelope': {
      '@_xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/',
      '@_xmlns:cms': 'http://swifttrack.com/cms/2026',
      'soap:Body': {
        'cms:CheckInventoryResponse': {
          'cms:OrderId': orderId,
          'cms:Available': allAvailable ? 'true' : 'false',
          'cms:Message': allAvailable ? 'All items available' : 'Some items out of stock',
          'cms:ItemStatus': {
            'cms:Item': itemStatuses
          }
        }
      }
    }
  };
}

/**
 * Handle order confirmation request
 */
function handleConfirmOrder(request) {
  const orderId = request['cms:OrderId'];
  const customerId = request['cms:CustomerId'];
  const totalAmount = request['cms:TotalAmount'];
  const items = Array.isArray(request['cms:Items']['cms:Item'])
    ? request['cms:Items']['cms:Item']
    : [request['cms:Items']['cms:Item']];

  logger.info('Confirming order', {
    orderId,
    customerId,
    totalAmount,
    itemCount: items.length
  });

  // Reserve inventory
  items.forEach(item => {
    const sku = item['cms:SKU'];
    const quantity = parseInt(item['cms:Quantity']);

    if (inventory[sku]) {
      inventory[sku].available -= quantity;
      inventory[sku].reserved += quantity;
    }
  });

  // Generate CMS reference
  const cmsReference = `CMS_${Date.now()}_${orderId}`;

  // Store confirmed order
  confirmedOrders.set(orderId, {
    cmsReference,
    customerId,
    totalAmount,
    items,
    confirmedAt: new Date().toISOString()
  });

  logger.info('Order confirmed in CMS', {
    orderId,
    cmsReference
  });

  return {
    'soap:Envelope': {
      '@_xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/',
      '@_xmlns:cms': 'http://swifttrack.com/cms/2026',
      'soap:Body': {
        'cms:ConfirmOrderResponse': {
          'cms:Status': 'SUCCESS',
          'cms:OrderId': orderId,
          'cms:ReferenceId': cmsReference,
          'cms:Message': 'Order confirmed successfully',
          'cms:Timestamp': new Date().toISOString()
        }
      }
    }
  };
}

/**
 * Handle order cancellation request (Saga compensating transaction)
 */
function handleCancelOrder(request) {
  const orderId = request['cms:OrderId'];
  const reason = request['cms:Reason'];

  logger.info('Cancelling order', {
    orderId,
    reason
  });

  // Release reserved inventory
  const order = confirmedOrders.get(orderId);
  if (order) {
    order.items.forEach(item => {
      const sku = item['cms:SKU'];
      const quantity = parseInt(item['cms:Quantity']);

      if (inventory[sku]) {
        inventory[sku].available += quantity;
        inventory[sku].reserved -= quantity;
      }
    });

    confirmedOrders.delete(orderId);
  }

  return {
    'soap:Envelope': {
      '@_xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/',
      '@_xmlns:cms': 'http://swifttrack.com/cms/2026',
      'soap:Body': {
        'cms:CancelOrderResponse': {
          'cms:Status': 'SUCCESS',
          'cms:OrderId': orderId,
          'cms:Message': 'Order cancelled successfully',
          'cms:Timestamp': new Date().toISOString()
        }
      }
    }
  };
}

/**
 * Create SOAP error response
 */
function createErrorResponse(message) {
  return {
    'soap:Envelope': {
      '@_xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/',
      'soap:Body': {
        'soap:Fault': {
          'faultcode': 'soap:Server',
          'faultstring': message
        }
      }
    }
  };
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'cms-mock',
    timestamp: new Date().toISOString(),
    inventory: Object.keys(inventory).length,
    confirmedOrders: confirmedOrders.size
  });
});

// View inventory (for debugging)
app.get('/inventory', (req, res) => {
  res.json({
    inventory,
    confirmedOrders: Array.from(confirmedOrders.entries()).map(([orderId, order]) => ({
      orderId,
      ...order
    }))
  });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  logger.info(`CMS Mock SOAP Service running on port ${PORT}`);
  logger.info(`SOAP endpoint: http://localhost:${PORT}/cms/soap`);
});

module.exports = app;
