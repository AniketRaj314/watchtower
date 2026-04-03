require('dotenv').config();

const express = require('express');
const sessionAuth = require('./middleware/sessionAuth');
const authRouter = require('./routes/auth');
const mealsRouter = require('./routes/meals');
const readingsRouter = require('./routes/readings');
const medicationsRouter = require('./routes/medications');
const dayRouter = require('./routes/day');
const naturalRouter = require('./routes/natural');
const demoRouter = require('./routes/demo');

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

app.listen(PORT, () => {
  console.log(`Watchtower running on port ${PORT}`);
});
