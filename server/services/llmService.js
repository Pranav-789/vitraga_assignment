import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import dotenv from 'dotenv';
dotenv.config();

const llm = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
  model: "gemini-2.5-flash",
  temperature: 0.1,
});

const mistralBaseLlm = new ChatMistralAI({
  apiKey: process.env.MISTRAL_API_KEY,
  model: "mistral-small-latest",
  temperature: 0.1,
});

export async function checkTravelRelevance(userQuery, previousMessages = []) {
  try {
    const recentContext = previousMessages.slice(-4).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\\n');
    const promptText = `RECENT CONVERSATION HISTORY:\\n${recentContext || "None"}\\n\\nUSER'S LATEST MESSAGE:\\n${userQuery}`;

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "Analyze if the user's latest query is related to travel planning OR if it is a logical continuation of the ongoing travel conversation (e.g., providing contact info, answering the assistant's previous questions, general greetings)."],
      ["human", "{input}"]
    ]);

    const schema = z.object({
      isRelevant: z.boolean().describe("Whether the query is travel-related")
    });

    const structuredLlm = llm.withStructuredOutput(schema);
    const mistralStructuredLlm = mistralBaseLlm.withStructuredOutput(schema);
    
    const modelWithFallback = structuredLlm.withFallbacks({ fallbacks: [mistralStructuredLlm] });
    const chain = prompt.pipe(modelWithFallback);
    
    const response = await chain.invoke({ input: promptText });
    return response.isRelevant;
  } catch (error) {
    console.error("LLM Error in checkTravelRelevance:", error);
    return true; 
  }
}

export async function summarizeMessages(currentSummary, evictedTurns) {
  try {
    const contextBlock = evictedTurns.map(t => `${t.role.toUpperCase()}: ${t.content}`).join('\\n');
    const promptText = `Merge the current summary context with these newly evicted conversation lines. Compress details smoothly while capturing constraints, location targets, and user sentiment parameters.\\n\\nCURRENT SUMMARY:\\n${currentSummary}\\n\\nEVICTED TURNS:\\n${contextBlock}`;
    
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "You are a concise memory summarizing agent. Maintain a cohesive summary of the user's travel plans. Do not output anything other than the new summary."],
      ["human", "{input}"]
    ]);

    const summarizerLlm = new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: "gemini-2.5-flash",
      temperature: 0.3,
    });
    
    const mistralSummarizerLlm = new ChatMistralAI({
      apiKey: process.env.MISTRAL_API_KEY,
      model: "mistral-small-latest",
      temperature: 0.3,
    });

    const modelWithFallback = summarizerLlm.withFallbacks({ fallbacks: [mistralSummarizerLlm] });
    const chain = prompt.pipe(modelWithFallback).pipe(new StringOutputParser());
    
    const response = await chain.invoke({ input: promptText });
    return response.trim();
  } catch (error) {
    console.error("LLM Error in summarizeMessages:", error);
    return currentSummary;
  }
}

// Zod schemas for structured output
const customerSchema = z.object({
  name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional()
});

const travelSchema = z.object({
  destination: z.string().nullable().optional(),
  departureCity: z.string().nullable().optional(),
  travelDate: z.string().nullable().optional(),
  travellers: z.number().nullable().optional(),
  budget: z.string().nullable().optional(),
  duration: z.string().nullable().optional(),
  tripType: z.string().nullable().optional(),
  specialRequirements: z.string().nullable().optional()
});

const qualificationSchema = z.object({
  leadScore: z.number().describe("Score from 0 to 100 based on user intent and gathered information."),
  confidence: z.enum(["Low", "Medium", "High"]),
  reason: z.string().describe("Reason for the lead score and confidence.")
});

const intentResponseSchema = z.object({
  reply: z.string().describe("Natural conversational response to the user's latest query."),
  extractedData: z.object({
    customer: customerSchema.optional(),
    travel: travelSchema.optional(),
    qualification: qualificationSchema.optional()
  }).optional()
});

export async function analyzeTravelIntent(summary, currentMessages, extractedData = {}) {
  try {
    const systemPrompt = `You are an expert AI Travel Assistant and Sales Qualifier. 
Your ultimate goal is LEAD GENERATION. The travel planning is a tool to engage the user and capture their contact information (Name and Phone Number).

Follow this strict conversational funnel:

**STAGE 1: Discovery (Hook)**
- Enthusiastically help the user plan their trip. 
- Ask for missing essential details (destination, dates, number of travelers, budget).
- Keep responses relatively brief and engaging.

**STAGE 2: Lead Capture (The Ask)**
- Once you have enough travel details to create an itinerary (and the user asks for it or agrees to see it), STOP. 
- DO NOT give the full itinerary yet. 
- Instead, say something like: "I have a fantastic itinerary ready for your group! To personalize this plan and send you a link to save it, could I please get your name and email or phone number?"
- You must ask for their contact info before providing the final value.

**STAGE 3: Fulfillment & Qualification**
- Once the user provides their name and phone number, thank them, and NOW generate the full, detailed itinerary.
- Set the 'leadScore' to 80 or higher since they provided contact info and demonstrated high intent.

**Data Extraction Rules:**
- Continuously extract any destination, budget, or date constraints into the JSON schema.
- Extract the customer's name and phone number immediately when provided.
- Assign confidence (Low, Medium, High).`;

    const conversationContext = currentMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\\n');
    const extractedDataStr = JSON.stringify(extractedData, null, 2);
    
    const fullPrompt = `SUMMARY OF PREVIOUS MESSAGES: ${summary || "None"}\\n\\nPREVIOUSLY EXTRACTED DATA:\\n${extractedDataStr}\\n\\nCURRENT CONVERSATION WINDOW:\\n${conversationContext}\\n\\nPlease respond to the last user message and extract data.`;

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      ["human", "{input}"]
    ]);

    const intentLlm = new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: "gemini-2.5-flash",
      temperature: 0.7,
    });
    
    const mistralIntentLlm = new ChatMistralAI({
      apiKey: process.env.MISTRAL_API_KEY,
      model: "mistral-small-latest",
      temperature: 0.7,
    });

    const structuredLlm = intentLlm.withStructuredOutput(intentResponseSchema, { name: "IntentResponse" });
    const mistralStructuredLlm = mistralIntentLlm.withStructuredOutput(intentResponseSchema, { name: "IntentResponse" });
    
    const modelWithFallback = structuredLlm.withFallbacks({ fallbacks: [mistralStructuredLlm] });
    const chain = prompt.pipe(modelWithFallback);
    
    let parsed = await chain.invoke({ input: fullPrompt });
    
    if (!parsed) parsed = { reply: "I'm having trouble processing that, could you repeat?", extractedData: {} };
    if (!parsed.extractedData) parsed.extractedData = {};
    if (!parsed.extractedData.customer) parsed.extractedData.customer = {};
    if (!parsed.extractedData.travel) parsed.extractedData.travel = {};
    if (!parsed.extractedData.qualification) parsed.extractedData.qualification = { leadScore: 0, confidence: "Low", reason: "" };

    return parsed;
  } catch (error) {
    console.error("LLM Error in analyzeTravelIntent:", error);
    throw new Error("Failed to analyze intent via LLM");
  }
}
