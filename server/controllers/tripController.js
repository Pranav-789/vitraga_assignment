import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Trip } from '../models/index.js';

/**
 * Helper to build trip query matching either string tripId or MongoDB ObjectId,
 * strictly scoped to the authenticated user's userId.
 */
const buildUserTripQuery = (tripIdParam, userId) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(tripIdParam);
  if (isObjectId) {
    return {
      $or: [{ tripId: tripIdParam }, { _id: tripIdParam }],
      userId: userId
    };
  }
  return {
    tripId: tripIdParam,
    userId: userId
  };
};

/**
 * POST /api/trips
 * Creates a new trip owned by the authenticated user.
 */
export const createTrip = async (req, res) => {
  try {
    const tripData = { ...req.body };

    // Security: Never trust userId supplied in request body; always use JWT userId
    delete tripData.userId;

    const newTrip = new Trip({
      ...tripData,
      tripId: tripData.tripId || `trip_${uuidv4()}`,
      userId: req.user.userId
    });

    const savedTrip = await newTrip.save();
    return res.status(201).json(savedTrip);

  } catch (error) {
    console.error('Error creating trip:', error);
    return res.status(500).json({ error: 'Failed to create trip', details: error.message });
  }
};

/**
 * GET /api/trips
 * Retrieves all trips belonging to the authenticated user.
 */
export const getUserTrips = async (req, res) => {
  try {
    const trips = await Trip.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    return res.status(200).json(trips);
  } catch (error) {
    console.error('Error fetching user trips:', error);
    return res.status(500).json({ error: 'Failed to fetch trips' });
  }
};

/**
 * GET /api/trips/:tripId
 * Retrieves a single trip by ID if owned by the authenticated user.
 */
export const getTripById = async (req, res) => {
  try {
    const { tripId } = req.params;
    const query = buildUserTripQuery(tripId, req.user.userId);

    const trip = await Trip.findOne(query);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found or unauthorized' });
    }

    return res.status(200).json(trip);
  } catch (error) {
    console.error('Error fetching trip by ID:', error);
    return res.status(500).json({ error: 'Failed to fetch trip details' });
  }
};

/**
 * PUT /api/trips/:tripId
 * Updates a trip if owned by the authenticated user.
 */
export const updateTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const updateData = { ...req.body };

    // Security: Prevent modifying ownership or internal primary key
    delete updateData.userId;
    delete updateData._id;

    const query = buildUserTripQuery(tripId, req.user.userId);

    const updatedTrip = await Trip.findOneAndUpdate(
      query,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedTrip) {
      return res.status(404).json({ error: 'Trip not found or unauthorized' });
    }

    return res.status(200).json(updatedTrip);
  } catch (error) {
    console.error('Error updating trip:', error);
    return res.status(500).json({ error: 'Failed to update trip' });
  }
};

/**
 * DELETE /api/trips/:tripId
 * Deletes a trip if owned by the authenticated user.
 */
export const deleteTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const query = buildUserTripQuery(tripId, req.user.userId);

    const deletedTrip = await Trip.findOneAndDelete(query);
    if (!deletedTrip) {
      return res.status(404).json({ error: 'Trip not found or unauthorized' });
    }

    return res.status(200).json({
      message: 'Trip deleted successfully',
      tripId: deletedTrip.tripId
    });
  } catch (error) {
    console.error('Error deleting trip:', error);
    return res.status(500).json({ error: 'Failed to delete trip' });
  }
};
