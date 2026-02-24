// Mock API — simulates the backend so the UI works standalone
// Used when the real backend (API Gateway on port 3000) is unavailable

const MOCK_USERS = [
    {
        id: 'USR001',
        username: 'client@swifttrack.com',
        password: 'client123',
        role: 'client',
        customerId: 'CUST001'
    },
    {
        id: 'USR002',
        username: 'driver@swifttrack.com',
        password: 'driver123',
        role: 'driver',
        driverId: 'DRV001'
    },
    {
        id: 'USR003',
        username: 'admin@swifttrack.com',
        password: 'admin123',
        role: 'admin',
        customerId: 'ADMIN001'
    }
];

let mockOrders = [
    {
        orderId: 'ORD-2026-0001',
        customerId: 'CUST001',
        items: [
            { sku: 'PROD001', name: 'Wireless Headphones', quantity: 2, price: 4500.00 },
            { sku: 'PROD002', name: 'USB-C Cable', quantity: 5, price: 350.00 }
        ],
        deliveryAddress: {
            street: '42 Galle Road',
            city: 'Colombo',
            state: 'Western',
            zip: '00300'
        },
        status: 'DELIVERED',
        totalAmount: 10750.00,
        createdAt: '2026-02-20T08:30:00Z',
        metadata: {
            cmsReference: 'CMS_1740048600_ORD-2026-0001',
            routeId: 'ROUTE_MOCK_1740048700',
            warehouseId: 'WH_CMB_001',
            driverId: 'DRV001',
            estimatedDelivery: '2026-02-20T14:00:00Z'
        },
        statusHistory: [
            { status: 'RECEIVED', timestamp: '2026-02-20T08:30:00Z', message: 'Order received', source: 'api-gateway' },
            { status: 'CMS_CONFIRMED', timestamp: '2026-02-20T08:31:00Z', message: 'Inventory reserved', source: 'cms-adapter' },
            { status: 'ROUTE_CALCULATED', timestamp: '2026-02-20T08:32:00Z', message: 'Route optimized: 12.5 km', source: 'ros-adapter' },
            { status: 'WMS_ASSIGNED', timestamp: '2026-02-20T08:33:00Z', message: 'Driver John Smith assigned', source: 'wms-adapter' },
            { status: 'IN_TRANSIT', timestamp: '2026-02-20T09:00:00Z', message: 'Package picked up', source: 'driver' },
            { status: 'DELIVERED', timestamp: '2026-02-20T10:15:00Z', message: 'Delivered successfully', source: 'driver' }
        ]
    },
    {
        orderId: 'ORD-2026-0002',
        customerId: 'CUST001',
        items: [
            { sku: 'PROD003', name: 'Laptop Stand', quantity: 1, price: 8500.00 }
        ],
        deliveryAddress: {
            street: '15 Flower Road',
            city: 'Colombo',
            state: 'Western',
            zip: '00700'
        },
        status: 'IN_TRANSIT',
        totalAmount: 8500.00,
        createdAt: '2026-02-24T06:15:00Z',
        metadata: {
            cmsReference: 'CMS_1740393300_ORD-2026-0002',
            routeId: 'ROUTE_MOCK_1740393400',
            warehouseId: 'WH_CMB_001',
            driverId: 'DRV002',
            estimatedDelivery: '2026-02-24T13:00:00Z'
        },
        statusHistory: [
            { status: 'RECEIVED', timestamp: '2026-02-24T06:15:00Z', message: 'Order received', source: 'api-gateway' },
            { status: 'CMS_CONFIRMED', timestamp: '2026-02-24T06:16:00Z', message: 'Inventory reserved', source: 'cms-adapter' },
            { status: 'ROUTE_CALCULATED', timestamp: '2026-02-24T06:17:00Z', message: 'Route optimized: 8.2 km', source: 'ros-adapter' },
            { status: 'WMS_ASSIGNED', timestamp: '2026-02-24T06:18:00Z', message: 'Driver Sarah Johnson assigned', source: 'wms-adapter' },
            { status: 'IN_TRANSIT', timestamp: '2026-02-24T07:00:00Z', message: 'Package picked up', source: 'driver' }
        ]
    },
    {
        orderId: 'ORD-2026-0003',
        customerId: 'CUST001',
        items: [
            { sku: 'PROD001', name: 'Wireless Headphones', quantity: 1, price: 4500.00 },
            { sku: 'PROD003', name: 'Laptop Stand', quantity: 2, price: 8500.00 }
        ],
        deliveryAddress: {
            street: '88 Duplication Road',
            city: 'Colombo',
            state: 'Western',
            zip: '00400'
        },
        status: 'PROCESSING',
        totalAmount: 21500.00,
        createdAt: '2026-02-24T10:00:00Z',
        metadata: {},
        statusHistory: [
            { status: 'RECEIVED', timestamp: '2026-02-24T10:00:00Z', message: 'Order received', source: 'api-gateway' },
            { status: 'PROCESSING', timestamp: '2026-02-24T10:01:00Z', message: 'Processing through adapters', source: 'orchestrator' }
        ]
    }
];

