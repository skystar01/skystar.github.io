// ─── 每日资讯模块 ───
// 数据来源优先级:
//   1. window.NEWS_DATA (news-data.js 注入, 离线可用)
//   2. localStorage 缓存
//   3. 用户手动点"刷新"按钮 POST /api/news/fetch 触发后端抓取
// 后端默认地址 http://localhost:8000, 见 news_server.py
(function() {
    const STORAGE_KEY = 'skystar:v1:news:data';
    const LEGACY_KEY = 'skystar_news_data';
    const BACKEND_URL = 'http://localhost:8000';

    const refreshBtn = document.getElementById('news-refresh-btn');
    const updatedAtEl = document.getElementById('news-updated-at');
    const loadingEl = document.getElementById('news-loading');
    const loadingText = document.getElementById('news-loading-text');
    const emptyEl = document.getElementById('news-empty');
    const errorEl = document.getElementById('news-error');
    const errorText = document.getElementById('news-error-text');
    const contentEl = document.getElementById('news-content');
    const listEl = document.getElementById('news-list');
    const footEl = document.getElementById('news-foot');
    const filterBtns = document.querySelectorAll('#news-filters .news-filter');

    let currentData = null;
    let currentFilter = 'all';
    let currentKeyword = '';

    function showState(state) {
        loadingEl.classList.add('hidden');
        emptyEl.classList.add('hidden');
        errorEl.classList.add('hidden');
        contentEl.classList.add('hidden');
        if (state === 'loading') loadingEl.classList.remove('hidden');
        else if (state === 'empty') emptyEl.classList.remove('hidden');
        else if (state === 'error') errorEl.classList.remove('hidden');
        else if (state === 'content') contentEl.classList.remove('hidden');
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function categoryColor(cat) {
        return {
            'AI 论文': '#7c6ef5',
            '开源动态': '#4ecdc4',
            '中文 AI': '#ff6b9d',
            '业界新闻': '#ffa94d'
        }[cat] || '#94a3b8';
    }

    // 标准化分类字符串:去空格、全/半角统一、小写,用于宽松匹配
    function normalizeCategory(cat) {
        if (!cat) return '';
        return String(cat)
            .replace(/[\s\u3000]+/g, '')  // 去所有空白(含全角空格)
            .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))  // 全角→半角
            .toLowerCase();
    }

    // 把 LLM 输出的不规范 category 映射到标准 4 分类
    const CATEGORY_ALIASES = {
        'ai论文': 'AI 论文',
        'ai 论文': 'AI 论文',
        'ai论': 'AI 论文',
        '论文': 'AI 论文',
        'paper': 'AI 论文',
        '开源动态': '开源动态',
        '开源': '开源动态',
        'github': '开源动态',
        'open source': '开源动态',
        '中文ai': '中文 AI',
        '中文 ai': '中文 AI',
        'chinese ai': '中文 AI',
        '中文': '中文 AI',
        '业界新闻': '业界新闻',
        '业界': '业界新闻',
        '行业': '业界新闻',
        'news': '业界新闻'
    };

    function resolveCategory(rawCat) {
        const norm = normalizeCategory(rawCat);
        if (CATEGORY_ALIASES[norm]) return CATEGORY_ALIASES[norm];
        return rawCat;  // 未知分类原样返回
    }

    function renderNews(data) {
        currentData = data;
        const items = (data && data.items) || [];

        if (data && data.generated_at) {
            try {
                const d = new Date(data.generated_at);
                updatedAtEl.textContent = '最后更新:' + d.toLocaleString('zh-CN', { hour12: false });
            } catch (e) {
                updatedAtEl.textContent = '最后更新:' + (data.date || '');
            }
        } else {
            updatedAtEl.textContent = '尚未更新';
        }

        if (items.length === 0) {
            listEl.innerHTML = '<p class="news-no-items">今日无资讯</p>';
            footEl.textContent = '';
            showState('content');
            return;
        }

        const filtered = items.filter(it => {
            const catOk = currentFilter === 'all' || resolveCategory(it.category) === currentFilter;
            if (!catOk) return false;
            if (!currentKeyword) return true;
            const t = (it.title || '').toLowerCase();
            const s = (it.summary || '').toLowerCase();
            return t.includes(currentKeyword) || s.includes(currentKeyword);
        });

        if (filtered.length === 0) {
            let msg = '暂无资讯';
            if (currentKeyword && currentFilter !== 'all') {
                msg = `分类「${currentFilter}」下没匹配「${currentKeyword}」的资讯`;
            } else if (currentKeyword) {
                msg = `没匹配「${currentKeyword}」的资讯`;
            } else if (currentFilter !== 'all') {
                msg = '该分类下暂无资讯';
            }
            listEl.innerHTML = `<p class="news-no-items">${escapeHtml(msg)}</p>`;
        } else {
            listEl.innerHTML = filtered.map((it, idx) => {
                const resolved = resolveCategory(it.category);
                const color = categoryColor(resolved);
                const preview = (it.summary || '').slice(0, 80).replace(/\s+\S*$/, '') + ((it.summary || '').length > 80 ? '…' : '');
                return `
                <div class="news-item" data-idx="${idx}" tabindex="0" role="button" aria-label="查看完整内容">
                    <div class="news-item-meta">
                        <span class="news-cat-tag" style="background:${color}22;color:${color};border-color:${color}55">${escapeHtml(resolved || '其他')}</span>
                        <span class="news-source"><i class="fas fa-circle-dot"></i> ${escapeHtml(it.source || '')}</span>
                        <span class="news-time">${escapeHtml(it.published_at || '')}</span>
                    </div>
                    <h3 class="news-item-title">${escapeHtml(it.title)}</h3>
                    <p class="news-item-summary">${escapeHtml(preview)}</p>
                    <span class="news-item-more">点击查看完整内容 <i class="fas fa-arrow-right"></i></span>
                </div>`;
            }).join('');
        }

        const srcs = (data.sources || []).join(' · ');
        let foot = `共 ${items.length} 条 · 来源:${srcs || '—'}`;
        if (filtered.length !== items.length) {
            foot += ` · 当前显示 ${filtered.length} 条`;
        }
        if (currentKeyword) {
            foot += ` · 搜索「${currentKeyword}」`;
        }
        footEl.textContent = foot;

        showState('content');
    }

    function loadFromFile() {
        if (window.NEWS_DATA && window.NEWS_DATA.items && window.NEWS_DATA.items.length > 0) {
            renderNews(window.NEWS_DATA);
            return true;
        }
        return false;
    }

    function loadFromLocalStorage() {
        SkyStorage.migrate(LEGACY_KEY, STORAGE_KEY);
        const data = SkyStorage.getJSON(STORAGE_KEY, null);
        if (data && data.items) {
            renderNews(data);
            return true;
        }
        return false;
    }

    function saveToLocalStorage(data) {
        SkyStorage.setJSON(STORAGE_KEY, data);
    }

    async function fetchNews() {
        refreshBtn.disabled = true;
        loadingText.textContent = '抓取资讯中(可能需要 20-40 秒)...';
        showState('loading');

        try {
            const ctrl = new AbortController();
            const timeoutId = setTimeout(() => ctrl.abort(), 180000);
            const r = await fetch(BACKEND_URL + '/api/news/fetch', {
                method: 'POST',
                signal: ctrl.signal
            });
            clearTimeout(timeoutId);
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error(err.detail || ('HTTP ' + r.status));
            }
            const data = await r.json();
            saveToLocalStorage(data);
            window.NEWS_DATA = data;
            renderNews(data);
        } catch (e) {
            console.error('Fetch failed', e);
            if (e.name === 'AbortError') {
                errorText.textContent = '请求超时(超过 3 分钟),请检查后端';
            } else if (e.message && e.message.includes('Failed to fetch')) {
                errorText.textContent = '后端未启动。请双击 start-news.bat 启动服务后再试';
            } else {
                errorText.textContent = '刷新失败:' + e.message;
            }
            showState('error');
        } finally {
            refreshBtn.disabled = false;
        }
    }

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.cat;
            if (currentData) renderNews(currentData);
        });
    });

    // ── 搜索框 ──
    const searchInput = document.getElementById('news-search');
    const searchClear = document.getElementById('news-search-clear');
    const searchWrap = searchInput.closest('.news-search-wrap');

    function setKeyword(kw) {
        currentKeyword = kw.trim().toLowerCase();
        searchWrap.classList.toggle('has-text', !!currentKeyword);
        if (currentData) renderNews(currentData);
    }

    searchInput.addEventListener('input', (e) => setKeyword(e.target.value));
    // 中文输入防抖(中文输入法每个拼音都会触发 input,等 200ms 没新输入再过滤)
    let searchDebounce = null;
    searchInput.addEventListener('compositionstart', () => {
        if (searchDebounce) { clearTimeout(searchDebounce); searchDebounce = null; }
    });
    searchInput.addEventListener('compositionend', (e) => {
        searchDebounce = setTimeout(() => setKeyword(e.target.value), 0);
    });
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        setKeyword('');
        searchInput.focus();
    });

    refreshBtn.addEventListener('click', fetchNews);

    // ── 资讯详情弹窗 ──
    const modal = document.getElementById('news-modal');
    const modalBackdrop = modal.querySelector('.news-modal-backdrop');
    const modalCloseBtn = modal.querySelector('.news-modal-close');
    const modalMeta = document.getElementById('news-modal-meta');
    const modalTitle = document.getElementById('news-modal-title');
    const modalSummary = document.getElementById('news-modal-summary');
    const modalLink = document.getElementById('news-modal-link');

    function openNewsModal(idx) {
        if (!currentData) return;
        // 找到对应 item(注意 idx 是 filtered 数组的下标,不是原始 items 的下标)
        const items = (currentData && currentData.items) || [];
        const filtered = currentFilter === 'all'
            ? items
            : items.filter(it => resolveCategory(it.category) === currentFilter);
        const it = filtered[idx];
        if (!it) return;

        const resolved = resolveCategory(it.category);
        const color = categoryColor(resolved);
        modalMeta.innerHTML = `
            <span class="news-cat-tag" style="background:${color}22;color:${color};border-color:${color}55">${escapeHtml(resolved || '其他')}</span>
            <span class="news-source"><i class="fas fa-circle-dot"></i> ${escapeHtml(it.source || '')}</span>
            <span class="news-time">${escapeHtml(it.published_at || '')}</span>
        `;
        modalTitle.textContent = it.title || '';
        // 把 summary 里的 \n 转成 <br>,保留段落感
        modalSummary.innerHTML = escapeHtml(it.summary || '').replace(/\n/g, '<br>');
        modalLink.href = it.url || '#';

        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        // focus trap: 转移焦点 + Tab 循环 + 关闭还原
        if (window.activateFocusTrap) window.activateFocusTrap(modal);
    }

    function closeNewsModal() {
        if (window.deactivateFocusTrap) window.deactivateFocusTrap();
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    // 事件绑定
    listEl.addEventListener('click', (e) => {
        // 点 "查看原文" 链接不触发弹窗(由链接自己处理,虽然现在卡片里没这链接)
        const card = e.target.closest('.news-item');
        if (!card) return;
        const idx = parseInt(card.dataset.idx, 10);
        if (!isNaN(idx)) openNewsModal(idx);
    });
    // 键盘 Enter / Space 也触发
    listEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const card = e.target.closest('.news-item');
        if (!card) return;
        e.preventDefault();
        const idx = parseInt(card.dataset.idx, 10);
        if (!isNaN(idx)) openNewsModal(idx);
    });
    // 关闭:点 X / 点背景 / 按 ESC
    modalCloseBtn.addEventListener('click', closeNewsModal);
    modalBackdrop.addEventListener('click', closeNewsModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeNewsModal();
        }
    });

    if (!loadFromFile()) {
        if (!loadFromLocalStorage()) {
            showState('empty');
        }
    }
})();
