import { createRouter, createWebHistory } from 'vue-router'
import Verify from '../views/Verify.vue'
import Home from '../views/Home.vue'
import Visitors from '../views/Visitors.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Verify',
      component: Verify
    },
    {
      path: '/home',
      name: 'Home',
      component: Home
    },
    {
      path: '/visitors',
      name: 'Visitors',
      component: Visitors
    }
  ]
})

export default router