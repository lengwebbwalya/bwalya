require('dotenv').config();
const express = require('express');
const path = require('path');

const contentRoutes = require('./routes/content');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// Custom CORS handler — allows ALL origins including:
//   null  → file:// pages (opening HTML directly, Cordova)
//   localhost → local dev
//   any domain → Render or other hosting
app.use(function(req, res, next) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files for admin app
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// Serve static files for public app
app.use('/', express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/content', contentRoutes);
app.use('/api/upload', uploadRoutes);

// Admin app route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});

// Public app catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 Public App:  http://localhost:${PORT}`);
  console.log(`🔧 Admin App:   http://localhost:${PORT}/admin\n`);
});
