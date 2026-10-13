import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import { AgencyHandoff, Trip, User } from '../models/index.js';

/**
 * Dispatches a lead and verified itinerary to partner agencies via webhook.
 */
export async function dispatchAgencyWebhook(tripIdentifier, consent, contactInfo) {
  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(tripIdentifier);
    const trip = await Trip.findOne(
      isObjectId 
        ? { $or: [{ _id: tripIdentifier }, { tripId: tripIdentifier }, { tripId: `trip_${tripIdentifier}` }] }
        : { $or: [{ tripId: tripIdentifier }, { tripId: `trip_${tripIdentifier}` }] }
    ).populate('userId', 'username email');

    if (!trip) {
      throw new Error(`Trip ${tripIdentifier} not found for agency dispatch.`);
    }

    const handoffId = `handoff_${uuidv4()}`;
    const userRef = trip.userId?._id || trip.userId;

    // Prepare payload for partner agencies
    const payload = {
      handoffId,
      tripId: trip.tripId,
      timestamp: new Date().toISOString(),
      consent,
      customer: {
        name: contactInfo?.name || trip.contactInfo?.name || trip.userId?.username,
        email: contactInfo?.email || trip.contactInfo?.email || trip.userId?.email,
        phone: contactInfo?.phone || trip.contactInfo?.phone,
        preferredContactMethod: contactInfo?.preferredContactMethod || "email"
      },
      leadIntelligence: {
        leadScore: trip.leadScore || 0,
        confidence: trip.confidence || 'Medium',
        budgetEstimate: trip.budgetEstimate || trip.budget || 'Not specified',
        qualificationReason: trip.leadReason || 'Direct user consent after itinerary delivery'
      },
      itinerary: {
        destination: trip.destination,
        duration: trip.duration,
        travellers: trip.travellers,
        dailyPlans: trip.dailyPlans || []
      }
    };

    const webhookUrl = process.env.AGENCY_WEBHOOK_URL;
    let webhookStatus = 'dispatched';

    if (webhookUrl) {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        webhookStatus = response.ok ? 'delivered' : 'failed';
      } catch (err) {
        webhookStatus = 'failed';
        console.error(`[AgencyWebhook] Failed to deliver to ${webhookUrl}:`, err.message);
      }
    } else {
      console.log(`[AgencyWebhook] No external URL configured; simulated delivery for trip ${trip.tripId}`);
    }

    const handoffDoc = new AgencyHandoff({
      handoffId,
      userId: userRef,
      tripId: trip._id,
      externalTripId: trip.tripId,
      targetAgency: process.env.PARTNER_AGENCY_NAME || "Verified Travel Partner Network",
      consent,
      contactInfo: payload.customer,
      tripSummary: {
        destination: payload.itinerary.destination,
        daysCount: payload.itinerary.dailyPlans?.length || 0,
        leadScore: payload.leadIntelligence.leadScore
      },
      status: webhookStatus,
      dispatchTimestamp: new Date()
    });

    await handoffDoc.save();

    return {
      success: true,
      handoffId,
      status: webhookStatus,
      message: "Agencies will contact you shortly!"
    };
  } catch (error) {
    console.error("[AgencyWebhook] Error dispatching agency webhook:", error);
    throw error;
  }
}
