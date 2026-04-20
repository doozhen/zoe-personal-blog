<template>
  <div class="home-container">
    <div class="container">
      <header>
        <h1>Zoe's Blog</h1>
        <p>zoe乱七八糟的的的的的博客,当然你也可以向我提问,或许我会为你解答。</p>
        <div class="nav">
          <button v-if="isOwner" class="nav-btn" @click="openEditor">撰写新日志</button>
          <button class="nav-btn" @click="openGuestbook">留言</button>
          <button class="nav-btn" @click="loadPosts">刷新列表</button>
          <button v-if="isOwner" class="nav-btn" @click="openAccessLogs">访问日志</button>
        </div>
      </header>

      <div id="posts-container">
        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="allEntries.length === 0" class="empty-state">
          <div class="icon">📝</div>
          <h3>还没有内容</h3>
          <p>点击"撰写新日志"或"留言"开始创作吧！</p>
        </div>
        <div v-else class="posts-grid">
          <div 
            v-for="entry in allEntries" 
            :key="entry.id" 
            class="post-card" 
            @click="viewEntry(entry)"
          >
            <h3>{{ entry.title }}</h3>
            <p class="date">{{ formatDate(entry.created_at) }}</p>
            <p class="preview">{{ entry.content.substring(0, 100) }}...</p>
            <div v-if="entry.videos && entry.videos.length > 0" class="video-indicator">
              🎬 包含{{ entry.videos.length }}个视频
            </div>
            <div v-if="entry.images && entry.images.length > 0" class="images-preview">
              <img 
                v-for="(img, index) in entry.images.slice(0, 4)" 
                :key="index" 
                :src="img" 
                alt="preview"
              >
              <span v-if="entry.images.length > 4">+{{ entry.images.length - 4 }}</span>
            </div>
            <div v-if="isOwner" class="post-actions" @click.stop>
              <button class="btn-edit" @click="editEntry(entry)">编辑</button>
              <button class="btn-delete" @click="deleteEntry(entry)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑器模态框 -->
    <div class="modal" :class="{ active: editorModalVisible }">
      <div class="modal-content">
        <h2>{{ editingEntry ? (editingEntry.type === 'post' ? '编辑日志' : '编辑留言') : '撰写新日志' }}</h2>
        <form @submit.prevent="submitPost">
          <input type="hidden" v-model="editingEntryId">

          <div class="form-group">
            <label for="post-title">标题</label>
            <input type="text" id="post-title" v-model="formData.title" placeholder="请输入日志标题" required>
          </div>

          <div class="form-group">
            <label for="post-content">内容</label>
            <textarea id="post-content" v-model="formData.content" placeholder="请输入日志内容" required></textarea>
          </div>

          <div class="form-group">
            <label>图片上传</label>
            <div 
              class="upload-area" 
              @click="document.getElementById('image-input').click()"
              @dragover.prevent
              @drop="handleImageDrop"
            >
              <div class="upload-icon">📷</div>
              <p>点击或拖拽图片到此处上传</p>
              <p style="font-size: 0.85rem; color: #888; margin-top: 5px;">支持 JPG、PNG、GIF、WebP 格式，最多10张，单张最大50MB</p>
              <input type="file" id="image-input" multiple accept="image/*" @change="handleImageSelect">
            </div>
            <div class="preview-container" id="image-preview-container">
              <div 
                v-for="(image, index) in selectedImages" 
                :key="index" 
                class="preview-item"
              >
                <img :src="typeof image === 'string' ? image : URL.createObjectURL(image)" alt="preview">
                <button 
                  class="remove-btn" 
                  @click="removeImage(index)"
                >×</button>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>视频上传</label>
            <div 
              class="upload-area" 
              :class="{ disabled: videoUploading }"
              @click="document.getElementById('video-input').click()"
              @dragover.prevent
              @drop="handleVideoDrop"
            >
              <div class="upload-icon">🎬</div>
              <p>点击或拖拽视频到此处上传</p>
              <p style="font-size: 0.85rem; color: #888; margin-top: 5px;">支持 MP4、MOV、AVI 格式，最多5个，单个最大50MB，大于10MB会自动压缩</p>
              <input type="file" id="video-input" multiple accept="video/*" @change="handleVideoSelect">
            </div>
            <div class="preview-container" id="video-preview-container">
              <div 
                v-for="(video, index) in selectedVideos" 
                :key="index" 
                class="preview-item"
              >
                <video :src="typeof video === 'string' ? video : URL.createObjectURL(video)" controls></video>
                <button 
                  class="remove-btn" 
                  @click="removeVideo(index)"
                >×</button>
                <div v-if="video.isCompressed" class="compress-indicator">已压缩</div>
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="closeEditor">取消</button>
            <button type="submit" class="btn-submit" :disabled="submitting">
              {{ submitting ? '提交中...' : (editingEntry ? '保存修改' : '发布') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 查看模态框 -->
    <div class="modal" :class="{ active: viewModalVisible }">
      <div class="modal-content view-modal-content">
        <h2>{{ currentEntry?.title }}</h2>
        <p id="view-date">{{ currentEntry ? formatDate(currentEntry.created_at) : '' }}</p>
        <div id="view-content">{{ currentEntry?.content }}</div>
        <div id="view-media" class="view-media-container">
          <div v-if="currentEntry?.images && currentEntry.images.length > 0" class="image-grid">
            <div 
              v-for="(img, index) in currentEntry.images" 
              :key="index" 
              class="image-item"
              @click="openImageModal(img)"
            >
              <img :src="img" alt="image">
            </div>
          </div>
          <video 
            v-for="(video, index) in currentEntry?.videos || []" 
            :key="index" 
            :src="video" 
            controls
          ></video>
        </div>

        <div class="comments-section">
          <h3>评论</h3>
          <div id="comments-list">
            <div 
              v-for="comment in currentEntry?.comments || []" 
              :key="comment.id" 
              class="comment-item"
            >
              <strong>{{ comment.author }}:</strong> {{ comment.content }}
              <span class="comment-date">{{ formatDate(comment.created_at) }}</span>
            </div>
          </div>
          <div class="comment-form">
            <input 
              type="text" 
              v-model="commentForm.author" 
              placeholder="你的名字"
            >
            <input 
              type="text" 
              v-model="commentForm.content" 
              placeholder="写下你的评论..."
            >
            <button @click="submitComment">发送</button>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel" @click="closeViewer">关闭</button>
        </div>
      </div>
    </div>

    <!-- 留言模态框 -->
    <div class="modal" :class="{ active: guestbookModalVisible }">
      <div class="modal-content">
        <h2>留言</h2>
        <form @submit.prevent="submitGuestbook">
          <div class="form-group">
            <label for="guestbook-title-input">标题</label>
            <input type="text" id="guestbook-title-input" v-model="guestbookForm.title" placeholder="请输入留言标题" required>
          </div>

          <div class="form-group">
            <label for="guestbook-content-input">内容</label>
            <textarea id="guestbook-content-input" v-model="guestbookForm.content" placeholder="请输入留言内容" required></textarea>
          </div>

          <div class="form-group">
            <label>图片（可选，最多9张）</label>
            <div 
              class="upload-area" 
              @click="document.getElementById('guestbook-image-input').click()"
            >
              <p>点击或拖拽图片到此处上传</p>
              <input type="file" id="guestbook-image-input" accept="image/*" multiple @change="handleGuestbookImageUpload">
            </div>
            <div class="image-preview-container" id="guestbook-image-preview-container">
              <div 
                v-for="(image, index) in guestbookImages" 
                :key="index" 
                class="preview-item"
              >
                <img :src="URL.createObjectURL(image)" alt="preview">
                <button 
                  class="remove-btn" 
                  @click="removeGuestbookImage(index)"
                >×</button>
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="closeGuestbook">取消</button>
            <button type="submit" class="btn-submit" :disabled="guestbookSubmitting">
              {{ guestbookSubmitting ? '发布中...' : '发布' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 图片模态框 -->
    <div class="image-modal" :class="{ active: imageModalVisible }">
      <span class="close-modal" @click="closeImageModal">&times;</span>
      <div class="image-modal-content">
        <img :src="currentImage" alt="Large image">
      </div>
    </div>

    <!-- 访问日志模态框 -->
    <div class="modal" :class="{ active: accessLogsModalVisible }">
      <div class="modal-content">
        <h2>访问日志</h2>
        <div id="access-logs-container">
          <div v-if="loadingLogs" class="loading">加载中...</div>
          <div v-else class="logs-list">
            <div 
              v-for="log in accessLogs" 
              :key="log.id" 
              class="log-item"
            >
              <span>{{ log.ip_address }}</span>
              <span>{{ formatDate(log.accessed_at) }}</span>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="closeAccessLogs">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'

// 状态管理
const loading = ref(true)
const allEntries = ref([])
const isOwner = ref(false)

// 编辑器状态
const editorModalVisible = ref(false)
const editingEntryId = ref(null)
const editingEntry = ref(null)
const formData = ref({ title: '', content: '' })
const selectedImages = ref([])
const selectedVideos = ref([])
const submitting = ref(false)
const videoUploading = ref(false)

// 查看状态
const viewModalVisible = ref(false)
const currentEntry = ref(null)
const commentForm = ref({ author: '', content: '' })

// 留言状态
const guestbookModalVisible = ref(false)
const guestbookForm = ref({ title: '', content: '' })
const guestbookImages = ref([])
const guestbookSubmitting = ref(false)

// 图片模态框
const imageModalVisible = ref(false)
const currentImage = ref('')

// 访问日志
const accessLogsModalVisible = ref(false)
const accessLogs = ref([])
const loadingLogs = ref(false)

// 计算属性
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString('zh-CN')
}

// 生命周期
onMounted(() => {
  isOwner.value = sessionStorage.getItem('isOwner') === 'true'
  loadPosts()
})

// 加载帖子和留言
const loadPosts = async () => {
  loading.value = true
  try {
    const [postsResponse, guestbookResponse] = await Promise.all([
      axios.get('/api/posts'),
      axios.get('/api/guestbook')
    ])

    const posts = postsResponse.data
    const guestbookEntries = guestbookResponse.data

    allEntries.value = [
      ...posts.map(post => ({ ...post, type: 'post' })),
      ...guestbookEntries.map(entry => ({ ...entry, type: 'guestbook' }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  } catch (error) {
    console.error('Error loading posts:', error)
  } finally {
    loading.value = false
  }
}

// 编辑器相关
const openEditor = (entry = null) => {
  if (entry) {
    editingEntryId.value = entry.id
    editingEntry.value = entry
    formData.value = { title: entry.title, content: entry.content }
    selectedImages.value = entry.images ? [...entry.images] : []
    selectedVideos.value = entry.videos ? [...entry.videos] : []
  } else {
    editingEntryId.value = null
    editingEntry.value = null
    formData.value = { title: '', content: '' }
    selectedImages.value = []
    selectedVideos.value = []
  }
  editorModalVisible.value = true
}

const closeEditor = () => {
  editorModalVisible.value = false
  editingEntryId.value = null
  editingEntry.value = null
  formData.value = { title: '', content: '' }
  selectedImages.value = []
  selectedVideos.value = []
}

const submitPost = async () => {
  submitting.value = true
  try {
    const formDataObj = new FormData()
    formDataObj.append('title', formData.value.title)
    formDataObj.append('content', formData.value.content)

    // 添加新图片
    selectedImages.value
      .filter(item => typeof item !== 'string')
      .forEach(file => {
        formDataObj.append('images', file)
      })

    // 添加新视频
    selectedVideos.value
      .filter(item => typeof item !== 'string')
      .forEach(file => {
        formDataObj.append('videos', file)
      })

    const isEditing = editingEntryId.value
    const isGuestbook = editingEntry?.value?.type === 'guestbook'
    const url = isGuestbook 
      ? `/api/guestbook/${editingEntryId.value}` 
      : (isEditing ? `/api/posts/${editingEntryId.value}` : '/api/posts')
    const method = isEditing ? 'PUT' : 'POST'

    await axios({
      url,
      method,
      data: formDataObj,
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

    alert(isGuestbook ? '留言已更新' : (isEditing ? '日志已更新' : '日志发布成功'))
    closeEditor()
    loadPosts()
  } catch (error) {
    console.error('Error submitting post:', error)
    alert('操作失败，请重试')
  } finally {
    submitting.value = false
  }
}

// 图片和视频处理
const handleImageDrop = (event) => {
  event.preventDefault()
  const files = Array.from(event.dataTransfer.files)
  handleImageFiles(files)
}

const handleImageSelect = (event) => {
  const files = Array.from(event.target.files)
  handleImageFiles(files)
  event.target.value = ''
}

const handleVideoDrop = (event) => {
  event.preventDefault()
  const files = Array.from(event.dataTransfer.files)
  handleVideoFiles(files)
}

const handleVideoSelect = (event) => {
  const files = Array.from(event.target.files)
  handleVideoFiles(files)
  event.target.value = ''
}

const compressImage = (file) => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      let width = img.width
      let height = img.height
      const maxWidth = 2000
      const maxHeight = 2000

      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }
      if (height > maxHeight) {
        width = (width * maxHeight) / height
        height = maxHeight
      }

      canvas.width = width
      canvas.height = height
      ctx.drawImage(img, 0, 0, width, height)

      let quality = 0.9

      const compress = () => {
        canvas.toBlob((blob) => {
          if (blob.size > 10 * 1024 * 1024 && quality > 0.1) {
            quality -= 0.1
            compress()
          } else {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now()
            })
            resolve(compressedFile)
          }
        }, file.type, quality)
      }

      compress()
    }

    img.src = URL.createObjectURL(file)
  })
}

const handleImageFiles = async (files) => {
  for (const file of files) {
    if (selectedImages.value.length >= 10) {
      alert('最多只能上传10张图片')
      return
    }

    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }

    if (file.size > 50 * 1024 * 1024) {
      alert('图片大小不能超过50MB')
      return
    }

    let processedFile = file
    if (file.size > 10 * 1024 * 1024) {
      processedFile = await compressImage(file)
    }

    selectedImages.value.push(processedFile)
  }
}

