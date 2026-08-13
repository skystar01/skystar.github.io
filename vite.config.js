import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

// 阶段1 内联插件：构建时把仍用经典 <script> 的目录原样拷贝进 dist。
// 现仅拷贝 news/（news-data.js 等数据），所有应用脚本已合并为 src/app.js 模块，无需拷贝 scripts/。
// （dev 模式下 Vite 直接从项目根目录提供这些文件，无需拷贝。）
function copyClassicDirs() {
  return {
    name: 'copy-classic-dirs',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(process.cwd(), 'dist')
      const pairs = [
        { src: 'news', dest: 'news' }
      ]
      for (const { src, dest } of pairs) {
        const srcDir = path.resolve(process.cwd(), src)
        if (!fs.existsSync(srcDir)) continue
        const destDir = path.join(outDir, dest)
        fs.cpSync(srcDir, destDir, { recursive: true })
      }
    }
  }
}

export default defineConfig({
  root: '.',
  base: './',            // 相对路径，方便 GitHub Pages / 任意子目录部署
  plugins: [copyClassicDirs()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2018',
    assetsInlineLimit: 4096
  },
  server: {
    port: 5500,
    open: false
  }
})
