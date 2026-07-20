import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import chatRouter from "./routes/chat.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/chat', chatRouter);

app.get('/', (req, res)=>{
    return res.status(200).json({
        message: "The server's up and healthy!"
    });
});

const PORT = process.env.PORT || 8000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/travel-leads";

mongoose.connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Failed to connect to MongoDB", err));

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
      console.log(`The server is running on port ${PORT}`);
  });
}

export default app;