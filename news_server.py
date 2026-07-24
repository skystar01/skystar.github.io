"""
每日资讯后端服务
- 启动:python news_server.py  (或双击 start-news.bat)
- API:GET  /api/health        健康检查
       POST /api/news/fetch   抓取 + LLM 总结 + 写文件
- 配置:.env 文件(同目录)
- 输出:news/YYYY-MM-DD.json + news/latest.json + news/news-data.js

数据源(默认):
  1. arxiv            (AI/ML 论文)
  2. Hacker News      (全球科技/AI 讨论)
  3. GitHub Trending  (热门开源项目)
  4. 机器之心         (中文 AI 新闻)
"""
import os
import re
import json
import asyncio
from datetime import datetime, timezone, timedelta
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# ──────────────── 配置 ────────────────
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.MiniMax.chat/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "MiniMax-Text-01")
NEWS_DIR = Path(os.getenv("NEWS_DIR", "./news"))
PORT = int(os.getenv("PORT", "8000"))
MAX_ITEMS = int(os.getenv("MAX_ITEMS", "25"))

CST = timezone(timedelta(hours=8))

# ──────────────── App ────────────────
app = FastAPI(title="每日资讯服务", version="1.0")
# 仅允许本地开发常用来源访问，避免公网/恶意网页调用 API 白嫖 LLM 额度
# - localhost/127.0.0.1:5500  → VS Code Live Server 默认端口
# - localhost/127.0.0.1:8000  → 同源访问
# - null                       → file:// 双击打开 main.html 时浏览器发的 Origin
ALLOWED_ORIGINS = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "null",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────── 数据源 ────────────────
async def fetch_arxiv() -> list:
    """arxiv AI/ML/CL 论文,最近(带 User-Agent + 429 退避)"""
    url = "https://export.arxiv.org/api/query"
    params = {
        "search_query": "cat:cs.AI OR cat:cs.LG OR cat:cs.CL",
        "start": 0,
        "max_results": 20,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
    }
    headers = {"User-Agent": "skystar-news-bot/1.0 (mailto:user@example.com)"}
    r = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as c:
                r = await c.get(url, params=params, headers=headers)
                if r.status_code == 429:
                    await asyncio.sleep(5 * (attempt + 1))
                    continue
                r.raise_for_status()
            break
        except Exception:
            if attempt == 2:
                raise
            await asyncio.sleep(2)
    if r is None:
        raise RuntimeError("fetch_arxiv: 3 次重试均失败")
    items = []
    for entry in re.findall(r"<entry>(.*?)</entry>", r.text, re.DOTALL)[:20]:
        t = re.search(r"<title>(.*?)</title>", entry, re.DOTALL)
        s = re.search(r"<summary>(.*?)</summary>", entry, re.DOTALL)
        i = re.search(r"<id>(.*?)</id>", entry)
        p = re.search(r"<published>(.*?)</published>", entry)
        if not (t and s and i):
            continue
        title = re.sub(r"\s+", " ", t.group(1)).strip()
        items.append({
            "title": title,
            "summary": re.sub(r"\s+", " ", s.group(1)).strip()[:500],
            "url": i.group(1).strip(),
            "source": "arxiv",
            "published_at": p.group(1)[:10] if p else "",
        })
    return items


HN_AI_KW = [
    "ai", "ml", "llm", "gpt", "claude", "gemini", "rag",
    "neural", "deep learning", "transformer", "diffusion",
    "openai", "anthropic", "huggingface", "stable diffusion",
    "agent", "embedding", "fine-tun", "pytorch", "tensorflow",
]


