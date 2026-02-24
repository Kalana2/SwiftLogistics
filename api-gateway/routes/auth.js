const express = require('express');
const { body, validationResult } = require('express-validator');
const { JWTManager } = require('../../shared/utils/jwt');

const router = express.Router();
const jwtManager = new JWTManager();

// Mock user database (in production, this would be a real database)
const users = [
  {
    id: 'user_001',
    username: 'client@swifttrack.com',
    password: 'client123', // In production: hashed password
    role: 'client',
    customerId: 'CUST001'
  },
  {
    id: 'user_002',
    username: 'driver@swifttrack.com',
    password: 'driver123',
    role: 'driver',
    driverId: 'DRV001'
  },
  {
    id: 'user_003',
    username: 'admin@swifttrack.com',
    password: 'admin123',
    role: 'admin'
  }
];

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and return JWT token
 * @access  Public
 */
router.post('/login',
  [
    body('username').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { username, password } = req.body;

    // Find user
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwtManager.generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      customerId: user.customerId,
      driverId: user.driverId
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  }
);

/**
 * @route   POST /api/auth/register
 * @desc    Register new user
 * @access  Public
 */
router.post('/register',
  [
    body('username').isEmail(),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['client', 'driver'])
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { username, password, role } = req.body;

    // Check if user exists
    if (users.find(u => u.username === username)) {
      return res.status(409).json({
        success: false,
        error: 'User already exists'
      });
    }

    // Create new user
    const newUser = {
      id: `user_${Date.now()}`,
      username,
      password, // In production: hash this!
      role,
      customerId: role === 'client' ? `CUST_${Date.now()}` : undefined,
      driverId: role === 'driver' ? `DRV_${Date.now()}` : undefined
    };

    users.push(newUser);

    const token = jwtManager.generateToken({
      userId: newUser.id,
      username: newUser.username,
      role: newUser.role,
      customerId: newUser.customerId,
      driverId: newUser.driverId
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role
      }
    });
  }
);

module.exports = router;
