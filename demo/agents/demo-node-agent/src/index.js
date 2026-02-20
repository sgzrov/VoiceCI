const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

const responses = {
  greeting: [
    "Hello! Welcome to our service. How can I help you today?",
    "Hi there! I'm here to assist you with any questions or bookings.",
  ],
  booking: [
    "I'd be happy to help you make a booking. What date works for you?",
    "Great choice! I have availability on Tuesday and Thursday. Which do you prefer?",
    "Your booking is confirmed for Thursday at 2 PM. You'll receive a confirmation email shortly.",
  ],
  faq: [
    "Our hours are Monday through Friday, 9 AM to 5 PM.",
    "Yes, we offer a 30-day money-back guarantee on all services.",
    "You can reach our support team at support@example.com or call 555-0123.",
  ],
  default: [
    "I understand. Let me help you with that.",
    "Could you tell me more about what you need?",
    "I'll look into that for you right away.",
  ],
};

let messageCount = 0;

function getResponse(text) {
  const lower = text.toLowerCase();

  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return responses.greeting[messageCount % responses.greeting.length];
  }
  if (lower.includes("book") || lower.includes("appointment") || lower.includes("schedule")) {
    return responses.booking[messageCount % responses.booking.length];
  }
  if (lower.includes("hours") || lower.includes("guarantee") || lower.includes("support") || lower.includes("contact")) {
    return responses.faq[messageCount % responses.faq.length];
  }
  return responses.default[messageCount % responses.default.length];
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/message", (req, res) => {
  const { text } = req.body;
  messageCount++;

  // Simulate variable latency (50-200ms)
  const delay = 50 + Math.random() * 150;
  setTimeout(() => {
    res.json({ text: getResponse(text || "") });
  }, delay);
});

app.post("/chat", (req, res) => {
  const { text } = req.body;
  messageCount++;
  const delay = 50 + Math.random() * 150;
  setTimeout(() => {
    res.json({ text: getResponse(text || "") });
  }, delay);
});

app.listen(PORT, () => {
  console.log(`Demo agent listening on port ${PORT}`);
});
