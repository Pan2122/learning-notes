import { defineConfig } from 'vitepress'

export default defineConfig({
  // 你的仓库名，千万别改错
  base: "/learning-notes/", 
  
  title: "Pan's LearningNotes",
  description: "学习笔记",
  // 👇================= 新增这部分 =================👇
  // head 是一个数组，用来往 HTML 的 <head> 标签里注入内容
  head: [
    // 这里的路径 '/favicon.png' 指的就是 public 文件夹下的文件
    ['link', { rel: 'icon', href: '/favicon.png' }]
  ],
  // 👆=============================================👆
  themeConfig: {
    // 1. 顶部导航栏 (顶部的菜单)
    nav: [
      { text: '首页', link: '/' },
      { text: 'C语言/软件', link: '/c-lang/pointer' },
      { text: '硬件设计', link: '/hardware/ad-shortcuts' },
      { text: '个人项目', link: '/projects/smart-home' },
      { text: '灵感想法', link: '/ideas/daily-log' }
    ],

    // 2. 侧边栏 (左侧的目录，根据路径自动切换)
    sidebar: {
      // 当用户在 /c-lang/ 目录下时，显示这个侧边栏
      '/c-lang/': [
        {
          text: 'C 语言核心',
          items: [
            { text: '指针与结构体复盘', link: '/c-lang/pointer' },
            { text: '内存管理详解', link: '/c-lang/memory' }, // 记得去建这个文件
          ]
        },
        {
          text: '嵌入式基础',
          items: [
             // 预留位置，以后写了文件再取消注释
             { text: '嵌入式滤波算法', link: '/c-lang/Filtering Algorithm' }
          ]
        }
      ],

      // 当用户在 /hardware/ 目录下时，显示这个侧边栏
      '/hardware/': [
        {
          text: 'EDA 工具',
          items: [
            { text: 'AD设计小Tips', link: '/hardware/ad-shortcuts' },
          ]
        },
        {
          text: '电路基础',
          items: [
            { text: '电路设计', link: '/hardware/basic-circuit' },
          ]
        }
      ],

      // 当用户在 /projects/ 目录下时
      '/projects/': [
        {
          text: '我的项目',
          items: [
            { text: '智能家居控制系统', link: '/projects/smart-home' },
          ]
        }
      ],
      
      // 当用户在 /ideas/ 目录下时
      '/ideas/': [
        {
          text: '随想录',
          items: [
            { text: '日常学习打卡', link: '/ideas/daily-log' },
            { text: '未来方案灵感', link: '/ideas/future-plan' },
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Pan2122/learning-notes' }
    ]
  }
})