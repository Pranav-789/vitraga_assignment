import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import chatRouter from "./routes/chat.js";
import connectDB from "./config/db.js";

dotenv.config();
connectDB();

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

app.get('/api', (req, res)=>{
    return res.status(200).json({
        message: "The API is up and healthy!"
    });
});

app.get('/api/', (req, res)=>{
    return res.status(200).json({
        message: "The API is up and healthy!"
    });
});

const PORT = process.env.PORT || 8000;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
      console.log(`The server is running on port ${PORT}`);
  });
}

export default app;