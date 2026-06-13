const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const cloudinary = require('../cloudinary');
const { v4: uuidv4 } = require('uuid');

// Strategy:
// - Supabase stores: id, type, title, slug, cover_url, file_url, tags, published_at, views, featured
// - Cloudinary raw JSON stores: body/content text (uploaded as raw JSON file) — url stored as content_url in supabase
// - This keeps Supabase rows tiny (< 500 chars of text each)

// Helper: upload JSON content to Cloudinary as raw file
async function uploadContentToCloudinary(contentObj, publicId) {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(contentObj);
    const buffer = Buffer.from(json, 'utf-8');
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'contentapp/content',
        public_id: publicId,
        resource_type: 'raw',
        format: 'json',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

// Helper: fetch content JSON from Cloudinary URL
async function fetchContentFromCloudinary(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// GET all content (list view - only metadata from Supabase)
router.get('/', async (req, res) => {
  try {
    const { type, featured, limit = 20, offset = 0, search } = req.query;

    let query = supabase
      .from('content')
      .select('id, type, title, slug, cover_url, file_url, tags, published_at, views, featured, created_at')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (type && type !== 'all') query = query.eq('type', type);
    if (featured === 'true') query = query.eq('featured', true);
    if (search) query = query.ilike('title', `%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ items: data, total: count });
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET single content item (includes full content from Cloudinary)
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const { data, error } = await supabase
      .from('content')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });

    // Increment views — skip if ?nocount=1
    const newViews = req.query.nocount ? (data.views || 0) : (data.views || 0) + 1;
    if (!req.query.nocount) {
      await supabase
        .from('content')
        .update({ views: newViews })
        .eq('id', data.id);
    }

    // Fetch full content from Cloudinary if content_url exists
    let richContent = null;
    if (data.content_url) {
      richContent = await fetchContentFromCloudinary(data.content_url);
    }

    // Return incremented count in response
    res.json({ ...data, views: newViews, rich_content: richContent });
  } catch (err) {
    console.error('Fetch single error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST create new content
router.post('/', async (req, res) => {
  try {
    const {
      type,        // 'book' | 'article' | 'video' | 'audio' | 'link' | 'announcement' | 'event'
      title,
      tags,        // array of strings
      cover_url,   // from Cloudinary upload
      file_url,    // PDF/video/audio URL from Cloudinary
      featured,
      // Rich content fields stored in Cloudinary:
      body,        // article body HTML/text
      description, // summary shown in list
      author,
      external_link,
      extra_metadata, // any extra key-value pairs
    } = req.body;

    if (!title || !type) {
      return res.status(400).json({ error: 'title and type are required' });
    }

    const id = uuidv4();
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '-' + id.slice(0, 6);

    // Upload rich content (description, body, author, etc.) to Cloudinary as JSON
    let content_url = null;
    if (body || description || author || external_link || extra_metadata) {
      const contentObj = {};
      if (body) contentObj.body = body;
      if (description) contentObj.description = description;
      if (author) contentObj.author = author;
      if (external_link) contentObj.external_link = external_link;
      if (extra_metadata) contentObj.extra_metadata = extra_metadata;

      content_url = await uploadContentToCloudinary(contentObj, `content_${id}`);
    }

    // Insert minimal row into Supabase
    const row = {
      id,
      type,
      title,
      slug,
      cover_url: cover_url || null,
      file_url: file_url || null,
      content_url,
      tags: tags || [],
      featured: featured || false,
      views: 0,
      published_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('content').insert([row]).select().single();
    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error('Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update content
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      type, title, tags, cover_url, file_url, featured,
      body, description, author, external_link, extra_metadata,
    } = req.body;

    // Get existing record
    const { data: existing, error: fetchErr } = await supabase
      .from('content')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    // Re-upload content JSON to Cloudinary (overwrites existing)
    let content_url = existing.content_url;
    if (body !== undefined || description !== undefined || author !== undefined || external_link !== undefined || extra_metadata !== undefined) {
      const contentObj = {};
      if (body) contentObj.body = body;
      if (description) contentObj.description = description;
      if (author) contentObj.author = author;
      if (external_link) contentObj.external_link = external_link;
      if (extra_metadata) contentObj.extra_metadata = extra_metadata;

      content_url = await uploadContentToCloudinary(contentObj, `content_${id}`);
    }

    const updates = {};
    if (type) updates.type = type;
    if (title) {
      updates.title = title;
      updates.slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + id.slice(0, 6);
    }
    if (tags !== undefined) updates.tags = tags;
    if (cover_url !== undefined) updates.cover_url = cover_url;
    if (file_url !== undefined) updates.file_url = file_url;
    if (featured !== undefined) updates.featured = featured;
    if (content_url) updates.content_url = content_url;

    const { data, error } = await supabase
      .from('content')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: err.message });
  }
});


// Extract Cloudinary public_id from a URL
// e.g. https://res.cloudinary.com/cloud/image/upload/v123/contentapp/images/img_abc.jpg
// → contentapp/images/img_abc
function extractPublicId(url) {
  if (!url || !url.includes('/upload/')) return null;
  let after = url.split('/upload/')[1];
  // Remove version prefix v12345/
  after = after.replace(/^v\d+\//, '');
  // Remove file extension
  after = after.replace(/\.[^/.]+$/, '');
  return after;
}

function getResourceType(url) {
  if (!url) return 'image';
  if (url.includes('/video/upload/')) return 'video';
  if (url.includes('/raw/upload/'))   return 'raw';
  return 'image';
}

// DELETE content — removes ALL associated Cloudinary files
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch full record first so we know what to delete
    const { data: existing } = await supabase
      .from('content')
      .select('*')
      .eq('id', id)
      .single();

    if (existing) {
      const cleanups = [];

      // 1. Cover image
      if (existing.cover_url) {
        const pid = extractPublicId(existing.cover_url);
        if (pid) cleanups.push(
          cloudinary.uploader.destroy(pid, { resource_type: 'image' }).catch(() => {})
        );
      }

      // 2. Attached file (PDF, video, audio)
      if (existing.file_url) {
        const pid = extractPublicId(existing.file_url);
        const rt  = getResourceType(existing.file_url);
        if (pid) cleanups.push(
          cloudinary.uploader.destroy(pid, { resource_type: rt }).catch(() => {})
        );
      }

      // 3. Content JSON (description, body, author stored as raw JSON)
      if (existing.content_url) {
        const pid = extractPublicId(existing.content_url);
        if (pid) cleanups.push(
          cloudinary.uploader.destroy(pid, { resource_type: 'raw' }).catch(() => {})
        );
      }

      // Run all deletions in parallel — don't let one failure block others
      await Promise.all(cleanups);
    }

    // Remove from Supabase
    const { error } = await supabase.from('content').delete().eq('id', id);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET stats
router.get('/meta/stats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('content')
      .select('type, views');

    if (error) throw error;

    const stats = {
      total: data.length,
      totalViews: data.reduce((sum, i) => sum + (i.views || 0), 0),
      byType: {},
    };

    data.forEach(item => {
      stats.byType[item.type] = (stats.byType[item.type] || 0) + 1;
    });

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
