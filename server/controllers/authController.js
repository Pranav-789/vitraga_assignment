import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Generates JWT token with user ID payload
 */
const generateToken = (userId) => {
  const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_travel_orchestrator_2026';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign({ userId }, secret, { expiresIn });
};

/**
 * POST /api/auth/register
 * Registers a new user, hashes password, and returns JWT with user info.
 */
export const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 1. Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (trimmedUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // 2. Validate email format
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // 3. Ensure username is unique
    const existingUsername = await User.findOne({ username: trimmedUsername });
    if (existingUsername) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    // 4. Ensure email is unique
    const existingEmail = await User.findOne({ email: trimmedEmail });
    if (existingEmail) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // 5-7. Create user (password is automatically hashed via pre-save hook)
    const newUser = new User({
      username: trimmedUsername,
      email: trimmedEmail,
      password: password
    });

    await newUser.save();

    // 8. Generate JWT and return safe user info
    const token = generateToken(newUser._id);

    return res.status(201).json({
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'An error occurred during registration' });
  }
};

/**
 * POST /api/auth/login
 * Authenticates user credentials and returns JWT with user info.
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 2. Find user by email
    const user = await User.findOne({ email: trimmedEmail });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // 3. Compare password using bcrypt
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // 4. Generate JWT
    const token = generateToken(user._id);

    // 5. Return token and basic user info (never password)
    return res.status(200).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'An error occurred during login' });
  }
};
