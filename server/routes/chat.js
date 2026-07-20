import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Conversation, Lead } from '../models/index.js'; 
import { checkTravelRelevance, summarizeMessages, analyzeTravelIntent } from '../services/llmService.js';

const router = express.Router();
router.post('/initiate-chat', async (req, res) => {
  try {
    const newConversationId = uuidv4();
    
    const newConversation = new Conversation({
      conversationId: newConversationId,
      summary: "",
      extractedData: {
        customer: { name: null, phone: null, email: null },
        travel: {
          destination: null, departureCity: null, travelDate: null,
          travellers: null, budget: null, duration: null,
          tripType: null, specialRequirements: null
        },
        qualification: { leadScore: 0, confidence: 'Low', reason: "" }
      },
      messages: []
    });

    await newConversation.save();
    return res.status(201).json({ conversationId: newConversationId });
  } catch (error) {
    console.error("Error initiating chat:", error);
    return res.status(500).json({ error: "Failed to initialize conversation." });
  }
});

router.post('/chat', async (req, res) => {
  const { conversationId, message } = req.body;

  if (!conversationId || !message) {
    return res.status(400).json({ error: "Missing conversationId or message." });
  }

  try {
    let conversation = await Conversation.findOne({ conversationId });
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    const isRelevant = await checkTravelRelevance(message, conversation.messages);
    if (!isRelevant) {
      return res.status(200).json({
        reply: "I am your AI Travel Assistant and can only assist with travel-related inquiries. How can I help you plan your next trip?",
        extractedData: null
      });
    }

    conversation.messages.push({ role: 'user', content: message });

    if (conversation.messages.length >= 8) {
      const evictedTurns = conversation.messages.splice(0, conversation.messages.length);
      
      conversation.summary = await summarizeMessages(conversation.summary, evictedTurns);
    }

    conversation.messages.push({ role: 'user', content: message });

    const llmResult = await analyzeTravelIntent(conversation.summary, conversation.messages, conversation.extractedData);
    
    conversation.messages.push({ role: 'assistant', content: llmResult.reply });
    
    conversation.extractedData = {  
      customer: { ...conversation.extractedData.customer, ...llmResult.extractedData.customer },
      travel: { ...conversation.extractedData.travel, ...llmResult.extractedData.travel },
      qualification: { ...conversation.extractedData.qualification, ...llmResult.extractedData.qualification }
    };

    await conversation.save();

    const { qualification, customer } = conversation.extractedData;
    if (
      qualification.leadScore > 75 && 
      (customer.phone || customer.email)
    ) {
      await Lead.findOneAndUpdate(
        { conversationId },
        {
          customer,
          travel: conversation.extractedData.travel,
          qualification: {
            leadScore: qualification.leadScore,
            confidence: qualification.confidence,
            reason: qualification.reason,
            summary: conversation.summary || "Lead qualified automatically via chat."
          }
        },
        { upsert: true, new: true }
      );
    }

    return res.status(200).json({
      reply: llmResult.reply,
      extractedData: conversation.extractedData
    });

  } catch (error) {
    console.error("Error during execution:", error);
    return res.status(500).json({ error: "An internal processing error occurred." });
  }
});

router.get('/conversation/:id', async (req, res) => {
  try {
    const conversation = await Conversation.findOne({ conversationId: req.params.id });
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    
    res.json({
      messages: conversation.messages,
      extractedData: conversation.extractedData
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch conversation status." });
  }
});

export default router;