const handleVideoFiles = async (files) => {
  videoUploading.value = true
  try {
    for (const file of files) {
      if (selectedVideos.value.length >= 5) {
        alert('最多只能上传5个视频')
        return
      }

      if (!file.type.startsWith('video/')) {
        alert('请选择视频文件')
        return
      }

      if (file.size > 50 * 1024 * 1024) {
        alert('视频大小不能超过50MB')
        return
      }

      // 这里可以添加视频压缩逻辑
      selectedVideos.value.push(file)
    }
  } finally {
    videoUploading.value = false
  }
}

const removeImage = (index) => {
  selectedImages.value.splice(index, 1)
}

const removeVideo = (index) => {
  selectedVideos.value.splice(index, 1)
}

// 查看相关
const viewEntry = (entry) => {
  currentEntry.value = entry
  viewModalVisible.value = true
}

const closeViewer = () => {
  viewModalVisible.value = false
  currentEntry.value = null
  commentForm.value = { author: '', content: '' }
}

const submitComment = async () => {
  if (!commentForm.value.author || !commentForm.value.content) {
    alert('请填写评论信息')
    return
  }

  try {
    await axios.post(`/api/posts/${currentEntry.value.id}/comments`, {
      author: commentForm.value.author,
      content: commentForm.value.content
    })
    commentForm.value = { author: '', content: '' }
    loadPosts()
  } catch (error) {
    console.error('Error submitting comment:', error)
    alert('评论失败，请重试')
  }
}

