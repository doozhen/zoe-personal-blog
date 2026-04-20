require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.redirect('/verify.html');
});

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Access log middleware - removed, will log only on verified visitor

const initDb = async () => {
    const client = await pool.connect();
    try {
        // Create posts table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                images TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add videos column to posts table if it doesn't exist
        try {
            await client.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS videos TEXT');
            console.log('Added videos column to posts table if it didn\'t exist');
        } catch (error) {
            console.log('Error adding videos column to posts table:', error.message);
        }

        // Create comments table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL,
                author TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
            )
        `);

        // Create guestbook table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS guestbook (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                images TEXT,
                videos TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Drop author column from guestbook table if it exists
        try {
            await client.query('ALTER TABLE guestbook DROP COLUMN IF EXISTS author');
            console.log('Dropped author column from guestbook table if it existed');
        } catch (error) {
            console.log('Error dropping author column:', error.message);
        }

        // Add title column to guestbook table if it doesn't exist
        try {
            await client.query('ALTER TABLE guestbook ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT \'\'');
            console.log('Added title column to guestbook table if it didn\'t exist');
        } catch (error) {
            if (!error.message.includes('column "title" of relation "guestbook" already exists')) {
                throw error;
            }
        }

        // Add images column to guestbook table if it doesn't exist
        try {
            await client.query('ALTER TABLE guestbook ADD COLUMN IF NOT EXISTS images TEXT');
            console.log('Added images column to guestbook table if it didn\'t exist');
        } catch (error) {
            if (!error.message.includes('column "images" of relation "guestbook" already exists')) {
                throw error;
            }
        }

        // Add videos column to guestbook table if it doesn't exist
        try {
            await client.query('ALTER TABLE guestbook ADD COLUMN IF NOT EXISTS videos TEXT');
            console.log('Added videos column to guestbook table if it didn\'t exist');
        } catch (error) {
            if (!error.message.includes('column "videos" of relation "guestbook" already exists')) {
                throw error;
            }
        }

        // Create access logs table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS access_logs (
                id SERIAL PRIMARY KEY,
                ip_address TEXT NOT NULL,
                user_agent TEXT,
                accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error initializing database:', error);
        throw error;
    } finally {
        client.release();
    }
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

app.get('/api/posts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM posts ORDER BY created_at DESC');
        const posts = result.rows.map(row => {
            row.images = row.images ? JSON.parse(row.images) : [];
            row.videos = row.videos ? JSON.parse(row.videos) : [];
            return row;
        });
        res.json(posts);
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/posts/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        const post = result.rows[0];
        post.images = post.images ? JSON.parse(post.images) : [];
        post.videos = post.videos ? JSON.parse(post.videos) : [];
        res.json(post);
    } catch (error) {
        console.error('Error fetching post:', error);
        res.status(500).json({ error: error.message });
    }
});

async function uploadToCloudinary(file, folder = 'zoe-blog') {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: 'auto',
                transformation: [{ quality: 'auto', fetch_format: 'auto' }]
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result.secure_url);
                }
            }
        );
        stream.end(file.buffer);
    });
}

app.post('/api/posts', upload.array('images', 10), async (req, res) => {
    try {
        const { title, content } = req.body;
        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content are required' });
        }

        const images = [];
        const videos = [];
        if (req.files) {
            for (const file of req.files) {
                const fileUrl = await uploadToCloudinary(file);
                if (file.mimetype.startsWith('video/')) {
                    videos.push(fileUrl);
                } else {
                    images.push(fileUrl);
                }
            }
        }

        const result = await pool.query(
            'INSERT INTO posts (title, content, images, videos) VALUES ($1, $2, $3, $4) RETURNING *',
            [title, content, JSON.stringify(images), JSON.stringify(videos)]
        );

        const newPost = result.rows[0];
        newPost.images = images;
        newPost.videos = videos;
        res.status(201).json(newPost);
    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/posts/:id', upload.array('images', 10), async (req, res) => {
    try {
        const { title, content } = req.body;
        const postId = req.params.id;

        const existingResult = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
        if (existingResult.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        const existingPost = existingResult.rows[0];

        const existingImages = existingPost.images ? JSON.parse(existingPost.images) : [];
        const existingVideos = existingPost.videos ? JSON.parse(existingPost.videos) : [];
        const newImages = [];
        const newVideos = [];

        if (req.files) {
            for (const file of req.files) {
                const fileUrl = await uploadToCloudinary(file);
                if (file.mimetype.startsWith('video/')) {
                    newVideos.push(fileUrl);
                } else {
                    newImages.push(fileUrl);
                }
            }
        }

        const allImages = [...existingImages, ...newImages];
        const allVideos = [...existingVideos, ...newVideos];

        const result = await pool.query(
            'UPDATE posts SET title = $1, content = $2, images = $3, videos = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
            [title || existingPost.title, content || existingPost.content, JSON.stringify(allImages), JSON.stringify(allVideos), postId]
        );

        const updatedPost = result.rows[0];
        updatedPost.images = allImages;
        updatedPost.videos = allVideos;
        res.json(updatedPost);
    } catch (error) {
        console.error('Error updating post:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/posts/:id', async (req, res) => {
    try {
        const postId = req.params.id;

        const existingResult = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
        if (existingResult.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        const post = existingResult.rows[0];

        if (post.images) {
            const images = JSON.parse(post.images);
            for (const imageUrl of images) {
                const publicId = imageUrl.substring(imageUrl.lastIndexOf('/') + 1, imageUrl.lastIndexOf('.'));
                await cloudinary.uploader.destroy(`zoe-blog/${publicId}`);
            }
        }

        if (post.videos) {
            const videos = JSON.parse(post.videos);
            for (const videoUrl of videos) {
                const publicId = videoUrl.substring(videoUrl.lastIndexOf('/') + 1, videoUrl.lastIndexOf('.'));
                await cloudinary.uploader.destroy(`zoe-blog/${publicId}`, { resource_type: 'video' });
            }
        }

        await pool.query('DELETE FROM posts WHERE id = $1', [postId]);
        res.json({ message: 'Post deleted successfully' });
    } catch (error) {
        console.error('Error deleting post:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/posts/:id/images/:imageIndex', async (req, res) => {
    try {
        const postId = req.params.id;
        const imageIndex = parseInt(req.params.imageIndex);

        const existingResult = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
        if (existingResult.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        const post = existingResult.rows[0];

        const images = post.images ? JSON.parse(post.images) : [];

        if (imageIndex < 0 || imageIndex >= images.length) {
            return res.status(400).json({ error: 'Invalid image index' });
        }

        const imageUrl = images[imageIndex];
        const publicId = imageUrl.substring(imageUrl.lastIndexOf('/') + 1, imageUrl.lastIndexOf('.'));
        await cloudinary.uploader.destroy(`zoe-blog/${publicId}`);

        images.splice(imageIndex, 1);

        await pool.query('UPDATE posts SET images = $1 WHERE id = $2', [JSON.stringify(images), postId]);

        res.json({ message: 'Image deleted successfully', images });
    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/posts/:id/videos/:videoIndex', async (req, res) => {
    try {
        const postId = req.params.id;
        const videoIndex = parseInt(req.params.videoIndex);

        const existingResult = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
        if (existingResult.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        const post = existingResult.rows[0];

        const videos = post.videos ? JSON.parse(post.videos) : [];

        if (videoIndex < 0 || videoIndex >= videos.length) {
            return res.status(400).json({ error: 'Invalid video index' });
        }

        const videoUrl = videos[videoIndex];
        const publicId = videoUrl.substring(videoUrl.lastIndexOf('/') + 1, videoUrl.lastIndexOf('.'));
        await cloudinary.uploader.destroy(`zoe-blog/${publicId}`, { resource_type: 'video' });

        videos.splice(videoIndex, 1);

        await pool.query('UPDATE posts SET videos = $1 WHERE id = $2', [JSON.stringify(videos), postId]);

        res.json({ message: 'Video deleted successfully', videos });
    } catch (error) {
        console.error('Error deleting video:', error);
        res.status(500).json({ error: error.message });
    }
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
    }
    if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
});

app.get('/api/posts/:postId/comments', async (req, res) => {
    try {
        const { postId } = req.params;
        const result = await pool.query(
            'SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at DESC',
            [postId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/posts/:postId/comments', async (req, res) => {
    try {
        const { postId } = req.params;
        const { author, content } = req.body;

        if (!author || !content) {
            return res.status(400).json({ error: 'Author and content are required' });
        }

        const postCheck = await pool.query('SELECT id FROM posts WHERE id = $1', [postId]);
        if (postCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }

        const result = await pool.query(
            'INSERT INTO comments (post_id, author, content) VALUES ($1, $2, $3) RETURNING *',
            [postId, author, content]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating comment:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/comments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM comments WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        console.error('Error deleting comment:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/guestbook', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM guestbook ORDER BY created_at DESC');
        const entries = result.rows.map(row => {
            row.images = row.images ? JSON.parse(row.images) : [];
            row.videos = row.videos ? JSON.parse(row.videos) : [];
            return row;
        });
        res.json(entries);
    } catch (error) {
        console.error('Error fetching guestbook entries:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/guestbook/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM guestbook WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Guestbook entry not found' });
        }
        const entry = result.rows[0];
        entry.images = entry.images ? JSON.parse(entry.images) : [];
        entry.videos = entry.videos ? JSON.parse(entry.videos) : [];
        res.json(entry);
    } catch (error) {
        console.error('Error fetching guestbook entry:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/guestbook/:id', upload.array('images', 10), async (req, res) => {
    try {
        const { title, content } = req.body;
        const entryId = req.params.id;

        const existingResult = await pool.query('SELECT * FROM guestbook WHERE id = $1', [entryId]);
        if (existingResult.rows.length === 0) {
            return res.status(404).json({ error: 'Guestbook entry not found' });
        }
        const existingEntry = existingResult.rows[0];

        const existingImages = existingEntry.images ? JSON.parse(existingEntry.images) : [];
        const existingVideos = existingEntry.videos ? JSON.parse(existingEntry.videos) : [];
        const newImages = [];

        if (req.files) {
            for (const file of req.files) {
                const fileUrl = await uploadToCloudinary(file, 'zoe-blog/guestbook');
                newImages.push(fileUrl);
            }
        }

        const allImages = [...existingImages, ...newImages];

        const result = await pool.query(
            'UPDATE guestbook SET title = $1, content = $2, images = $3, videos = $4 WHERE id = $5 RETURNING *',
            [title || existingEntry.title, content || existingEntry.content, JSON.stringify(allImages), JSON.stringify(existingVideos), entryId]
        );

        const updatedEntry = result.rows[0];
        updatedEntry.images = allImages;
        updatedEntry.videos = existingVideos;
        res.json(updatedEntry);
    } catch (error) {
        console.error('Error updating guestbook entry:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/guestbook', upload.array('images', 9), async (req, res) => {
    try {
        const { title, content } = req.body;

        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content are required' });
        }

        const images = [];

        if (req.files) {
            for (const file of req.files) {
                const fileUrl = await uploadToCloudinary(file, 'zoe-blog/guestbook');
                images.push(fileUrl);
            }
        }

        const result = await pool.query(
            'INSERT INTO guestbook (title, content, images, videos) VALUES ($1, $2, $3, $4) RETURNING *',
            [title, content, JSON.stringify(images), JSON.stringify([])]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating guestbook entry:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/guestbook/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const existingResult = await pool.query('SELECT * FROM guestbook WHERE id = $1', [id]);
        if (existingResult.rows.length === 0) {
            return res.status(404).json({ error: 'Guestbook entry not found' });
        }
        const entry = existingResult.rows[0];

        if (entry.images) {
            const images = JSON.parse(entry.images);
            for (const imageUrl of images) {
                const publicId = imageUrl.substring(imageUrl.lastIndexOf('/') + 1, imageUrl.lastIndexOf('.'));
                await cloudinary.uploader.destroy(`zoe-blog/guestbook/${publicId}`);
            }
        }

        if (entry.videos) {
            const videos = JSON.parse(entry.videos);
            for (const videoUrl of videos) {
                const publicId = videoUrl.substring(videoUrl.lastIndexOf('/') + 1, videoUrl.lastIndexOf('.'));
                await cloudinary.uploader.destroy(`zoe-blog/guestbook/${publicId}`, { resource_type: 'video' });
            }
        }

        await pool.query('DELETE FROM guestbook WHERE id = $1', [id]);
        res.json({ message: 'Guestbook entry deleted successfully' });
    } catch (error) {
        console.error('Error deleting guestbook entry:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/log-access', async (req, res) => {
    try {
        const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];

        await pool.query(
            'INSERT INTO access_logs (ip_address, user_agent) VALUES ($1, $2)',
            [ipAddress, userAgent]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error logging access:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/access-logs', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== 'zoeadmin') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
        const result = await pool.query('SELECT * FROM access_logs ORDER BY accessed_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching access logs:', error);
        res.status(500).json({ error: error.message });
    }
});

initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
