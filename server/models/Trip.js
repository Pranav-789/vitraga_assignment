import mongoose from 'mongoose';

const TripSchema = new mongoose.Schema({
  tripId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Basic trip information
  destination: {
    type: String,
    default: ""
  },

  departureCity: {
    type: String,
    default: ""
  },

  travelDate: {
    type: String,
    default: null
  },

  travellers: {
    type: Number,
    default: null
  },

  budget: {
    type: String,
    default: null
  },

  duration: {
    type: String,
    default: null
  },

  tripType: {
    type: String,
    default: null
  },

  specialRequirements: {
    type: String,
    default: null
  },

  // Lead information
  leadScore: {
    type: Number,
    default: 0
  },

  confidence: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Low'
  },

  leadReason: {
    type: String,
    default: ""
  },

  budgetEstimate: {
    type: String,
    default: null
  },

  consentGiven: {
    type: Boolean,
    default: false
  },

  contactInfo: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Trip planning state
  status: {
    type: String,
    enum: [
      'planning',
      'validated',
      'complete',
      'handed_off'
    ],
    default: 'planning'
  },

  userConstraints: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  validationLogs: [{
    type: String
  }],

  dailyPlans: [{
    dayNumber: {
      type: Number
    },

    title: {
      type: String
    },

    validationStatus: {
      type: String,
      enum: ['valid', 'failed', 'regenerated', 'degraded'],
      default: 'valid'
    },

    morningSlot: {
      type: mongoose.Schema.Types.Mixed
    },

    afternoonSlot: {
      type: mongoose.Schema.Types.Mixed
    },

    eveningSlot: {
      type: mongoose.Schema.Types.Mixed
    }
  }],

  isComplete: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

export const Trip = mongoose.model('Trip', TripSchema);
export default Trip;
