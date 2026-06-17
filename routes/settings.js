const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const cloudinary = require('../cloudinary');

// =============================================
// ABOUT SETTINGS
// Single settings record (id = 'about') stores
// a pointer to a Cloudinary JSON file containing
// all editable About-page fields. Supabase only
// stores: id, settings_url, updated_at — tiny row.
// =============================================

const SETTINGS_ID = 'about';
const PUBLIC_ID = 'contentapp/settings/about_settings';

// Default values used if no settings have been saved yet
const DEFAULTS = {
  name: 'Bwalya Lengwe',
  tagline: 'Content Creator & Curator',
  bio: 'Welcome to my content platform. I share books, articles, videos, audio and more. Explore and enjoy the collection of carefully curated knowledge and entertainment.',
  email: 'bwalya@email.com',
  phone: '+260000000000',
  whatsapp: '260000000000',
  photo_url: '',
  style: {
    name_font_size: 32,
    name_color: '#1a1814',
    tagline_font_size: 16,
    tagline_color: '#7a7060',
    bio_font_size: 17,
    bio_color: '#3d3830',
  },
  layout: {
    photo_size: 100,        // px, width/height
    photo_border_width: 3,  // px
    photo_border_color: '#e0dbd0',
    photo_position: 'center', // center | left | right
  },
};

async function uploadSettingsToCloudinary(obj) {
  return new Promise((resolve, reject) => {
    const buffer = Buffer.from(JSON.stringify(obj), 'utf-8');
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: PUBLIC_ID,
        resource_type: 'raw',
        format: 'json',
        overwrite: true,
        invalidate: true, // bust CDN cache so edits show immediately
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

async function fetchSettingsFromCloudinary(url) {
  if (!url) return null;
  try {
    // Bust cache with timestamp so admin edits are reflected immediately
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now());
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// GET current settings (public + admin use this)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('id', SETTINGS_ID)
      .single();

    if (error || !data || !data.settings_url) {
      // No settings saved yet — return defaults
      return res.json(DEFAULTS);
    }

    const settings = await fetchSettingsFromCloudinary(data.settings_url);
    res.json(settings || DEFAULTS);
  } catch (err) {
    console.error('Settings fetch error:', err);
    res.json(DEFAULTS); // never break the public app — fall back to defaults
  }
});

// PUT update settings (admin only)
router.put('/', async (req, res) => {
  try {
    const incoming = req.body || {};

    // Merge with defaults so partial updates don't wipe other fields
    const merged = {
      name: incoming.name ?? DEFAULTS.name,
      tagline: incoming.tagline ?? DEFAULTS.tagline,
      bio: incoming.bio ?? DEFAULTS.bio,
      email: incoming.email ?? DEFAULTS.email,
      phone: incoming.phone ?? DEFAULTS.phone,
      whatsapp: incoming.whatsapp ?? DEFAULTS.whatsapp,
      photo_url: incoming.photo_url ?? '',
      style: { ...DEFAULTS.style, ...(incoming.style || {}) },
      layout: { ...DEFAULTS.layout, ...(incoming.layout || {}) },
    };

    const settings_url = await uploadSettingsToCloudinary(merged);

    // Upsert the tiny Supabase pointer row
    const { error } = await supabase
      .from('settings')
      .upsert({ id: SETTINGS_ID, settings_url, updated_at: new Date().toISOString() });

    if (error) throw error;

    res.json(merged);
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