// 留言相关
const openGuestbook = () => {
  guestbookForm.value = { title: '', content: '' }
  guestbookImages.value = []
  guestbookModalVisible.value = true
}

const closeGuestbook = () => {
  guestbookModalVisible.value = false
  guestbookForm.value = { title: '', content: '' }
  guestbookImages.value = []
}

const handleGuestbookImageUpload = (event) => {
  const files = Array.from(event.target.files)
  for (const file of files) {
    if (guestbookImages.value.length >= 9) {
      alert('最多只能上传9张图片')
      break
    }

    if (!file.type.startsWith('image/')) continue

    if (file.size > 50 * 1024 * 1024) {
      alert('图片大小不能超过50MB')
      continue
    }

    guestbookImages.value.push(file)
  }
  event.target.value = ''
}

const removeGuestbookImage = (index) => {
  guestbookImages.value.splice(index, 1)
}

const submitGuestbook = async () => {
  guestbookSubmitting.value = true
  try {
    const formDataObj = new FormData()
    formDataObj.append('title', guestbookForm.value.title)
    formDataObj.append('content', guestbookForm.value.content)

    guestbookImages.value.forEach(file => {
      formDataObj.append('images', file)
    })

    await axios({
      url: '/api/guestbook',
      method: 'POST',
      data: formDataObj,
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

    alert('留言已发布')
    closeGuestbook()
    loadPosts()
  } catch (error) {
    console.error('Error submitting guestbook:', error)
    alert('留言失败，请重试')
  } finally {
    guestbookSubmitting.value = false
  }
}

// 图片模态框
const openImageModal = (image) => {
  currentImage.value = image
  imageModalVisible.value = true
}

const closeImageModal = () => {
  imageModalVisible.value = false
  currentImage.value = ''
}

// 访问日志
const openAccessLogs = async () => {
  loadingLogs.value = true
  try {
    const response = await axios.get('/api/access-logs', {
      headers: {
        'x-admin-key': 'zoeadmin'
      }
    })
    accessLogs.value = response.data
  } catch (error) {
    console.error('Error loading access logs:', error)
  } finally {
    loadingLogs.value = false
  }
  accessLogsModalVisible.value = true
}

const closeAccessLogs = () => {
  accessLogsModalVisible.value = false
  accessLogs.value = []
}

// 编辑和删除
const editEntry = (entry) => {
  openEditor(entry)
}

const deleteEntry = async (entry) => {
  if (confirm(`确定要删除"${entry.title}"吗？`)) {
    try {
      const url = entry.type === 'post' 
        ? `/api/posts/${entry.id}` 
        : `/api/guestbook/${entry.id}`
      await axios.delete(url)
      loadPosts()
    } catch (error) {
      console.error('Error deleting entry:', error)
      alert('删除失败，请重试')
    }
  }
}
</script>

<style scoped>
.home-container {
  min-height: 100vh;
  background: url('/src/previewFix.jpg') no-repeat center center fixed;
  background-size: cover;
  padding: 20px;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
}

header {
  text-align: center;
  padding: 40px 0;
  color: white;
}

header h1 {
  font-size: 2.5rem;
  margin-bottom: 10px;
}

header p {
  font-size: 1.1rem;
  opacity: 0.9;
}

.nav {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 20px;
}

.nav-btn {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: none;
  padding: 12px 30px;
  border-radius: 25px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.3s ease;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.posts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 25px;
  margin-top: 30px;
}

.post-card {
  background: white;
  border-radius: 15px;
  padding: 25px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
}

.post-card:hover {
  transform: translateY(-5px);
}

.post-card h3 {
  color: #333;
  margin-bottom: 10px;
  font-size: 1.4rem;
}

.post-card .date {
  color: #888;
  font-size: 0.9rem;
  margin-bottom: 15px;
}

.post-card .preview {
  color: #555;
  line-height: 1.6;
  margin-bottom: 15px;
  max-height: 100px;
  overflow: hidden;
}

.post-card .images-preview {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 15px;
}

.post-card .images-preview img {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 8px;
}

.post-card .video-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #ff6b6b;
  color: white;
  padding: 5px 10px;
  border-radius: 5px;
  font-size: 0.85rem;
  margin-bottom: 10px;
}

.post-actions {
  display: flex;
  gap: 10px;
}

.post-actions button {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.3s ease;
}

.btn-edit {
  background: #667eea;
  color: white;
}

.btn-edit:hover {
  background: #5a6fd6;
}

.btn-delete {
  background: #ff6b6b;
  color: white;
}

.btn-delete:hover {
  background: #ee5a5a;
}

.modal {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  z-index: 1000;
  overflow-y: auto;
  padding: 20px;
}

.modal.active {
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.modal-content {
  background: white;
  border-radius: 20px;
  padding: 40px;
  max-width: 800px;
  width: 100%;
  margin: 40px auto;
}

.modal-content h2 {
  margin-bottom: 30px;
  color: #333;
}

.form-group {
  margin-bottom: 25px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #555;
  font-weight: 600;
}

.form-group input[type="text"],
.form-group textarea {
  width: 100%;
  padding: 12px 15px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 1rem;
  transition: border-color 0.3s ease;
}

.form-group input[type="text"]:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #667eea;
}

.form-group textarea {
  min-height: 200px;
  resize: vertical;
  font-family: inherit;
}

.upload-area {
  border: 2px dashed #ccc;
  border-radius: 10px;
  padding: 30px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
}

.upload-area:hover {
  border-color: #667eea;
  background: #f8f8ff;
}

.upload-area.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.upload-area input[type="file"] {
  display: none;
}

.upload-icon {
  font-size: 3rem;
  margin-bottom: 10px;
}

.preview-container {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
  margin-top: 20px;
}

.preview-item {
  position: relative;
  width: 120px;
  height: 120px;
}

.preview-item img,
.preview-item video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 10px;
  border: 2px solid #e0e0e0;
}