async def fetch_hackernews() -> list:
    """Hacker News 热门(过滤 AI 相关)"""
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get("https://hacker-news.firebaseio.com/v0/topstories.json")
        r.raise_for_status()
        ids = r.json()[:30]

        async def one(iid):
            rr = await c.get(f"https://hacker-news.firebaseio.com/v0/item/{iid}.json")
            return rr.json() if rr.status_code == 200 else None

        raw = await asyncio.gather(*[one(i) for i in ids])

    items = []
    for it in raw:
        if not it or it.get("type") != "story" or it.get("dead") or it.get("deleted"):
            continue
        title = it.get("title", "")
        low = title.lower()
        if not any(kw in low for kw in HN_AI_KW):
            continue
        items.append({
            "title": title,
            "summary": (it.get("text") or "(无摘要)")[:500],
            "url": it.get("url") or f"https://news.ycombinator.com/item?id={it['id']}",
            "source": "hackernews",
            "published_at": datetime.fromtimestamp(it.get("time", 0), tz=CST).strftime("%Y-%m-%d"),
        })
    return items[:12]


async def fetch_github_trending() -> list:
    """GitHub 过去 7 天高 star 仓库"""
    seven_days_ago = (datetime.now(CST) - timedelta(days=7)).strftime("%Y-%m-%d")
    params = {
        "q": f"created:>{seven_days_ago} stars:>50",
        "sort": "stars",
        "order": "desc",
        "per_page": 15,
    }
    headers = {"Accept": "application/vnd.github+json"}
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get("https://api.github.com/search/repositories", params=params, headers=headers)
        r.raise_for_status()
        data = r.json()
    items = []
    for repo in data.get("items", [])[:15]:
        items.append({
            "title": repo["full_name"],
            "summary": (repo.get("description") or "(无描述)")[:400],
            "url": repo["html_url"],
            "source": "github",
            "published_at": repo["created_at"][:10],
        })
    return items


async def fetch_chinese_tech() -> list:
    """中文科技 / AI / 开发者资讯(多源 fallback)"""
    feed_urls = [
        ("https://36kr.com/feed", "36kr", 10),         # 36氪,科技/AI 商业
        ("https://coolshell.cn/feed", "coolshell", 8),  # 酷壳,开发者向
        ("https://sspai.com/feed", "sspai", 8),         # 少数派,工具/数字生活
    ]
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
        for url, source, cap in feed_urls:
            try:
                r = await c.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
                r.raise_for_status()
                if "<item>" in r.text or "<entry>" in r.text:
                    items = _parse_rss(r.text)
                    for it in items:
                        it["source"] = source
                    if items:
                        return items[:cap]
            except Exception:
                continue
    return []


def _parse_rss(text: str) -> list:
    items = []
    # RSS 2.0
    for entry in re.findall(r"<item>(.*?)</item>", text, re.DOTALL)[:15]:
        t = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", entry, re.DOTALL)
        l = re.search(r"<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</link>", entry, re.DOTALL)
        d = re.search(r"<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</description>", entry, re.DOTALL)
        p = re.search(r"<pubDate>(.*?)</pubDate>", entry)
        if not (t and l):
            continue
        items.append({
            "title": re.sub(r"\s+", " ", t.group(1)).strip(),
            "summary": re.sub(r"<[^>]+>", "", d.group(1)).strip()[:400] if d else "",
            "url": l.group(1).strip(),
            "source": "chinese_tech",
            "published_at": (p.group(1)[:10] if p else ""),
        })
    # Atom
    if not items:
        for entry in re.findall(r"<entry>(.*?)</entry>", text, re.DOTALL)[:15]:
            t = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", entry, re.DOTALL)
            l = re.search(r"<link[^>]*href=\"([^\"]+)\"", entry)
            s = re.search(r"<summary>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</summary>", entry, re.DOTALL)
            p = re.search(r"<published>(.*?)</published>", entry)
            if not (t and l):
                continue
            items.append({
                "title": re.sub(r"\s+", " ", t.group(1)).strip(),
                "summary": re.sub(r"<[^>]+>", "", s.group(1)).strip()[:400] if s else "",
                "url": l.group(1).strip(),
                "source": "chinese_tech",
                "published_at": (p.group(1)[:10] if p else ""),
            })
    return items


