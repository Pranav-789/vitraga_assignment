import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import { Conversation, Trip, User } from '../models/index.js';
import { checkTravelRelevance } from '../services/llmService.js';
import { observeLeadAsync } from '../services/leadObserver.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Require JWT authentication for all chat routes
router.use(authMiddleware);

const PYTHON_COMPUTE_URL = process.env.PYTHON_COMPUTE_URL || 'http://127.0.0.1:8001';

/**
 * Helper to initialize session state in MongoDB for authenticated user
 */
async function initSession(req) {
  const sessionId = uuidv4();
  const userId = req.user.userId;
  const user = await User.findById(userId);

  // Create blank Trip in MongoDB (pre-populated with authenticated user account details)
  const trip = new Trip({
    tripId: `trip_${sessionId}`,
    userId: userId,
    destination: "",
    status: 'planning',
    userConstraints: {},
    contactInfo: {
      name: user?.username || "",
      email: user?.email || ""
    },
    validationLogs: ['[Init] Authenticated trip created.'],
    dailyPlans: [],
    isComplete: false
  });
  await trip.save();

  // Create Conversation record linked to user and trip
  const conversation = new Conversation({
    userId: userId,
    tripId: trip._id,
    conversationId: sessionId,
    summary: "",
    messages: []
  });
  await conversation.save();

  return { sessionId, tripId: trip.tripId };
}

/**
 * POST /api/chat/init (and /initiate-chat)
 * Initializes a new chat session for authenticated user.
 * Response: { sessionId: UUID, tripId: string, status: "ready" }
 */
router.post('/init', async (req, res) => {
  try {
    const { sessionId, tripId } = await initSession(req);
    return res.status(201).json({
      sessionId,
      tripId,
      conversationId: sessionId,
      status: "ready"
    });
  } catch (error) {
    console.error("Error in /api/chat/init:", error);
    return res.status(500).json({ error: "Failed to initialize chat session." });
  }
});

// Backward compatibility alias
router.post('/initiate-chat', async (req, res) => {
  try {
    const { sessionId, tripId } = await initSession(req);
    return res.status(201).json({
      sessionId,
      tripId,
      conversationId: sessionId,
      status: "ready"
    });
  } catch (error) {
    console.error("Error in /initiate-chat:", error);
    return res.status(500).json({ error: "Failed to initialize conversation." });
  }
});

/**
 * Core handler for chat messages
 */