.preview-item .remove-btn {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 25px;
  height: 25px;
  background: #ff6b6b;
  color: white;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-item .compress-indicator {
  position: absolute;
  bottom: -5px;
  left: -5px;
  background: #4caf50;
  color: white;
  padding: 2px 5px;
  border-radius: 5px;
  font-size: 0.7rem;
}

.modal-actions {
  display: flex;
  gap: 15px;
  margin-top: 30px;
}

.modal-actions button {
  flex: 1;
  padding: 15px;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-submit {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-submit:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-cancel {
  background: #e0e0e0;
  color: #555;
}

.btn-cancel:hover {
  background: #d0d0d0;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: white;
}

.empty-state .icon {
  font-size: 4rem;
  margin-bottom: 20px;
}

.empty-state h3 {
  font-size: 1.5rem;
  margin-bottom: 10px;
}

.loading {
  text-align: center;
  padding: 40px;
  color: white;
}

.comments-section {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 10px;
  margin-top: 20px;
}

.view-media-container {
  margin-bottom: 20px;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin: 10px 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.image-item {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 6px;
  cursor: pointer;
  box-sizing: border-box;
}

.image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
  box-sizing: border-box;
}

.image-item:hover img {
  transform: scale(1.05);
}

.view-media-container video {
  max-width: 100%;
  border-radius: 8px;
  margin: 10px 0;
}

.view-modal-content {
  box-sizing: border-box;
  overflow: hidden;
}

.comment-item {
  margin-bottom: 10px;
  padding: 10px;
  background: #f0f0f0;
  border-radius: 8px;
}

.comment-date {
  display: block;
  font-size: 0.8rem;
  color: #888;
  margin-top: 5px;
}

.comment-form {
  display: flex;
  gap: 10px;
  margin-top: 15px;
}

.comment-form input {
  flex: 1;
  padding: 10px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
}

.comment-form button {
  padding: 10px 20px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.image-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  display: none;
}

.image-modal.active {
  display: flex;
}

.image-modal-content {
  max-width: 90%;
  max-height: 90%;
}

.image-modal-content img {
  max-width: 100%;
  max-height: 80vh;
  border-radius: 10px;
}

.close-modal {
  position: absolute;
  top: 20px;
  right: 30px;
  color: white;
  font-size: 40px;
  font-weight: bold;
  cursor: pointer;
  z-index: 1001;
}

.close-modal:hover {
  color: #ccc;
}

.logs-list {
  max-height: 400px;
  overflow-y: auto;
}

.log-item {
  display: flex;
  justify-content: space-between;
  padding: 10px;
  border-bottom: 1px solid #eee;
}

@media (max-width: 768px) {
  .posts-grid {
    grid-template-columns: 1fr;
  }

  .modal-content {
    padding: 25px;
    margin: 20px auto;
  }

  .comment-form {
    flex-direction: column;
  }
}
</style>