let mockDriverDeliveries = [
    {
        orderId: 'ORD-2026-0002',
        items: [{ sku: 'PROD003', name: 'Laptop Stand', quantity: 1, price: 8500.00 }],
        deliveryAddress: { street: '15 Flower Road', city: 'Colombo', state: 'Western', zip: '00700' },
        status: 'IN_TRANSIT',
        estimatedDelivery: '2026-02-24T13:00:00Z'
    },
    {
        orderId: 'ORD-2026-0004',
        items: [{ sku: 'PROD002', name: 'USB-C Cable', quantity: 10, price: 350.00 }],
        deliveryAddress: { street: '7 Marine Drive', city: 'Colombo', state: 'Western', zip: '00300' },
        status: 'WMS_ASSIGNED',
        estimatedDelivery: '2026-02-24T15:30:00Z'
    }
];

let orderCounter = 3;

function generateToken() {
    return 'mock_jwt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 12);
}

// ----- Mock API handlers -----

export function mockLogin(username, password) {
    const user = MOCK_USERS.find(u => u.username === username && u.password === password);
    if (!user) {
        return { ok: false, status: 401, data: { error: 'Invalid email or password' } };
    }
    return {
        ok: true,
        status: 200,
        data: {
            success: true,
            token: generateToken(),
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                customerId: user.customerId,
                driverId: user.driverId
            }
        }
    };
}

export function mockGetOrders() {
    return {
        ok: true,
        status: 200,
        data: { success: true, data: { data: mockOrders } }
    };
}

export function mockGetOrder(orderId) {
    const order = mockOrders.find(o => o.orderId === orderId);
    if (!order) {
        return { ok: false, status: 404, data: { error: 'Order not found' } };
    }
    return { ok: true, status: 200, data: { success: true, data: order } };
}

export function mockCreateOrder(orderData) {
    orderCounter++;
    const orderId = `ORD-2026-${String(orderCounter).padStart(4, '0')}`;
    const now = new Date().toISOString();

    const newOrder = {
        orderId,
        customerId: 'CUST001',
        items: orderData.items,
        deliveryAddress: orderData.deliveryAddress,
        status: 'RECEIVED',
        totalAmount: orderData.items.reduce((s, i) => s + i.price * i.quantity, 0),
        createdAt: now,
        metadata: {},
        statusHistory: [
            { status: 'RECEIVED', timestamp: now, message: 'Order received', source: 'api-gateway' }
        ]
    };

    mockOrders.unshift(newOrder);

    // Simulate processing pipeline after 2s
    setTimeout(() => {
        newOrder.status = 'CMS_CONFIRMED';
        newOrder.statusHistory.push({ status: 'CMS_CONFIRMED', timestamp: new Date().toISOString(), message: 'Inventory reserved', source: 'cms-adapter' });
        document.dispatchEvent(new CustomEvent('swifttrack:order-update', { detail: { orderId, status: 'CMS_CONFIRMED', message: 'Inventory reserved' } }));
    }, 2000);

    setTimeout(() => {
        newOrder.status = 'ROUTE_CALCULATED';
        newOrder.statusHistory.push({ status: 'ROUTE_CALCULATED', timestamp: new Date().toISOString(), message: 'Route optimized: 15.3 km', source: 'ros-adapter' });
        document.dispatchEvent(new CustomEvent('swifttrack:order-update', { detail: { orderId, status: 'ROUTE_CALCULATED', message: 'Route optimized' } }));
    }, 4000);

    setTimeout(() => {
        newOrder.status = 'WMS_ASSIGNED';
        newOrder.statusHistory.push({ status: 'WMS_ASSIGNED', timestamp: new Date().toISOString(), message: 'Driver Mike Davis assigned', source: 'wms-adapter' });
        document.dispatchEvent(new CustomEvent('swifttrack:order-update', { detail: { orderId, status: 'WMS_ASSIGNED', message: 'Driver assigned' } }));
    }, 6000);

    return {
        ok: true,
        status: 202,
        data: { success: true, message: 'Order submitted', data: { orderId } }
    };
}

export function mockGetManifest() {
    return {
        ok: true,
        status: 200,
        data: {
            success: true,
            data: {
                driverId: 'DRV001',
                deliveryCount: mockDriverDeliveries.length,
                deliveries: mockDriverDeliveries
            }
        }
    };
}

export function mockUpdateDeliveryStatus(orderId, status, notes) {
    const delivery = mockDriverDeliveries.find(d => d.orderId === orderId);
    if (delivery) {
        delivery.status = status;
    }
    const order = mockOrders.find(o => o.orderId === orderId);
    if (order) {
        order.status = status;
        order.statusHistory.push({
            status,
            timestamp: new Date().toISOString(),
            message: notes || `Status changed to ${status}`,
            source: 'driver'
        });
    }
    return { ok: true, status: 200, data: { success: true, message: 'Status updated' } };
}
