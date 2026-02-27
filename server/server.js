require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

// Groq (OpenAI-compatible) Client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// Optimize Route
app.post("/optimize", async (req, res) => {
  try {
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: "Write a short optimized Meesho product title for a cotton t-shirt",
        },
      ],
    });

    res.json({
      message: completion.choices[0].message.content,
    });
  } catch (err) {
    console.error("Groq Error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
