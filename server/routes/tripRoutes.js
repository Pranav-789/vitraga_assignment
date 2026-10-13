import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  createTrip,
  getUserTrips,
  getTripById,
  updateTrip,
  deleteTrip
} from '../controllers/tripController.js';

const router = express.Router();

// All trip routes require JWT authentication
router.use(authMiddleware);

router.post('/', createTrip);
router.get('/', getUserTrips);
router.get('/:tripId', getTripById);
router.put('/:tripId', updateTrip);
router.delete('/:tripId', deleteTrip);

export default router;
