const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('../cloudinary');
const { v4: uuidv4 } = require('uuid');

// Use memory storage so we can stream to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

// Helper: upload buffer to Cloudinary
function uploadToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
    stream.end(buffer);
  });
}

// Upload cover image
router.post('/image', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const result = await uploadToCloudinary(req.file.buffer, {
      folder: 'contentapp/images',
      public_id: `img_${uuidv4()}`,
      resource_type: 'image',
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    });

    res.json({
      url: result.secure_url,
      public_id: result.public_id,
      width: result.width,
      height: result.height,
    });
  } catch (err) {
    console.error('Image upload error:', err);
    res.status(500).json({ error: 'Image upload failed', details: err.message });
  }
});

// Upload PDF / document file
router.post('/document', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const result = await uploadToCloudinary(req.file.buffer, {
      folder: 'contentapp/documents',
      public_id: `doc_${uuidv4()}`,
      resource_type: 'raw',
    });

    res.json({
      url: result.secure_url,
      public_id: result.public_id,
      bytes: result.bytes,
      format: result.format,
    });
  } catch (err) {
    console.error('Document upload error:', err);
    res.status(500).json({ error: 'Document upload failed', details: err.message });
  }
});

// Upload video
router.post('/video', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const result = await uploadToCloudinary(req.file.buffer, {
      folder: 'contentapp/videos',
      public_id: `vid_${uuidv4()}`,
      resource_type: 'video',
    });

    res.json({
      url: result.secure_url,
      public_id: result.public_id,
      duration: result.duration,
    });
  } catch (err) {
    console.error('Video upload error:', err);
    res.status(500).json({ error: 'Video upload failed', details: err.message });
  }
});

// Upload audio
router.post('/audio', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const result = await uploadToCloudinary(req.file.buffer, {
      folder: 'contentapp/audio',
      public_id: `aud_${uuidv4()}`,
      resource_type: 'video', // Cloudinary uses 'video' for audio too
    });

    res.json({
      url: result.secure_url,
      public_id: result.public_id,
      duration: result.duration,
    });
  } catch (err) {
    console.error('Audio upload error:', err);
    res.status(500).json({ error: 'Audio upload failed', details: err.message });
  }
});

// Delete a file from Cloudinary
router.delete('/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    const { resource_type = 'image' } = req.query;
    await cloudinary.uploader.destroy(decodeURIComponent(publicId), { resource_type });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Delete failed', details: err.message });
  }
});

module.exports = router;
