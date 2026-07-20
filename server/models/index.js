import mongoose from 'mongoose';

const ConversationSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, unique: true },
  
  summary: { type: String, default: "" }, 
  
  extractedData: {
    customer: {
      name: { type: String, default: null },
      phone: { type: String, default: null },
      email: { type: String, default: null }
    },
    travel: {
      destination: { type: String, default: null },
      departureCity: { type: String, default: null },
      travelDate: { type: String, default: null },
      travellers: { type: Number, default: null },
      budget: { type: String, default: null },
      duration: { type: String, default: null },
      tripType: { type: String, default: null },
      specialRequirements: { type: String, default: null }
    },
    qualification: {
      leadScore: { type: Number, default: 0 },
      confidence: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low' },
      reason: { type: String, default: "" }
    }
  },
  
  messages: [
    {
      role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
      content: { type: String, required: true },
      timestamp: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

const LeadSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, unique: true },
  customer: {
    name: { type: String, default: null },
    phone: { type: String, default: null },
    email: { type: String, default: null }
  },
  travel: {
    destination: { type: String, default: null },
    departureCity: { type: String, default: null },
    travelDate: { type: String, default: null },
    travellers: { type: Number, default: null },
    budget: { type: String, default: null },
    duration: { type: String, default: null },
    tripType: { type: String, default: null },
    specialRequirements: { type: String, default: null }
  },
  qualification: {
    leadScore: { type: Number, required: true },
    confidence: { type: String, required: true },
    reason: { type: String, default: "" },
    summary: { type: String, default: "" }
  }
}, { timestamps: true });

const Conversation = mongoose.model('Conversation', ConversationSchema);
const Lead = mongoose.model('Lead', LeadSchema);

export { Conversation, Lead };
