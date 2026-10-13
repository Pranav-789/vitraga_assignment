import mongoose from 'mongoose';

const DailyPlanSchema = new mongoose.Schema({
  dayId: {
    type: String,
    required: true,
    unique: true
  },
  tripId: {
    type: String,
    required: true,
    index: true
  },
  dayNumber: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    default: ""
  },
  validationStatus: {
    type: String,
    enum: ['valid', 'failed', 'regenerated'],
    default: 'valid'
  },
  morningSlot: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  afternoonSlot: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  eveningSlot: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, { timestamps: true });

export const DailyPlan = mongoose.model('DailyPlan', DailyPlanSchema);
export default DailyPlan;
