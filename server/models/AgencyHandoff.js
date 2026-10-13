import mongoose from 'mongoose';

const AgencyHandoffSchema = new mongoose.Schema({
  handoffId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  tripId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    required: true,
    index: true
  },
  externalTripId: {
    type: String,
    default: ""
  },
  targetAgency: {
    type: String,
    default: "verified_partner_network"
  },
  consent: {
    type: Boolean,
    required: true
  },
  contactInfo: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  tripSummary: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['dispatched', 'delivered', 'failed'],
    default: 'dispatched'
  },
  dispatchTimestamp: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

export const AgencyHandoff = mongoose.model('AgencyHandoff', AgencyHandoffSchema);
export default AgencyHandoff;
