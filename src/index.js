require('dotenv').config();

const express = require('express');
const auth = require('./middleware/auth');
const mealsRouter = require('./routes/meals');
const readingsRouter = require('./routes/readings');
const medicationsRouter = require('./routes/medications');
const dayRouter = require('./routes/day');
const naturalRouter = require('./routes/natural');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER = process.env.SERVER || 'unknown';

app.use(express.json());

app.get('/health', (req, res) => {
  const runtimeSec = Math.round(process.uptime());
  console.log(`[health] server=${SERVER} runtimeSec=${runtimeSec}`);
  res.json({ watchtower: 'online', server: SERVER, runtimeSec });
});

app.use(auth);

app.use('/api/meals', mealsRouter);
app.use('/api/readings', readingsRouter);
app.use('/api/medications', medicationsRouter);
app.use('/api/day', dayRouter);
app.use('/api/log/natural', naturalRouter);

app.listen(PORT, () => {
  console.log(`Watchtower running on port ${PORT}`);
});
