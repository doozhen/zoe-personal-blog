<template>
  <div class="visitors-container">
    <div class="container">
      <div class="header">
        <h1>访客记录</h1>
        <router-link to="/" class="back-btn">返回认证页</router-link>
      </div>

      <div v-if="!isAuthenticated" id="loginSection" class="login-box">
        <h2>管理员验证</h2>
        <div class="form-group">
          <label for="adminKey">请输入管理员密钥</label>
          <input 
            type="text" 
            id="adminKey" 
            v-model="adminKey" 
            placeholder="输入管理员密钥"
            @keyup.enter="verifyAdmin"
          >
        </div>
        <div v-if="error" class="error-msg">{{ error }}</div>
        <button @click="verifyAdmin" class="login-btn">验证</button>
      </div>

      <div v-else id="logsSection" class="logs-container">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{{ totalVisits }}</div>
            <div class="stat-label">总访问次数</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ todayVisits }}</div>
            <div class="stat-label">今日访问次数</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ uniqueIPs }}</div>
            <div class="stat-label">独立IP数量</div>
          </div>
        </div>

        <div class="logs-table">
          <div class="table-header">
            <div>序号</div>
            <div>IP地址</div>
            <div>访问时间</div>
          </div>
          <div v-if="logs.length === 0" class="no-logs">暂无访客记录</div>
          <div 
            v-for="(log, index) in logs" 
            :key="log.id" 
            class="log-item"
          >
            <div>{{ index + 1 }}</div>
            <div>{{ log.ip_address }}</div>
            <div>{{ formatDate(log.accessed_at) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'

const adminKey = ref('')
const isAuthenticated = ref(false)
const error = ref('')
const logs = ref([])

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString('zh-CN')
}

const totalVisits = computed(() => logs.value.length)

const todayVisits = computed(() => {
  const today = new Date().toDateString()
  return logs.value.filter(log => new Date(log.accessed_at).toDateString() === today).length
})

const uniqueIPs = computed(() => {
  return new Set(logs.value.map(log => log.ip_address)).size
})

const verifyAdmin = async () => {
  if (adminKey.value === 'zoeadmin') {
    isAuthenticated.value = true
    error.value = ''
    loadLogs()
  } else {
    error.value = '密钥错误，请重试'
  }
}

const loadLogs = async () => {
  try {
    const response = await axios.get('/api/access-logs', {
      headers: {
        'x-admin-key': 'zoeadmin'
      }
    })
    logs.value = response.data
  } catch (error) {
    console.error('Error loading logs:', error)
  }
}

onMounted(() => {
  // 可以在这里添加自动验证逻辑
})
</script>

<style scoped>
.visitors-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.container {
  max-width: 900px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

h1 {
  color: white;
  font-size: 2rem;
}

.back-btn {
  padding: 10px 20px;
  background: white;
  color: #667eea;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  cursor: pointer;
  text-decoration: none;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.back-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
}

.login-box {
  background: white;
  border-radius: 20px;
  padding: 40px;
  text-align: center;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.login-box h2 {
  color: #333;
  margin-bottom: 30px;
}

.form-group {
  margin-bottom: 20px;
  text-align: left;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #555;
  font-weight: 600;
}

.form-group input {
  width: 100%;
  padding: 15px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 1rem;
  transition: border-color 0.3s ease;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
}

.error-msg {
  color: #e74c3c;
  margin-bottom: 20px;
  font-size: 0.9rem;
}

.login-btn {
  width: 100%;
  padding: 15px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
}

.logs-container {
  background: white;
  border-radius: 20px;
  padding: 40px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.stat-card {
  background: #f8f9fa;
  padding: 30px;
  border-radius: 15px;
  text-align: center;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}

.stat-value {
  font-size: 2.5rem;
  font-weight: bold;
  color: #667eea;
  margin-bottom: 10px;
}

.stat-label {
  color: #666;
  font-size: 1rem;
}

.logs-table {
  width: 100%;
  border-collapse: collapse;
}

.table-header {
  display: grid;
  grid-template-columns: 80px 1fr 200px;
  background: #667eea;
  color: white;
  padding: 15px;
  border-radius: 10px 10px 0 0;
  font-weight: 600;
}

.log-item {
  display: grid;
  grid-template-columns: 80px 1fr 200px;
  padding: 15px;
  border-bottom: 1px solid #e0e0e0;
  transition: background-color 0.3s ease;
}

.log-item:hover {
  background: #f8f9fa;
}

.no-logs {
  text-align: center;
  padding: 60px 20px;
  color: #999;
  font-size: 1.1rem;
}

@media (max-width: 768px) {
  .header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .table-header,
  .log-item {
    grid-template-columns: 60px 1fr;
  }

  .table-header div:last-child,
  .log-item div:last-child {
    grid-column: 1 / -1;
    margin-top: 10px;
  }

  .login-box,
  .logs-container {
    padding: 25px;
  }
}
</style>