# ──────────────── LLM 总结 ────────────────
async def summarize_with_llm(raw_items: list) -> list:
    if not raw_items:
        return []
    items_text = "\n\n".join([
        f"[{i+1}] 来源:{it['source']}\n标题:{it['title']}\n摘要:{it.get('summary','')[:300]}\n链接:{it['url']}\n时间:{it.get('published_at','')}"
        for i, it in enumerate(raw_items)
    ])
    prompt = f"""你是一位资深科技资讯编辑。下面是抓取的原始资讯,请生成结构化总结。

【严格输出格式 — 违规视为失败】

每条必须是以下 JSON 对象,**字段名和值严格匹配**:

{{
  "category": "<必须是下列 4 个值之一,带中文空格>",
  "title": "<中文标题,10-30 字>",
  "summary": "<中文摘要,150-220 字,3-5 句话>",
  "url": "<原样照抄下方原始资讯的 url 字段>",
  "source": "<原样照抄下方原始资讯的 source 字段,例如 arxiv/hackernews/github/36kr/coolshell/sspai>",
  "published_at": "<原样照抄下方原始资讯的 published_at 字段,例如 2026-07-13>"
}}

【category 只能是这 4 个字符串之一(注意空格,带一个英文半角空格)】
- "AI 论文"   ← arxiv 抓的学术论文
- "开源动态"  ← GitHub 上的开源项目 / 库 / 工具
- "中文 AI"   ← 36氪/酷壳/少数派 等中文媒体的 AI 报道
- "业界新闻"  ← Hacker News 上的行业新闻 / 大公司动态 / 产品发布

【summary 硬性要求】
- 150-220 个中文字符,3-5 句话
- 必须包含:这条资讯在做什么 / 核心方法或亮点 / 影响或意义
- **禁止一句话敷衍,禁止"该项目是一个 XX"这种空话开头**

【source / url / published_at 三个字段】
- **必须从下方原始资讯中照抄,不要修改、不要省略、不要用占位符**
- 如果原始资讯的 source 是 "arxiv",输出时也必须是 "arxiv"
- 如果原始资讯没有 published_at,输出空字符串 ""

【其他规则】
- 去重:相似主题合并
- 过滤:广告 / 水稿 / 与科技无关内容直接丢弃
- 最多 {MAX_ITEMS} 条,按时间倒序(最新在前)
- **【强制 4 源覆盖】最终输出必须同时包含 4 种 source 的内容:**
  - 至少 2 条 source = "arxiv"        → 分类 "AI 论文"
  - 至少 2 条 source = "hackernews"   → 分类 "业界新闻"
  - 至少 2 条 source = "github"       → 分类 "开源动态"
  - 至少 2 条 source = "36kr" / "coolshell" / "sspai" → 分类 "中文 AI"
  - **不要因为内容相似就只挑 arxiv,4 个源必须都覆盖**
- 输出**纯 JSON 数组**,无 markdown 代码块,无任何其他文字

【summary 示例 — 150-220 字,3-5 句】

"Google DeepMind 发布 Gemini 2.5 Pro,在 MMLU 基准上达到 92.3%,超过 GPT-4o 和 Claude 3.5 Sonnet。新模型采用稀疏 MoE 架构,推理时仅激活 1/8 参数,延迟降低 40%。上下文窗口扩展到 200 万 tokens,支持多模态原生输入。已在 Gemini API 和 AI Studio 上线,免费层用户也可体验。"

【原始资讯】
{items_text}

【输出】纯 JSON 数组,每条包含 6 个字段,category 从 4 个固定值选 1,source 原样照抄:"""
    headers = {"Authorization": f"Bearer {LLM_API_KEY}", "Content-Type": "application/json"}
    body = {
        "model": LLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
    }
    # LLM 调用加重试: 5xx/网络错误做 3 次指数退避(2s/4s/8s), 4xx 立即失败
    last_err = None
    data = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=180) as c:
                r = await c.post(f"{LLM_BASE_URL}/chat/completions", headers=headers, json=body)
                if r.status_code >= 500:
                    last_err = HTTPException(500, f"LLM 服务返回 {r.status_code}")
                    if attempt < 2:
                        await asyncio.sleep(2 ** (attempt + 1))
                        continue
                    raise last_err
                r.raise_for_status()
                data = r.json()
                break
        except httpx.HTTPError as e:
            last_err = e
            if attempt < 2:
                await asyncio.sleep(2 ** (attempt + 1))
                continue
            raise HTTPException(500, f"LLM 调用网络失败:{e}")
    if data is None:
        raise last_err or HTTPException(500, "LLM 调用失败:未知原因")
    content = data["choices"][0]["message"]["content"].strip()
    # 去除 markdown 包裹
    content = re.sub(r"^```(?:json)?\s*\n?", "", content)
    content = re.sub(r"\n?```\s*$", "", content)
    try:
        result = json.loads(content)
    except json.JSONDecodeError:
        m = re.search(r"\[.*\]", content, re.DOTALL)
        if m:
            try:
                result = json.loads(m.group())
            except json.JSONDecodeError:
                raise HTTPException(500, f"LLM 输出无法解析:{content[:300]}")
        else:
            raise HTTPException(500, f"LLM 输出无法解析:{content[:300]}")
    if not isinstance(result, list):
        raise HTTPException(500, "LLM 输出不是数组")
    return result


