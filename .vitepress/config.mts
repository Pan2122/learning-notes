import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "Pan's LearningNotes",
  base: "/learning-notes/",
  description: "学习笔记",
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: 'C语言基础', link: '/c-lang/pointer' }
    ],

    sidebar: [
      {
        text: 'C语言核心',
        items: [
          // link 对应你的文件名
          { text: '指针与结构体复盘', link: '/c-lang/pointer' },
          // 以后加了新文件，就在这里加一行
          // { text: 'GPIO原理', link: '/embedded/gpio' } 
        ]
      }
    ],

    socialLinks: [
      // 你的 GitHub 地址，后面会建
      { icon: 'github', link: 'https://github.com/你的用户名/learning-notes' }
    ]
  }
})