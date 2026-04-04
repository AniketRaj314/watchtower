require('dotenv').config();

const express = require('express');
const cron = require('node-cron');
const sessionAuth = require('./middleware/sessionAuth');
const authRouter = require('./routes/auth');
const mealsRouter = require('./routes/meals');
const readingsRouter = require('./routes/readings');
const medicationsRouter = require('./routes/medications');
const dayRouter = require('./routes/day');
const naturalRouter = require('./routes/natural');
const demoRouter = require('./routes/demo');
const intelRouter = require('./routes/intel');
const { generateDailyDigest } = require('./digest');

const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER = process.env.SERVER || 'unknown';

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

app.get('/health', (req, res) => {
  const runtimeSec = Math.round(process.uptime());
  console.log(`[health] server=${SERVER} runtimeSec=${runtimeSec}`);
  res.json({ watchtower: 'online', server: SERVER, runtimeSec });
});

app.use('/api', authRouter);

app.use('/api/meals', sessionAuth, mealsRouter);
app.use('/api/readings', sessionAuth, readingsRouter);
app.use('/api/medications', sessionAuth, medicationsRouter);
app.use('/api/day', sessionAuth, dayRouter);
app.use('/api/log/natural', sessionAuth, naturalRouter);
app.use('/api/demo', sessionAuth, demoRouter);
app.use('/api/intel', sessionAuth, intelRouter);

// Daily digest cron — 2am every day
cron.schedule('0 2 * * *', async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().slice(0, 10);
  try {
    const result = await generateDailyDigest(date);
    if (result.skipped) {
      console.log(`[digest] skipped ${date} — no readings`);
    } else {
      console.log(`[digest] generated for ${date} — ${result.overall_rating}`);
    }
  } catch (err) {
    console.error(`[digest] failed for ${date}:`, err.message);
  }
});
console.log('[digest] Watchtower digest scheduled');

app.listen(PORT, () => {
  console.log(`Watchtower running on port ${PORT}`);
});
