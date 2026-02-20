const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/message", (req, res) => {
  const { text } = req.body;

  // Simulate streaming with SSE-style response
  // For VoiceCI compatibility, return final aggregated text
  const words = [
    "I",
    "understand",
    "your",
    "request.",
    "Let",
    "me",
    "help",
    "you",
    "with",
    "that.",
  ];

  const delay = 100 + Math.random() * 200;
  setTimeout(() => {
    res.json({
      text: words.join(" "),
      streaming: true,
      chunks: words.length,
    });
  }, delay);
});

app.listen(PORT, () => {
  console.log(`Demo streaming agent listening on port ${PORT}`);
});
