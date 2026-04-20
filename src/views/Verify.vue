<template>
  <div class="verify-container">
    <div class="verify-box">
      <h1>Zoe's Blog</h1>
      <p>欢迎来到我的个人博客，请先回答一个问题</p>
      <div class="question">zoe是谁?</div>
      <input 
        v-model="answer" 
        type="text" 
        placeholder="请输入你的答案"
        @keyup.enter="verifyAnswer"
      />
      <button @click="verifyAnswer">验证</button>
      <p class="hint">提示：这是一个关于博主身份的问题</p>
      <div v-if="error" class="error">{{ error }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const answer = ref('')
const error = ref('')

const verifyAnswer = async () => {
  const trimmedAnswer = answer.value.trim()
  
  if (!trimmedAnswer) {
    error.value = '请输入答案'
    return
  }
  
  if (trimmedAnswer === 'zoeadmin') {
    router.push('/visitors')
    return
  }
  
  if (trimmedAnswer === '杜圳' || trimmedAnswer === '我是杜圳本人') {
    try {
      await axios.post('/api/log-access')
      router.push('/home')
    } catch (err) {
      console.error('Error logging access:', err)
      router.push('/home')
    }
    return
  }
  
  error.value = '答案错误，请重试'
}
</script>

<style scoped>
.verify-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 20px;
}

.verify-box {
  background: white;
  padding: 40px;
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  text-align: center;
  max-width: 400px;
  width: 100%;
}

h1 {
  color: #333;
  margin-bottom: 20px;
  font-size: 1.8rem;
}

p {
  color: #666;
  margin-bottom: 30px;
  line-height: 1.6;
}

.question {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px;
  border-radius: 15px;
  margin-bottom: 30px;
  font-size: 1.2rem;
  font-weight: 600;
}

input {
  width: 100%;
  padding: 15px;
  border: 2px solid #ddd;
  border-radius: 10px;
  font-size: 1rem;
  margin-bottom: 20px;
  transition: border-color 0.3s ease;
}

input:focus {
  outline: none;
  border-color: #667eea;
}

button {
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

button:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}

.hint {
  margin-top: 20px;
  font-size: 0.9rem;
  color: #999;
}

.error {
  margin-top: 15px;
  color: #e74c3c;
  font-size: 0.9rem;
}
</style>