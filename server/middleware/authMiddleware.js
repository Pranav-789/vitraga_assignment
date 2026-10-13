import jwt from 'jsonwebtoken';

/**
 * Authentication middleware that verifies JWT and attaches req.user
 * Returns 401 Unauthorized if token is missing, invalid, or expired.
 */
export const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Authentication token is required' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Malformed authorization header' });
    }

    const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_travel_orchestrator_2026';
    const decoded = jwt.verify(token, secret);

    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
    }

    req.user = {
      userId: decoded.userId
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized: Token has expired' });
    }
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

/**
 * Optional authentication middleware:
 * Attaches req.user if a valid token is provided, but allows requests without tokens.
 */
export const optionalAuthMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token) {
        const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_travel_orchestrator_2026';
        const decoded = jwt.verify(token, secret);
        if (decoded && decoded.userId) {
          req.user = { userId: decoded.userId };
        }
      }
    }
  } catch (err) {
    // Silently ignore for optional auth
    req.user = null;
  }
  next();
};

export default authMiddleware;
