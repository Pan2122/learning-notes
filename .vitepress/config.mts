import { defineConfig } from 'vitepress'
import markdownItMathjax3 from 'markdown-it-mathjax3'

export default defineConfig({
  // 你的仓库名，千万别改错
  base: "/learning-notes/", 
  
  title: "Pan's LearningNotes",
  description: "学习笔记",
// 👇================= 请把这 4 行代码补在这个位置 =================👇
head: [
  // 注意：这里必须加上你的仓库名 /learning-notes/ 否则浏览器找不到
  ['link', { rel: 'icon', href: '/learning-notes/favicon.png' }]
],
// 👆==============================================================👆
markdown: {
  config: (md) => {
    md.use(markdownItMathjax3) // <--- 2. 启用插件
  }
},
  // 启用文章最后更新时间显示（显示在文章底部）
  lastUpdated: true,
  
  themeConfig: {
    // 自定义最后更新时间的显示文本和格式
    lastUpdated: {
      text: '最后更新：',
      formatOptions: {
        dateStyle: 'long',
        timeStyle: 'short'
      }
    },
    
    // 启用本地搜索功能（显示在右上角）
    search: {
      provider: 'local',
      options: {
        // 优化搜索体验：支持模糊匹配和前缀匹配
        miniSearch: {
          searchOptions: {
            fuzzy: 0.2,
            prefix: true,
            boost: {
              title: 4,
              text: 2
            }
          }
        }
      }
    },
    // 1. 顶部导航栏 (顶部的菜单)
    nav: [
      { text: '首页', link: '/' },
      { text: 'C语言/软件', link: '/c-lang/pointer' },
      { text: '硬件设计', link: '/hardware/PNSemiconductor' },
      { text: '个人项目', link: '/projects/tps54302-module' },
      { text: '灵感想法', link: '/ideas/workflow-tools' }
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
             { text: '嵌入式滤波算法', link: '/c-lang/Filtering Algorithm' },
             { text: '旋转编码器：从原理到实战', link: '/c-lang/Encoder Principle' }
          ]
        }
      ],

      // 当用户在 /hardware/ 目录下时，显示这个侧边栏
      '/hardware/': [
        {
          text: '电路基础',
          items: [
            { text: 'PN结原理', link: '/hardware/PNSemiconductor' },
            { text: '电路设计', link: '/hardware/basic-circuit' },
          ]
        },
        {
          text: 'EDA 工具',
          items: [
            { text: 'AD设计小Tips', link: '/hardware/ad-shortcuts' },
          ]
        }
      ],

      // 当用户在 /projects/ 目录下时
      '/projects/': [
        {
          text: '我的项目',
          items: [
            { text: 'TPS54302 电源模块', link: '/projects/tps54302-module' },
            { text: '无人机矢量推力控制系统', link: '/projects/TVC-UAV' },
            { text: '本网站项目结构维护说明', link: '/projects/Project Architecture' },
          ]
        }
      ],
      
      // 当用户在 /ideas/ 目录下时
      '/ideas/': [
        {
          text: '随想录',
          items: [
            { text: '我的工作流', link: '/ideas/workflow-tools' },
            { text: '未来方案灵感', link: '/ideas/future-plan' },
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Pan2122' }
    ]
  }
})