async function handleChatMessage(req, res) {
  const sessionId = req.body.sessionId || req.body.conversationId;
  const message = req.body.message;
  const userId = req.user.userId;

  if (!sessionId || !message) {
    return res.status(400).json({ error: "Missing sessionId (or conversationId) or message." });
  }

  try {
    let conversation = await Conversation.findOne({
      conversationId: sessionId,
      userId: userId
    });

    let tripDoc = await Trip.findOne({
      userId: userId,
      $or: [
        { tripId: sessionId },
        { tripId: `trip_${sessionId}` }
      ]
    });

    // If tripDoc doesn't exist yet for this session, create it for authenticated user
    if (!tripDoc) {
      const user = await User.findById(userId);
      tripDoc = new Trip({
        tripId: `trip_${sessionId}`,
        userId: userId,
        status: 'planning',
        contactInfo: {
          name: user?.username || "",
          email: user?.email || ""
        },
        dailyPlans: []
      });
      await tripDoc.save();
    }

    if (!conversation) {
      conversation = new Conversation({
        userId: userId,
        tripId: tripDoc._id,
        conversationId: sessionId,
        messages: []
      });
      await conversation.save();
    }

    // Step 1: Guardrail relevance check
    const isRelevant = await checkTravelRelevance(message, conversation.messages);
    if (!isRelevant) {
      const refusalReply = "I am your AI Travel Assistant and can only assist with travel-related inquiries. How can I help you plan your next trip?";
      conversation.messages.push({ role: 'user', content: message });
      conversation.messages.push({ role: 'assistant', content: refusalReply });
      await conversation.save();

      return res.status(200).json({
        reply: refusalReply,
        tripState: tripDoc,
        offerConsent: false,
        isComplete: false
      });
    }

    // Append user message
    conversation.messages.push({ role: 'user', content: message });

    // Step 2: Bifurcation
    // 2a. Asynchronous LeadObserver updates Trip in background
    observeLeadAsync(sessionId, message, conversation.messages).catch(err => {
      console.error("[LeadObserver] Background error:", err.message);
    });

    // 2b. Proxy chat context to Python Compute Node for LangGraph orchestration
    let computeResult = null;
    try {
      const computeResponse = await fetch(`${PYTHON_COMPUTE_URL}/internal/generate-itinerary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          message: message,
          history: conversation.messages,
          trip_state: tripDoc.toObject()
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (computeResponse.ok) {
        computeResult = await computeResponse.json();
      } else {
        console.warn(`[ComputeNode] Returned status ${computeResponse.status}, falling back.`);
      }
    } catch (computeErr) {
      console.warn(`[ComputeNode] Warning: Python node unreachable (${computeErr.message}). Using fallback generator.`);
    }

    if (!computeResult) {
      computeResult = {
        reply: `I'm analyzing the best travel options for your trip. Let's explore exciting highlights and tailor your daily itinerary!\n\n✨ **Value-First Booking Support:**\nWould you like me to share this plan with our verified partner agencies for exclusive booking discounts?`,
        trip_state: {
          tripId: tripDoc.tripId,
          destination: tripDoc.destination || "Destination",
          status: "planning",
          userConstraints: tripDoc.userConstraints || {},
          validationLogs: ["[NodeGateway] Generating initial itinerary preview."],
          dailyPlans: tripDoc.dailyPlans || [],
          is_complete: false
        },
        offer_consent: true,
        is_complete: false
      };
    }

    // Save assistant reply to Conversation
    conversation.messages.push({ role: 'assistant', content: computeResult.reply });
    await conversation.save();

    // Update Trip in MongoDB
    if (computeResult.trip_state) {
      const ts = computeResult.trip_state;
      if (ts.destination) tripDoc.destination = ts.destination;
      if (ts.departure_city) tripDoc.departureCity = ts.departure_city;
      if (ts.duration_days) tripDoc.duration = `${ts.duration_days} days`;
      if (ts.departure_time) tripDoc.travelDate = ts.departure_time;
      if (ts.budget) tripDoc.budget = ts.budget;
      if (ts.travellers) tripDoc.travellers = ts.travellers;
      if (ts.user_constraints) {
        tripDoc.userConstraints = {
          ...(tripDoc.userConstraints || {}),
          ...ts.user_constraints
        };
      }
      tripDoc.status = computeResult.is_complete ? 'validated' : 'planning';
      tripDoc.isComplete = computeResult.is_complete || false;
      tripDoc.dailyPlans = ts.daily_plans || tripDoc.dailyPlans;
      if (ts.validation_logs) {
        tripDoc.validationLogs = ts.validation_logs;
      }
      await tripDoc.save();
    }

    // Extract live panel data directly from the Trip entity
    const extractedDataPayload = {
      customer: {
        name: tripDoc.contactInfo?.name || null,
        phone: tripDoc.contactInfo?.phone || null,
        email: tripDoc.contactInfo?.email || null
      },
      travel: {
        destination: tripDoc.destination,
        departureCity: tripDoc.departureCity,
        travelDate: tripDoc.travelDate,
        travellers: tripDoc.travellers,
        budget: tripDoc.budget,
        duration: tripDoc.duration,
        tripType: tripDoc.tripType,
        specialRequirements: tripDoc.specialRequirements
      },
      qualification: {
        leadScore: tripDoc.leadScore || 0,
        confidence: tripDoc.confidence || 'Low',
        reason: tripDoc.leadReason || ""
      },
      budgetEstimate: tripDoc.budgetEstimate || null,
      consentGiven: tripDoc.consentGiven || false
    };

    return res.status(200).json({
      reply: computeResult.reply,
      tripState: tripDoc,
      isComplete: Boolean(computeResult.is_complete),
      offerConsent: Boolean(computeResult.offer_consent),
      extractedData: extractedDataPayload
    });

  } catch (error) {
    console.error("Error during /api/chat/message execution:", error);
    return res.status(500).json({ error: "An internal processing error occurred." });
  }
}

/**
 * POST /api/chat/message
 */
router.post('/message', handleChatMessage);
router.post('/chat', handleChatMessage);

/**
 * Hydration endpoint for page refreshes
 * GET /api/chat/session/:sessionId (and /conversation/:id)
 */
async function handleHydration(req, res) {
  const sessionId = req.params.sessionId || req.params.id;
  const userId = req.user.userId;

  try {
    const conversation = await Conversation.findOne({
      conversationId: sessionId,
      userId: userId
    });

    const tripDoc = await Trip.findOne({
      userId: userId,
      $or: [
        { tripId: sessionId },
        { tripId: `trip_${sessionId}` }
      ]
    });

    if (!conversation && !tripDoc) {
      return res.status(404).json({ error: "Session not found." });
    }

    const extractedDataPayload = tripDoc ? {
      customer: {
        name: tripDoc.contactInfo?.name || null,
        phone: tripDoc.contactInfo?.phone || null,
        email: tripDoc.contactInfo?.email || null
      },
      travel: {
        destination: tripDoc.destination,
        departureCity: tripDoc.departureCity,
        travelDate: tripDoc.travelDate,
        travellers: tripDoc.travellers,
        budget: tripDoc.budget,
        duration: tripDoc.duration,
        tripType: tripDoc.tripType,
        specialRequirements: tripDoc.specialRequirements
      },
      qualification: {
        leadScore: tripDoc.leadScore || 0,
        confidence: tripDoc.confidence || 'Low',
        reason: tripDoc.leadReason || ""
      },
      budgetEstimate: tripDoc.budgetEstimate || null,
      consentGiven: tripDoc.consentGiven || false
    } : null;

    return res.json({
      sessionId,
      messages: conversation?.messages || [],
      tripState: tripDoc || null,
      extractedData: extractedDataPayload
    });
  } catch (error) {
    console.error("Error during hydration:", error);
    return res.status(500).json({ error: "Failed to fetch session state." });
  }
}

router.get('/session/:sessionId', handleHydration);
router.get('/conversation/:id', handleHydration);

export default router;
