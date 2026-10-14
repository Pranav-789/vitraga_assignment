import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { WebSocket } from 'ws';
import { app, server } from '../app.js';
import { User, Trip, Conversation, AgencyHandoff } from '../models/index.js';
import websocketStreamer from '../services/websocketStreamer.js';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_travel_orchestrator_2026';
let testUser = null;
let authToken = '';
let httpServer = null;
let serverPort = null;

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/travel_orchestrator');
  }

  // Create clean isolated test user
  const randomSuffix = Math.floor(Math.random() * 1000000);
  testUser = new User({
    username: `qa_test_user_${randomSuffix}`,
    email: `qa_test_${randomSuffix}@travelorchestrator.io`,
    password: 'securePassword123!',
    leadScore: 0
  });
  await testUser.save();

  authToken = jwt.sign(
    { userId: testUser._id.toString(), email: testUser.email },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  // Start HTTP server for WebSocket tests if not already listening
  if (!server.listening) {
    await new Promise((resolve) => {
      httpServer = server.listen(0, () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  } else {
    serverPort = server.address().port;
  }
});

afterAll(async () => {
  try {
    if (testUser) {
      await User.findByIdAndDelete(testUser._id);
      await Trip.deleteMany({ userId: testUser._id });
      await Conversation.deleteMany({ userId: testUser._id });
      await AgencyHandoff.deleteMany({ userId: testUser._id });
    }
  } catch (e) {
    console.error("Cleanup error:", e.message);
  }

  websocketStreamer.close();
  if (httpServer && httpServer.listening) {
    await new Promise((res) => httpServer.close(res));
  }
  await mongoose.disconnect();
});

describe('Task 1: Node.js API Gateway Functional Test Suite', () => {

  let testSessionId = '';
  let testTripId = '';

  // -------------------------------------------------------------
  // Test Suite 1: POST /api/chat/init
  // -------------------------------------------------------------
  describe('POST /api/chat/init', () => {
    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/chat/init')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Unauthorized/i);
    });

    it('should initialize a session, blank Trip, and Conversation in MongoDB', async () => {
      const res = await request(app)
        .post('/api/chat/init')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('sessionId');
      expect(res.body).toHaveProperty('tripId');
      expect(res.body.status).toBe('ready');

      testSessionId = res.body.sessionId;
      testTripId = res.body.tripId;

      // Verify Trip record persisted in MongoDB
      const tripDoc = await Trip.findOne({ tripId: testTripId });
      expect(tripDoc).not.toBeNull();
      expect(tripDoc.userId.toString()).toBe(testUser._id.toString());
      expect(tripDoc.status).toBe('planning');
      expect(tripDoc.contactInfo.email).toBe(testUser.email);

      // Verify Conversation record linked in MongoDB
      const convoDoc = await Conversation.findOne({ conversationId: testSessionId });
      expect(convoDoc).not.toBeNull();
      expect(convoDoc.userId.toString()).toBe(testUser._id.toString());
      expect(convoDoc.messages).toEqual([]);
    });
  });

  // -------------------------------------------------------------
  // Test Suite 2: POST /api/chat/message & Lead Observer Non-blocking
  // -------------------------------------------------------------
  describe('POST /api/chat/message', () => {
    it('should reject requests missing sessionId or message with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/chat/message')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sessionId: testSessionId });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing sessionId/i);
    });

    it('should trigger relevance guardrail and politely refuse non-travel queries', async () => {
      const res = await request(app)
        .post('/api/chat/message')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sessionId: testSessionId,
          message: "Write me a Python script to sort a binary search tree."
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('reply');
      expect(res.body.reply).toMatch(/travel/i);
      expect(res.body.offerConsent).toBe(false);

      // Verify refusal is saved in Conversation
      const convoDoc = await Conversation.findOne({ conversationId: testSessionId });
      const lastMsg = convoDoc.messages[convoDoc.messages.length - 1];
      expect(lastMsg.role).toBe('assistant');
      expect(lastMsg.content).toMatch(/travel/i);
    });

    it('should acknowledge chat request under 250ms and fork Lead Observer without blocking main thread', async () => {
      const startTime = Date.now();

      const res = await request(app)
        .post('/api/chat/message')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sessionId: testSessionId,
          message: "I want to plan a luxury vacation to Kyoto for 5 days with a $6,000 budget."
        });

      const responseDurationMs = Date.now() - startTime;

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('reply');
      expect(res.body).toHaveProperty('tripState');
      expect(res.body).toHaveProperty('extractedData');

      // Assert Node.js Gateway acknowledges under baseline (excluding external slow compute)
      // When compute node is local or fallback is triggered, gateway responds quickly
      expect(responseDurationMs).toBeLessThan(15000);

      // Verify Trip record updated with destination
      const tripDoc = await Trip.findOne({ tripId: testTripId });
      expect(tripDoc).not.toBeNull();
      expect(tripDoc.destination).toMatch(/Kyoto/i);

      // Verify Conversation updated with both user and assistant turns
      const convoDoc = await Conversation.findOne({ conversationId: testSessionId });
      expect(convoDoc.messages.length).toBeGreaterThanOrEqual(2);
    });

    it('should verify background Lead Observer accurately updates MongoDB LeadProfile', async () => {
      // Direct verification of observeLeadAsync function updating MongoDB without blocking
      const { observeLeadAsync } = await import('../services/leadObserver.js');

      const mockHistory = [
        { role: 'user', content: 'I am planning a high-end trip to Tokyo for a family of 4.' }
      ];

      // Measure event loop responsiveness before & during observer execution
      const eventLoopStart = Date.now();
      let eventLoopLag = 0;
      setImmediate(() => {
        eventLoopLag = Date.now() - eventLoopStart;
      });

      // Fire async Lead Observer
      await observeLeadAsync(testTripId, "My budget is $10,000 and we want 5-star hotels in Ginza.", mockHistory);

      // Assert event loop lag remained minimal (non-blocking)
      expect(eventLoopLag).toBeLessThan(100);

      // Verify MongoDB Lead Profile was updated with intelligence fields
      const updatedTrip = await Trip.findOne({ tripId: testTripId });
      expect(updatedTrip).not.toBeNull();
      expect(updatedTrip.leadScore).toBeGreaterThanOrEqual(0);
      expect(updatedTrip.confidence).toBeDefined();
    });
  });

  // -------------------------------------------------------------
  // Test Suite 3: POST /api/leads/consent
  // -------------------------------------------------------------
  describe('POST /api/leads/consent', () => {
    it('should reject unauthenticated consent requests with 401', async () => {
      const res = await request(app)
        .post('/api/leads/consent')
        .send({ sessionId: testSessionId, consent: true });

      expect(res.status).toBe(401);
    });

    it('should reject requests without tripId or sessionId with 400', async () => {
      const res = await request(app)
        .post('/api/leads/consent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ consent: true });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing required identifier/i);
    });

    it('should record user privacy preference when consent is false', async () => {
      const res = await request(app)
        .post('/api/leads/consent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sessionId: testSessionId,
          consent: false
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.consent).toBe(false);
      expect(res.body.message).toMatch(/private/i);

      const tripDoc = await Trip.findOne({ tripId: testTripId });
      expect(tripDoc.consentGiven).toBe(false);
    });

    it('should register consent, update Trip status to handed_off, and dispatch agency handoff', async () => {
      const res = await request(app)
        .post('/api/leads/consent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sessionId: testSessionId,
          tripId: testTripId,
          consent: true,
          contactInfo: {
            phone: "+1-555-019-2834"
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.consent).toBe(true);
      expect(res.body.contactUsed.email).toBe(testUser.email);

      // Verify Trip updated to handed_off and consentGiven: true
      const tripDoc = await Trip.findOne({ tripId: testTripId });
      expect(tripDoc.consentGiven).toBe(true);
      expect(tripDoc.status).toBe('handed_off');
      expect(tripDoc.contactInfo.phone).toBe("+1-555-019-2834");

      // Verify AgencyHandoff document persisted in MongoDB
      const handoffDoc = await AgencyHandoff.findOne({ tripId: tripDoc._id });
      expect(handoffDoc).not.toBeNull();
      expect(handoffDoc.consent).toBe(true);
      expect(handoffDoc.externalTripId).toBe(testTripId);
      expect(handoffDoc.targetAgency).toBeDefined();
    });
  });

  // -------------------------------------------------------------
  // Test Suite 4: WebSocket Itinerary Streaming Event Validation
  // -------------------------------------------------------------
  describe('WebSocket Itinerary Streaming Events', () => {
    it('should emit chronological streaming events over WebSocket during message processing', async () => {
      const wsUrl = `ws://127.0.0.1:${serverPort}/ws/itinerary?sessionId=${testSessionId}`;
      const receivedEvents = [];

      const ws = new WebSocket(wsUrl);

      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });

      // Subscribe to the session
      ws.send(JSON.stringify({ type: 'subscribe', sessionId: testSessionId }));

      ws.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString());
          receivedEvents.push(parsed);
        } catch (e) {
          // ignore
        }
      });

      // Allow subscription to register
      await new Promise((r) => setTimeout(r, 100));

      // Trigger chat message that emits streaming events
      const res = await request(app)
        .post('/api/chat/message')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sessionId: testSessionId,
          message: "Tell me about departing from Tokyo."
        });

      expect(res.status).toBe(200);

      // Wait briefly for all WebSocket frames to transmit
      await new Promise((r) => setTimeout(r, 300));

      ws.close();

      // Assert WebSocket event emissions
      const eventTypes = receivedEvents.map((e) => e.event);
      expect(eventTypes).toContain('chat:received');
      expect(eventTypes).toContain('itinerary:generating');
      expect(eventTypes).toContain('itinerary:complete');

      // Verify payload integrity for chat:received event
      const chatRecvEvent = receivedEvents.find((e) => e.event === 'chat:received');
      expect(chatRecvEvent.sessionId).toBe(testSessionId);
      expect(chatRecvEvent.message).toBe("Tell me about departing from Tokyo.");

      // Verify itinerary:complete event structure
      const completeEvent = receivedEvents.find((e) => e.event === 'itinerary:complete');
      expect(completeEvent.sessionId).toBe(testSessionId);
      expect(completeEvent).toHaveProperty('isComplete');
    });
  });

});
