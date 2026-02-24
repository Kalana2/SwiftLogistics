const axios = require('axios');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('cms-soap-client');

class CMSClient {
  constructor(soapUrl = process.env.CMS_SOAP_URL) {
    this.soapUrl = soapUrl;
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
    this.xmlBuilder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: true
    });
  }

  /**
   * Create SOAP envelope for inventory check
   */
  createInventoryCheckEnvelope(orderId, items) {
    const envelope = {
      'soap:Envelope': {
        '@_xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/',
        '@_xmlns:cms': 'http://swifttrack.com/cms/2026',
        'soap:Header': {},
        'soap:Body': {
          'cms:CheckInventoryRequest': {
            'cms:OrderId': orderId,
            'cms:Items': {
              'cms:Item': items.map(item => ({
                'cms:SKU': item.sku,
                'cms:Quantity': item.quantity,
                'cms:Name': item.name || item.sku
              }))
            }
          }
        }
      }
    };

    return this.xmlBuilder.build(envelope);
  }

  /**
   * Create SOAP envelope for order confirmation
   */
  createOrderConfirmationEnvelope(orderId, customerId, items, totalAmount) {
    const envelope = {
      'soap:Envelope': {
        '@_xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/',
        '@_xmlns:cms': 'http://swifttrack.com/cms/2026',
        'soap:Header': {
          'cms:Authentication': {
            'cms:ApiKey': 'SWIFTTRACK_CMS_KEY_2026'
          }
        },
        'soap:Body': {
          'cms:ConfirmOrderRequest': {
            'cms:OrderId': orderId,
            'cms:CustomerId': customerId,
            'cms:TotalAmount': totalAmount,
            'cms:Items': {
              'cms:Item': items.map(item => ({
                'cms:SKU': item.sku,
                'cms:Name': item.name || item.sku,
                'cms:Quantity': item.quantity,
                'cms:Price': item.price
              }))
            },
            'cms:Timestamp': new Date().toISOString()
          }
        }
      }
    };

    return this.xmlBuilder.build(envelope);
  }

  /**
   * Send SOAP request
   */
  async sendSOAPRequest(xmlEnvelope) {
    try {
      logger.info('Sending SOAP request to CMS', {
        url: this.soapUrl,
        envelopeSize: xmlEnvelope.length
      });

      const response = await axios.post(this.soapUrl, xmlEnvelope, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'http://swifttrack.com/cms/2026/ProcessOrder'
        },
        timeout: 10000
      });

      logger.info('Received SOAP response from CMS', {
        status: response.status
      });

      return this.xmlParser.parse(response.data);

    } catch (error) {
      logger.error('SOAP request failed', {
        error: error.message,
        url: this.soapUrl
      });
      throw error;
    }
  }

  /**
   * Check inventory availability
   */
  async checkInventory(orderId, items) {
    const envelope = this.createInventoryCheckEnvelope(orderId, items);
    const response = await this.sendSOAPRequest(envelope);

    // Parse response
    const body = response['soap:Envelope']?.['soap:Body'];
    const result = body?.['cms:CheckInventoryResponse'];

    return {
      available: result?.['cms:Available'] === 'true',
      items: result?.['cms:ItemStatus']?.['cms:Item'] || [],
      message: result?.['cms:Message']
    };
  }

  /**
   * Confirm order in CMS
   */
  async confirmOrder(orderId, customerId, items, totalAmount) {
    const envelope = this.createOrderConfirmationEnvelope(
      orderId,
      customerId,
      items,
      totalAmount
    );
    
    const response = await this.sendSOAPRequest(envelope);

    // Parse response
    const body = response['soap:Envelope']?.['soap:Body'];
    const result = body?.['cms:ConfirmOrderResponse'];

    return {
      success: result?.['cms:Status'] === 'SUCCESS',
      cmsReference: result?.['cms:ReferenceId'],
      message: result?.['cms:Message'],
      timestamp: result?.['cms:Timestamp']
    };
  }

  /**
   * Cancel order in CMS (compensating transaction for Saga pattern)
   */
  async cancelOrder(orderId, reason) {
    const envelope = {
      'soap:Envelope': {
        '@_xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/',
        '@_xmlns:cms': 'http://swifttrack.com/cms/2026',
        'soap:Header': {},
        'soap:Body': {
          'cms:CancelOrderRequest': {
            'cms:OrderId': orderId,
            'cms:Reason': reason,
            'cms:Timestamp': new Date().toISOString()
          }
        }
      }
    };

    const xmlEnvelope = this.xmlBuilder.build(envelope);
    const response = await this.sendSOAPRequest(xmlEnvelope);

    const body = response['soap:Envelope']?.['soap:Body'];
    const result = body?.['cms:CancelOrderResponse'];

    return {
      success: result?.['cms:Status'] === 'SUCCESS',
      message: result?.['cms:Message']
    };
  }
}

module.exports = CMSClient;
