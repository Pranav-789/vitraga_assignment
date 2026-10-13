import express from 'express';
import { Trip, User } from '../models/index.js';
import { dispatchAgencyWebhook } from '../services/webhookService.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Require JWT authentication for leads routes
router.use(authMiddleware);

/**
 * POST /api/leads/consent
 * Triggered when the authenticated user accepts the value-add offer to share their itinerary.
 * Uses the user's registered credentials without prompting them for manual details.
 * Payload: { tripId: string, sessionId: string, consent: boolean, contactInfo: Object (optional) }
 */
router.post('/consent', async (req, res) => {
  try {
    const tripIdentifier = req.body.tripId || req.body.sessionId;
    const { consent, contactInfo } = req.body;
    const userId = req.user.userId;

    if (!tripIdentifier) {
      return res.status(400).json({ error: "Missing required identifier: tripId or sessionId" });
    }

    const trip = await Trip.findOne({
      userId: userId,
      $or: [
        { tripId: tripIdentifier },
        { tripId: `trip_${tripIdentifier}` }
      ]
    });

    if (!trip) {
      return res.status(404).json({ error: "Trip not found or unauthorized for consent registration" });
    }

    if (consent === false) {
      trip.consentGiven = false;
      await trip.save();
      return res.status(200).json({
        success: true,
        consent: false,
        message: "Your itinerary remains completely private."
      });
    }

    // Auto-populate user's registered name and email from account
    const user = await User.findById(userId);
    const resolvedContactInfo = {
      name: user?.username || trip.contactInfo?.name || "Registered User",
      email: user?.email || trip.contactInfo?.email || "",
      phone: contactInfo?.phone || trip.contactInfo?.phone || "",
      ...(contactInfo || {})
    };

    // Update Trip with consent and resolved contact info
    trip.consentGiven = true;
    trip.status = 'handed_off';
    trip.contactInfo = resolvedContactInfo;
    await trip.save();

    // Dispatch webhook to partner agencies
    const dispatchResult = await dispatchAgencyWebhook(trip.tripId, true, resolvedContactInfo);

    return res.status(200).json({
      success: true,
      consent: true,
      message: "Agencies will contact you shortly using your registered profile!",
      contactUsed: {
        name: resolvedContactInfo.name,
        email: resolvedContactInfo.email
      },
      dispatch: dispatchResult
    });

  } catch (error) {
    console.error("Error processing lead consent:", error);
    return res.status(500).json({ error: "Failed to record consent and dispatch lead." });
  }
});

/**
 * GET /api/leads/:tripId
 * Returns the lead intelligence profile for the authenticated user's trip
 */
router.get('/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.userId;

    const trip = await Trip.findOne({
      userId: userId,
      $or: [
        { tripId: tripId },
        { tripId: `trip_${tripId}` }
      ]
    });

    if (!trip) return res.status(404).json({ error: "Lead profile not found or unauthorized" });

    return res.status(200).json({
      tripId: trip.tripId,
      leadScore: trip.leadScore,
      confidence: trip.confidence,
      leadReason: trip.leadReason,
      budgetEstimate: trip.budgetEstimate,
      consentGiven: trip.consentGiven,
      contactInfo: trip.contactInfo
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to retrieve lead profile" });
  }
});

export default router;
