import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User, Trip } from '../models/index.js';

dotenv.config();

const BASE_URL = 'http://127.0.0.1:8000/api';

async function req(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, data };
}

async function runTests() {
  console.log('=== STARTING TEST SUITE ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  const randomSuffix = Math.floor(Math.random() * 100000);
  const userAData = {
    username: `userA_${randomSuffix}`,
    email: `usera_${randomSuffix}@example.com`,
    password: 'password123'
  };

  const userBData = {
    username: `userB_${randomSuffix}`,
    email: `userb_${randomSuffix}@example.com`,
    password: 'password456'
  };

  let tokenA = '';
  let userAId = '';
  let tokenB = '';
  let userBId = '';
  let tripAId = '';

  // 1. Register User A
  try {
    const res = await req(`${BASE_URL}/auth/register`, {
      method: 'POST',
      body: JSON.stringify(userAData)
    });
    assert(res.status === 201 && res.data.token && res.data.user.email === userAData.email, 'Register new user A');
    assert(!res.data.user.password && !res.data.password, 'Register does not return password');
    tokenA = res.data.token;
    userAId = res.data.user.id;
  } catch (err) {
    assert(false, `Register new user A: ${err.message}`);
  }

  // 2. Attempt duplicate email
  try {
    const res = await req(`${BASE_URL}/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        username: `different_${randomSuffix}`,
        email: userAData.email,
        password: 'password123'
      })
    });
    assert(res.status === 409, 'Attempt duplicate email rejected with 409');
  } catch (err) {
    assert(false, `Attempt duplicate email: ${err.message}`);
  }

  // 3. Attempt duplicate username
  try {
    const res = await req(`${BASE_URL}/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        username: userAData.username,
        email: `different_${randomSuffix}@example.com`,
        password: 'password123'
      })
    });
    assert(res.status === 409, 'Attempt duplicate username rejected with 409');
  } catch (err) {
    assert(false, `Attempt duplicate username: ${err.message}`);
  }

  // 4. Login with correct password
  try {
    const res = await req(`${BASE_URL}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: userAData.email,
        password: userAData.password
      })
    });
    assert(res.status === 200 && res.data.token && res.data.user.id === userAId, 'Login with correct password returns token');
  } catch (err) {
    assert(false, `Login with correct password: ${err.message}`);
  }

  // 5. Login with incorrect password
  try {
    const res = await req(`${BASE_URL}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: userAData.email,
        password: 'wrongpassword'
      })
    });
    assert(res.status === 401, 'Login with incorrect password rejected with 401');
  } catch (err) {
    assert(false, `Login with incorrect password: ${err.message}`);
  }

  // 6. Access protected route without JWT
  try {
    const res = await req(`${BASE_URL}/trips`, { method: 'GET' });
    assert(res.status === 401, 'Access protected route without JWT rejected with 401');
  } catch (err) {
    assert(false, `Access protected route without JWT: ${err.message}`);
  }

  // 7. Access protected route with invalid JWT
  try {
    const res = await req(`${BASE_URL}/trips`, {
      method: 'GET',
      headers: { Authorization: 'Bearer invalid_token_xyz' }
    });
    assert(res.status === 401, 'Access protected route with invalid JWT rejected with 401');
  } catch (err) {
    assert(false, `Access protected route with invalid JWT: ${err.message}`);
  }

  // 8. Access protected route with valid JWT
  try {
    const res = await req(`${BASE_URL}/trips`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(res.status === 200 && Array.isArray(res.data), 'Access protected route with valid JWT succeeds');
  } catch (err) {
    assert(false, `Access protected route with valid JWT: ${err.message}`);
  }

  // Register User B for ownership isolation tests
  try {
    const res = await req(`${BASE_URL}/auth/register`, {
      method: 'POST',
      body: JSON.stringify(userBData)
    });
    assert(res.status === 201 && res.data.token, 'Register user B succeeds');
    tokenB = res.data.token;
    userBId = res.data.user.id;
  } catch (err) {
    assert(false, `Register user B: ${err.message}`);
  }

  // 9. Create trip as User A
  try {
    const tripPayload = {
      destination: 'Kyoto, Japan',
      budget: '$2500',
      duration: '4 days',
      travellers: 2,
      leadScore: 80,
      confidence: 'High',
      leadReason: 'High intent booking test'
    };
    const res = await req(`${BASE_URL}/trips`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify(tripPayload)
    });
    assert(res.status === 201 && res.data.tripId && res.data.destination === 'Kyoto, Japan', 'Create trip as User A');
    assert(res.data.userId === userAId, 'Trip.userId is strictly set to authenticated user ID');
    tripAId = res.data.tripId;
  } catch (err) {
    assert(false, `Create trip as User A: ${err.message}`);
  }

  // 10. Get own trips as User A
  try {
    const res = await req(`${BASE_URL}/trips`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(res.status === 200 && res.data.some(t => t.tripId === tripAId), 'Get own trips lists created trip');
  } catch (err) {
    assert(false, `Get own trips: ${err.message}`);
  }

  // 11. Get own trip by ID
  try {
    const res = await req(`${BASE_URL}/trips/${tripAId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(res.status === 200 && res.data.tripId === tripAId, 'Get own trip by ID');
  } catch (err) {
    assert(false, `Get own trip by ID: ${err.message}`);
  }

  // 12. Update own trip
  try {
    const res = await req(`${BASE_URL}/trips/${tripAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        budget: '$3200',
        status: 'validated'
      })
    });
    assert(res.status === 200 && res.data.budget === '$3200' && res.data.status === 'validated', 'Update own trip');
  } catch (err) {
    assert(false, `Update own trip: ${err.message}`);
  }

  // 13. Attempt to access User A's trip as User B
  try {
    const res = await req(`${BASE_URL}/trips/${tripAId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert(res.status === 404, 'User B accessing User A trip blocked with 404');
  } catch (err) {
    assert(false, `User B accessing User A trip: ${err.message}`);
  }

  // 14. Attempt to update User A's trip as User B
  try {
    const res = await req(`${BASE_URL}/trips/${tripAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ destination: 'Hacked Destination' })
    });
    assert(res.status === 404, 'User B updating User A trip blocked with 404');
  } catch (err) {
    assert(false, `User B updating User A trip: ${err.message}`);
  }

  // 15. Attempt to delete User A's trip as User B
  try {
    const res = await req(`${BASE_URL}/trips/${tripAId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert(res.status === 404, 'User B deleting User A trip blocked with 404');
  } catch (err) {
    assert(false, `User B deleting User A trip: ${err.message}`);
  }

  // 16. Delete own trip as User A
  try {
    const res = await req(`${BASE_URL}/trips/${tripAId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(res.status === 200 && res.data.tripId === tripAId, 'Delete own trip as User A');
  } catch (err) {
    assert(false, `Delete own trip: ${err.message}`);
  }

  // 17. Verify Data Separation in MongoDB
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const dbUser = await User.findById(userAId).lean();
    const userKeys = Object.keys(dbUser);
    const forbiddenKeys = ['destination', 'budget', 'leadScore', 'travelConstraints', 'dailyPlans', 'status', 'consentGiven'];
    const hasForbidden = forbiddenKeys.some(k => userKeys.includes(k));
    assert(!hasForbidden, 'User schema contains ONLY account info and NO trip/lead fields');

    // Create a new Trip to verify all schema fields
    const newTrip = new Trip({
      tripId: `test_sep_${randomSuffix}`,
      userId: userAId,
      destination: 'Tokyo',
      leadScore: 90,
      confidence: 'High',
      leadReason: 'Separation test',
      status: 'planning',
      dailyPlans: []
    });
    await newTrip.save();

    const savedTrip = await Trip.findOne({ tripId: `test_sep_${randomSuffix}` }).lean();
    assert(savedTrip && savedTrip.leadScore === 90 && savedTrip.destination === 'Tokyo', 'Trip schema contains all travel constraints, lead info, and planning state');
    await Trip.deleteOne({ tripId: `test_sep_${randomSuffix}` });
    await mongoose.disconnect();
  } catch (err) {
    assert(false, `Data separation verification: ${err.message}`);
  }

  console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
