import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes.js";
import tripRoutes from "./routes/tripRoutes.js";
import chatRouter from "./routes/chat.js";
import leadsRouter from "./routes/leads.js";
import connectDB from "./config/db.js";

dotenv.config();
connectDB();

const app = express();

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/chat', chatRouter);
app.use('/api/leads', leadsRouter);

app.get('/', (req, res) => {
    return res.status(200).json({
        message: "The server's up and healthy!"
    });
});

app.get('/api', (req, res) => {
    return res.status(200).json({
        message: "The API is up and healthy!",
        endpoints: {
            auth: {
                register: "POST /api/auth/register",
                login: "POST /api/auth/login"
            },
            trips: {
                create: "POST /api/trips (auth required)",
                list: "GET /api/trips (auth required)",
                getOne: "GET /api/trips/:tripId (auth required)",
                update: "PUT /api/trips/:tripId (auth required)",
                delete: "DELETE /api/trips/:tripId (auth required)"
            },
            chat: {
                initChat: "POST /api/chat/init",
                chatMessage: "POST /api/chat/message"
            },
            leads: {
                leadConsent: "POST /api/leads/consent"
            }
        }
    });
});

app.get('/api/health', (req, res) => {
    return res.status(200).json({ status: "healthy" });
});

const PORT = process.env.PORT || 8000;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
      console.log(`Node.js API Gateway is running on port ${PORT}`);
  });
}

export default app;