# ──────────────── 文件输出 ────────────────
def save_news_files(items: list) -> dict:
    NEWS_DIR.mkdir(exist_ok=True)
    now = datetime.now(CST)
    date_str = now.strftime("%Y-%m-%d")
    payload = {
        "date": date_str,
        "generated_at": now.isoformat(timespec="seconds"),
        "sources": sorted(set(it.get("source", "") for it in items)),
        "items": items,
    }
    # 1. 当日
    (NEWS_DIR / f"{date_str}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    # 2. latest
    (NEWS_DIR / "latest.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    # 3. news-data.js(给前端 file:// 加载用)
    js_content = f"// 自动生成,勿手动编辑 (生成于 {payload['generated_at']})\nwindow.NEWS_DATA = {json.dumps(payload, ensure_ascii=False)};\n"
    (NEWS_DIR / "news-data.js").write_text(js_content, encoding="utf-8")
    return payload


# ──────────────── API ────────────────
@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "time": datetime.now(CST).isoformat(timespec="seconds"),
        "llm_configured": bool(LLM_API_KEY),
    }


@app.post("/api/news/fetch")
async def fetch_news():
    if not LLM_API_KEY:
        raise HTTPException(500, "LLM_API_KEY 未配置,请检查 .env")

    sources = {
        "arxiv": fetch_arxiv,
        "hackernews": fetch_hackernews,
        "github": fetch_github_trending,
        "chinese_tech": fetch_chinese_tech,
    }
    results = await asyncio.gather(*[fn() for fn in sources.values()], return_exceptions=True)
    all_items = []
    status = {}
    for src, res in zip(sources.keys(), results):
        if isinstance(res, Exception):
            status[src] = f"失败:{res}"
        else:
            status[src] = f"成功 {len(res)} 条"
            all_items.extend(res)

    if not all_items:
        raise HTTPException(500, f"所有源都失败:{status}")

    try:
        summarized = await summarize_with_llm(all_items)
    except Exception as e:
        raise HTTPException(500, f"LLM 总结失败:{e}")

    payload = save_news_files(summarized)
    payload["_meta"] = {
        "raw_count": len(all_items),
        "source_status": status,
        "final_count": len(summarized),
    }
    return payload


if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("  每日资讯服务")
    print("=" * 50)
    print(f"  📂 News 目录:{NEWS_DIR.absolute()}")
    print(f"  🌐 端口:{PORT}")
    print(f"  🤖 LLM:{LLM_MODEL}")
    print(f"  🔑 API Key:{'已配置' if LLM_API_KEY else '❌ 未配置'}")
    print("=" * 50)
    print(f"  验证:http://localhost:{PORT}/api/health")
    print(f"  触发抓取:POST http://localhost:{PORT}/api/news/fetch")
    print("=" * 50)
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
