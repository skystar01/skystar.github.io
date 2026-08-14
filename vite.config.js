import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

// 阶段1 内联插件：构建时把仍用经典 <script> 的目录原样拷进产物目录。
// 现仅拷贝 news/（news-data.js 等数据），所有应用脚本已合并为 src/app.js 模块，无需拷贝 scripts/。
// （dev 模式下 Vite 直接从项目根目录提供这些文件，无需拷贝。）

// 杀毒软件实时扫描会短暂锁定新建文件,cpSync 的 stat 校验会因此抛 EIO(文件其实已写全)。
// 自写递归拷贝 + 单文件重试,绕过这个环境抖动。
function copyFileRetry(src, dest, retries = 3) {
  for (let i = 0; ; i++) {
    try {
      fs.copyFileSync(src, dest)
      return
    } catch (err) {
      if (i >= retries - 1) throw err
      // 同步退避:构建期允许,200/400/600ms 递增
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 * (i + 1))
    }
  }
}

function copyDirFiltered(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    // 过滤 . 开头的 IDE 杂物目录(.trae-html-share-packages / .uploads),
    // 既不部署也避免其内部异常文件导致拷贝失败
    if (entry.name.startsWith('.')) continue
    const s = path.join(srcDir, entry.name)
    const d = path.join(destDir, entry.name)
    if (entry.isDirectory()) copyDirFiltered(s, d)
    else copyFileRetry(s, d)
  }
}

function copyClassicDirs() {
  let resolvedOutDir = 'dist'
  return {
    name: 'copy-classic-dirs',
    apply: 'build',
    configResolved(config) {
      // 跟随实际 outDir(支持 CLI --outDir 覆盖,绕过被锁的目录)
      resolvedOutDir = config.build.outDir
    },
    closeBundle() {
      const outDir = path.resolve(process.cwd(), resolvedOutDir)
      // onnxruntime-web 会被 Vite 静态分析出 jsep(WebGPU 版)wasm 资产(26MB),
      // 本站只用 WASM 后端,永不请求它——删掉,不给 Pages 增加死重
      const assetsDir = path.join(outDir, 'assets')
      if (fs.existsSync(assetsDir)) {
        for (const f of fs.readdirSync(assetsDir)) {
          if (f.includes('jsep') && f.endsWith('.wasm')) {
            fs.rmSync(path.join(assetsDir, f), { force: true })
          }
        }
      }
      const pairs = [
        { src: 'news', dest: 'news' },
        // 根目录 assets/ 与 images/ 里有大量被 JS 用字符串路径引用的资源
        // (游戏精灵图、卡牌图、截图等)。Vite 只打包 import 与 CSS url(),
        // 不处理 JS 字符串资源路径,故需整目录原样拷进产物,否则线上 404。
        { src: 'assets', dest: 'assets' },
        { src: 'images', dest: 'images' }
      ]
      for (const { src, dest } of pairs) {
        const srcDir = path.resolve(process.cwd(), src)
        if (!fs.existsSync(srcDir)) continue
        copyDirFiltered(srcDir, path.join(outDir, dest))
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
    target: 'es2020',   // onnxruntime-web 的 wasm 胶水代码用 BigInt 字面量,es2018 不支持;
                        // 支持 WASM SIMD 的浏览器均 ≥ ES2020,提目标无兼容损失
    assetsInlineLimit: 4096
  },
  server: {
    port: 5500,
    open: false
  }
})
