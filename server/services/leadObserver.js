import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import dotenv from 'dotenv';
import { Trip } from '../models/index.js';

dotenv.config();

const observerLlm = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
  model: "gemini-3.5-flash",
  temperature: 0.2,
  maxRetries: 0,
});

const mistralObserverLlm = new ChatMistralAI({
  apiKey: process.env.MISTRAL_API_KEY,
  model: "mistral-small-latest",
  temperature: 0.2,
});

const leadExtractionSchema = z.object({
  budgetEstimate: z.string().nullable().optional().describe("Estimated budget mentioned by the user or inferred from luxury/budget preferences, e.g. '$2000', 'luxury', '$500/day'"),
  travelConstraints: z.object({
    destination: z.string().nullable().optional(),
    departureCity: z.string().nullable().optional(),
    travelDate: z.string().nullable().optional(),
    travellers: z.number().nullable().optional(),
    budget: z.string().nullable().optional(),
    duration: z.string().nullable().optional(),
    tripType: z.string().nullable().optional(),
    specialRequirements: z.string().nullable().optional()
  }).optional(),
  contactInfo: z.object({
    name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional()
  }).optional(),
  leadScore: z.number().min(0).max(100).describe("Lead score (0-100) reflecting user intent to book, clarity of travel plans, and readiness."),
  confidence: z.enum(["Low", "Medium", "High"]).describe("Confidence in lead qualification"),
  leadReason: z.string().describe("Concise explanation of the score based on user intent and gathered data")
});

/**
 * Asynchronously observes and extracts lead qualifications in the background.
 * Observer pattern: silently parses user intent, budget, and destination
 * and persists directly into the Trip entity without gatekeeping the user conversation.
 */
export async function observeLeadAsync(tripIdentifier, currentMessage, history = []) {
  try {
    const existingTrip = await Trip.findOne({
      $or: [
        { tripId: tripIdentifier },
        { tripId: `trip_${tripIdentifier}` }
      ]
    });

    const recentContext = history.slice(-6).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const existingDataStr = existingTrip ? JSON.stringify({
      leadScore: existingTrip.leadScore,
      budgetEstimate: existingTrip.budgetEstimate,
      destination: existingTrip.destination,
      departureCity: existingTrip.departureCity,
      travellers: existingTrip.travellers,
      duration: existingTrip.duration,
      contactInfo: existingTrip.contactInfo
    }, null, 2) : "None";

    const promptText = `
You are the silent LeadObserver background worker.
Your task is to analyze the conversation, silently gauge user travel purchase intent, extract budget, travel preferences, and any contact information.
Do NOT generate a user response. Only extract structured lead intelligence.

EXISTING KNOWN TRIP / LEAD DATA:
${existingDataStr}

RECENT CONVERSATION HISTORY:
${recentContext || "None"}

USER'S LATEST MESSAGE:
${currentMessage}
`;

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "You are an analytical lead-scoring observer. Extract travel constraints, budget estimates, contact info, and calculate an objective lead score between 0 and 100 based on purchase intent."],
      ["human", "{input}"]
    ]);

    const structuredLlm = observerLlm.withStructuredOutput(leadExtractionSchema, { name: "LeadObserverOutput" });
    const fallbackLlm = mistralObserverLlm.withStructuredOutput(leadExtractionSchema, { name: "LeadObserverOutput" });
    const chain = prompt.pipe(structuredLlm.withFallbacks({ fallbacks: [fallbackLlm] }));

    const result = await chain.invoke({ input: promptText });

    if (!result) return;

    const mergeObj = (oldObj = {}, newObj = {}) => {
      const merged = { ...(oldObj || {}) };
      if (newObj) {
        for (const [key, val] of Object.entries(newObj)) {
          if (val !== null && val !== undefined && val !== "") {
            merged[key] = val;
          }
        }
      }
      return merged;
    };

    const updateFields = {};
    if (result.leadScore !== undefined) updateFields.leadScore = result.leadScore;
    if (result.confidence) updateFields.confidence = result.confidence;
    if (result.leadReason) updateFields.leadReason = result.leadReason;
    if (result.budgetEstimate) updateFields.budgetEstimate = result.budgetEstimate;

    // Merge travel constraints into Trip top-level fields
    if (result.travelConstraints) {
      const tc = result.travelConstraints;
      if (tc.destination) updateFields.destination = tc.destination;
      if (tc.departureCity) updateFields.departureCity = tc.departureCity;
      if (tc.travelDate) updateFields.travelDate = tc.travelDate;
      if (tc.travellers) updateFields.travellers = tc.travellers;
      if (tc.budget) updateFields.budget = tc.budget;
      if (tc.duration) updateFields.duration = tc.duration;
      if (tc.tripType) updateFields.tripType = tc.tripType;
      if (tc.specialRequirements) updateFields.specialRequirements = tc.specialRequirements;
      updateFields.userConstraints = mergeObj(existingTrip?.userConstraints, tc);
    }

    if (result.contactInfo) {
      updateFields.contactInfo = mergeObj(existingTrip?.contactInfo, result.contactInfo);
    }

    if (existingTrip) {
      await Trip.findByIdAndUpdate(existingTrip._id, { $set: updateFields });
      console.log(`[LeadObserver] Updated leadScore=${result.leadScore} in Trip ${existingTrip.tripId}`);
    }
  } catch (error) {
    console.error("[LeadObserver] Error during background lead observation:", error.message);
  }
}
