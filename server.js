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

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const initDb = async () => {
    const client = await pool.connect();
    try {
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
        console.log('Database initialized');
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
        res.json(post);
    } catch (error) {
        console.error('Error fetching post:', error);
        res.status(500).json({ error: error.message });
    }
});

async function uploadToCloudinary(file) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'zoe-blog',
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
        if (req.files) {
            for (const file of req.files) {
                const imageUrl = await uploadToCloudinary(file);
                images.push(imageUrl);
            }
        }

        const result = await pool.query(
            'INSERT INTO posts (title, content, images) VALUES ($1, $2, $3) RETURNING *',
            [title, content, JSON.stringify(images)]
        );

        const newPost = result.rows[0];
        newPost.images = images;
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
        const newImages = [];
        
        if (req.files) {
            for (const file of req.files) {
                const imageUrl = await uploadToCloudinary(file);
                newImages.push(imageUrl);
            }
        }
        
        const allImages = [...existingImages, ...newImages];

        const result = await pool.query(
            'UPDATE posts SET title = $1, content = $2, images = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
            [title || existingPost.title, content || existingPost.content, JSON.stringify(allImages), postId]
        );

        const updatedPost = result.rows[0];
        updatedPost.images = allImages;
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

initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});