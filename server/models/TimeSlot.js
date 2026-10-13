import mongoose from 'mongoose';

const TimeSlotSchema = new mongoose.Schema({
  slotId: {
    type: String,
    required: true,
    unique: true
  },
  dayId: {
    type: String,
    required: true,
    index: true
  },
  tripId: {
    type: String,
    required: true,
    index: true
  },
  locationId: {
    type: String,
    default: null
  },
  locationName: {
    type: String,
    default: ""
  },
  slotType: {
    type: String,
    enum: ['morning', 'afternoon', 'evening'],
    required: true
  },
  startTime: {
    type: String,
    default: ""
  },
  activityDescription: {
    type: String,
    required: true
  },
  coordinates: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null }
  },
  travelTimeToNext: {
    type: String,
    default: null
  },
  validationStatus: {
    type: String,
    default: 'valid'
  }
}, { timestamps: true });

export const TimeSlot = mongoose.model('TimeSlot', TimeSlotSchema);
export default TimeSlot;
