import mongoose from 'mongoose';

const ConversationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },

  tripId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    default: null,
    index: true
  },

  conversationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  summary: {
    type: String,
    default: ""
  },

  messages: [{
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true
    },

    content: {
      type: String,
      required: true
    },

    timestamp: {
      type: Date,
      default: Date.now
    }
  }],

  offerConsentPresented: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

export const Conversation = mongoose.model('Conversation', ConversationSchema);
export default Conversation;
