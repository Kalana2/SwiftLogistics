const jwt = require('jsonwebtoken');

class JWTManager {
  constructor(secret = process.env.JWT_SECRET || 'swifttrack-secret-key-2026') {
    this.secret = secret;
    this.expiresIn = '24h';
  }

  generateToken(payload) {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn });
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.secret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  extractTokenFromHeader(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('No token provided');
    }
    return authHeader.substring(7);
  }
}

// Middleware for Express
function authenticateJWT(req, res, next) {
  try {
    const jwtManager = new JWTManager();
    const token = jwtManager.extractTokenFromHeader(req.headers.authorization);
    const decoded = jwtManager.verifyToken(token);
    
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: error.message
    });
  }
}

module.exports = {
  JWTManager,
  authenticateJWT
};
