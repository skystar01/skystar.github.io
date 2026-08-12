// =============================================
// fx.js — 交互特效 & 彩蛋层(增量加载,不改动原有逻辑)
// 包含: console 签名 / hero 打字机 / 鼠标视差 / 粒子拖尾 /
//       磁吸按钮 / 卡片 3D 倾斜 / Konami 秘籍 / 终端彩蛋
// 性能: 单一 rAF 循环; 粒子封顶; 触屏与 reduce-motion 自动降级
// =============================================
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var coarsePointer = window.matchMedia('(pointer: coarse)').matches;

    // ────────────────────────────────────────────
    // 0. Console 签名(给会开 DevTools 的同类)
    // ────────────────────────────────────────────
    try {
        var art = [
            '  ____  _  ____   _______ _____ _____ ',
            ' / ___|| |/ /\\ \\ / / ____|_   _|  __ \\',
            ' \\___ \\|   /  \\ V /\\___ \\  | | | |  | |',
            '  ___) |   \\   | |  ___) | | | | |__| |',
            ' |____/|_|\\_\\  |_| |____/  |_| |_|  |_|'
        ].join('\n');
        console.log('%c' + art, 'color:#7c6ef5;font-family:monospace;');
        console.log('%c你好呀,同类。%c 既然翻到了这里——', 'color:#4ecdc4;font-size:14px;font-weight:bold;', 'color:#8892b0;');
        console.log('%c· 按 ` 键(反引号) 可以召唤一个终端\n· 方向键 ↑↑↓↓←→←→ 然后 B A,会有好事发生', 'color:#8892b0;line-height:1.8;');
    } catch (e) { /* console 不可用时静默 */ }

    // ────────────────────────────────────────────
    // 1. hero 打字机(eyebrow 轮换短语)
    // ────────────────────────────────────────────
    (function initTypewriter() {
        var eyebrow = document.querySelector('.hero-eyebrow');
        if (!eyebrow || reduceMotion) return;

        var PHRASES = [
            eyebrow.textContent.trim(),          // 原文案永远第一个
            'DQN · PPO · Reward Shaping',
            '让智能体学会玩游戏',
            'Training Agents, One Episode at a Time'
        ];

        var typed = document.createElement('span');
        typed.className = 'fx-typed';
        var caret = document.createElement('span');
        caret.className = 'fx-caret';
        eyebrow.textContent = '';
        eyebrow.appendChild(typed);
        eyebrow.appendChild(caret);

        var phraseIdx = 0, charIdx = 0, deleting = false;

        function tick() {
            var phrase = PHRASES[phraseIdx];
            if (!deleting) {
                charIdx++;
                typed.textContent = phrase.slice(0, charIdx);
                if (charIdx >= phrase.length) {
                    deleting = true;
                    setTimeout(tick, 2400);      // 完整显示停留
                    return;
                }
                setTimeout(tick, 75);
            } else {
                charIdx--;
                typed.textContent = phrase.slice(0, charIdx);
                if (charIdx <= 0) {
                    deleting = false;
                    phraseIdx = (phraseIdx + 1) % PHRASES.length;
                    setTimeout(tick, 450);
                    return;
                }
                setTimeout(tick, 32);
            }
        }
        setTimeout(tick, 900);                   // 等入场动画差不多结束
    })();

    // ────────────────────────────────────────────
    // 2. 入场编排开关(配合 fx.css 的 fxRise)
    // ────────────────────────────────────────────
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            document.body.classList.add('fx-ready');
        });
    });

    // ────────────────────────────────────────────
    // 3. 共享状态:鼠标 + 当前强调色
    // ────────────────────────────────────────────
    var mouse = { x: -9999, y: -9999, nx: 0.5, ny: 0.5 };
    window.addEventListener('mousemove', function (e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.nx = e.clientX / window.innerWidth;
        mouse.ny = e.clientY / window.innerHeight;
    }, { passive: true });

    var accentRGB = [78, 205, 196];
    function refreshAccent() {
        var raw = getComputedStyle(document.body).getPropertyValue('--accent2-rgb');
        var parts = raw.split(',').map(function (s) { return parseInt(s, 10); });
        if (parts.length === 3 && !isNaN(parts[0])) accentRGB = parts;
    }
    refreshAccent();
    new MutationObserver(refreshAccent)
        .observe(document.body, { attributes: true, attributeFilter: ['data-active-panel'] });

    // ────────────────────────────────────────────
    // 4. 鼠标视差(仅首页,lerp 平滑)
    // ────────────────────────────────────────────
    var parallaxLayers = [];
    if (!reduceMotion && !coarsePointer) {
        [
            { sel: '.hero-left',    depth: 14,  invert: false },
            { sel: '.hero-visual',  depth: 24,  invert: true  },
            { sel: '.corner-brand', depth: 8,   invert: false }
        ].forEach(function (cfg) {
            var el = document.querySelector(cfg.sel);
            if (el) parallaxLayers.push({ el: el, depth: cfg.depth, invert: cfg.invert, cx: 0, cy: 0 });
        });
    }

    function stepParallax() {
        if (!parallaxLayers.length) return;
        // 只在首页激活时推进,其它面板零开销
        if (document.body.dataset.activePanel !== 'home') return;
        var tx = (mouse.nx - 0.5), ty = (mouse.ny - 0.5);
        parallaxLayers.forEach(function (L) {
            var sign = L.invert ? -1 : 1;
            L.cx += (tx * L.depth * sign - L.cx) * 0.06;
            L.cy += (ty * L.depth * sign - L.cy) * 0.06;
            L.el.style.transform = 'translate3d(' + L.cx.toFixed(2) + 'px,' + L.cy.toFixed(2) + 'px,0)';
        });
    }

    // ────────────────────────────────────────────
    // 5. 鼠标粒子拖尾(发光星尘,跟随主题色)
    // ────────────────────────────────────────────
    var trail = { canvas: null, ctx: null, parts: [], lastSpawn: 0, dpr: 1 };
    var MAX_PARTS = 90;

    if (!reduceMotion && !coarsePointer) {
        trail.canvas = document.createElement('canvas');
        trail.canvas.id = 'fxTrail';
        document.body.appendChild(trail.canvas);
        trail.ctx = trail.canvas.getContext('2d');
        trail.dpr = Math.min(window.devicePixelRatio || 1, 2);

        function sizeTrail() {
            trail.canvas.width = window.innerWidth * trail.dpr;
            trail.canvas.height = window.innerHeight * trail.dpr;
        }
        sizeTrail();
        window.addEventListener('resize', sizeTrail);

        window.addEventListener('mousemove', function (e) {
            var now = performance.now();
            if (now - trail.lastSpawn < 22) return;   // ~45 次/秒封顶
            trail.lastSpawn = now;
            spawnPart(e.clientX, e.clientY, 1);
        }, { passive: true });
    }

    function spawnPart(x, y, spread, big) {
        if (!trail.ctx || trail.parts.length >= MAX_PARTS) return;
        var a = Math.random() * Math.PI * 2;
        var sp = (Math.random() * 0.6 + 0.2) * (spread || 1);
        trail.parts.push({
            x: x, y: y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 0.25,
            life: 1,
            decay: 0.018 + Math.random() * 0.02,
            r: big ? (2 + Math.random() * 3.5) : (1 + Math.random() * 2)
        });
    }

    // Konami / matrix 用的粒子爆发
    function burst(x, y, count, spread) {
        for (var i = 0; i < count; i++) spawnPart(x, y, spread || 6, true);
    }

    function stepTrail() {
        if (!trail.ctx) return;
        var ctx = trail.ctx;
        ctx.setTransform(trail.dpr, 0, 0, trail.dpr, 0, 0);
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        if (!trail.parts.length) return;

        ctx.globalCompositeOperation = 'lighter';
        for (var i = trail.parts.length - 1; i >= 0; i--) {
            var p = trail.parts[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.012;                       // 微重力,星尘下沉
            p.life -= p.decay;
            if (p.life <= 0) { trail.parts.splice(i, 1); continue; }
            var al = p.life * 0.75;
            ctx.beginPath();
            ctx.fillStyle = 'rgba(' + accentRGB[0] + ',' + accentRGB[1] + ',' + accentRGB[2] + ',' + al.toFixed(3) + ')';
            ctx.shadowColor = 'rgba(' + accentRGB[0] + ',' + accentRGB[1] + ',' + accentRGB[2] + ',0.9)';
            ctx.shadowBlur = 8 * p.life;
            ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';
    }

    // ── 单一 rAF 主循环 ──
    if (!reduceMotion && !coarsePointer) {
        (function loop() {
            stepParallax();
            stepTrail();
            requestAnimationFrame(loop);
        })();
    }

    // ────────────────────────────────────────────
    // 6. 磁吸按钮(靠近被吸住,离开弹回)
    // ────────────────────────────────────────────
    if (!reduceMotion && !coarsePointer) {
        document.querySelectorAll('.nav-item, .hero-cta, .s-icon, .hero-quick-links button')
            .forEach(function (el) {
                el.classList.add('fx-magnetic');
                el.addEventListener('mousemove', function (e) {
                    var r = el.getBoundingClientRect();
                    var dx = e.clientX - (r.left + r.width / 2);
                    var dy = e.clientY - (r.top + r.height / 2);
                    el.style.transform = 'translate(' + (dx * 0.28).toFixed(1) + 'px,' + (dy * 0.28).toFixed(1) + 'px)';
                });
                el.addEventListener('mouseleave', function () {
                    el.style.transform = '';
                });
            });
    }

    // ────────────────────────────────────────────
    // 7. 卡片 3D 倾斜(项目卡 / 技能卡)
    // ────────────────────────────────────────────
    if (!reduceMotion && !coarsePointer) {
        document.querySelectorAll('.project-card, .skill-item').forEach(function (el) {
            el.classList.add('fx-tilt');
            el.addEventListener('mousemove', function (e) {
                var r = el.getBoundingClientRect();
                var px = (e.clientX - r.left) / r.width - 0.5;
                var py = (e.clientY - r.top) / r.height - 0.5;
                el.style.transform =
                    'perspective(700px) rotateX(' + (-py * 8).toFixed(2) + 'deg)' +
                    ' rotateY(' + (px * 8).toFixed(2) + 'deg) translateY(-3px)';
            });
            el.addEventListener('mouseleave', function () {
                el.style.transform = '';
            });
        });
    }

    // ────────────────────────────────────────────
    // 8. Konami 秘籍:↑↑↓↓←→←→ B A
    // ────────────────────────────────────────────
    (function initKonami() {
        var SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
                   'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
        var progress = 0;
        window.addEventListener('keydown', function (e) {
            if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
            var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            progress = (key === SEQ[progress]) ? progress + 1 : (key === SEQ[0] ? 1 : 0);
            if (progress < SEQ.length) return;
            progress = 0;
            // 触发:星光爆发 + 背景狂欢 + toast
            burst(window.innerWidth / 2, window.innerHeight / 2, 80, 9);
            document.body.classList.add('fx-party');
            setTimeout(function () { document.body.classList.remove('fx-party'); }, 3600);
            if (typeof window.showToast === 'function') {
                window.showToast('KONAMI! 奖励 +1000,星光为你爆发');
            }
        });
    })();

    // ────────────────────────────────────────────
    // 9. 终端彩蛋(按 ` 召唤)
    // ────────────────────────────────────────────
    (function initTerminal() {
        var term = null, out = null, input = null, body = null;
        var history = [], hIdx = -1;
        var busy = false;

        var COMMANDS = {
            help: function () {
                print('可用命令:', 'acc');
                print('  whoami      这个人是谁');
                print('  skills      技能矩阵速览');
                print('  projects    精选项目');
                print('  contact     联系方式');
                print('  train       现场训练一个智能体(别眨眼)');
                print('  konami      一个秘密');
                print('  matrix      进入矩阵(3 秒)');
                print('  sudo        试试就试试');
                print('  clear       清屏');
                print('  exit        关闭终端 (或按 ESC / `)');
            },
            whoami: function () {
                print('skystar —— 成都的一名 RL 方向 AI 工程师。', 'acc');
                print('日常:训练智能体打游戏,顺便把这个网站当试验田。');
                print('相信的事:奖励函数设计得好,智能体自己会找到出路。', 'dim');
            },
            skills: function () {
                print('Python / PyTorch / 强化学习 / JavaScript / HTML5 / CSS3 ...', 'acc');
                print('正在学: SAC · 多智能体 RL · LoRA 微调 · TypeScript', 'dim');
                print('完整版见「技能矩阵」面板。');
            },
            projects: function () {
                print('1. 智能博弈算法 —— 2025 腾讯开悟公开赛 · 全国第 9', 'acc');
                print('2. Flappy Bird AI —— Dueling DQN + PER,端到端部署在本站');
                print('3. 智能问答系统 —— 毕设,从零预训练中文对话模型');
                print('详情见「精选项目」面板。', 'dim');
            },
            contact: function () {
                print('GitHub: github.com/skystar01', 'acc');
                print('或者去「联系我」面板,点一下就能复制。');
            },
            konami: function () {
                print('上上下下左右左右,然后 B A。', 'acc');
                print('别问,问就是奖励 +1000。', 'dim');
            },
            sudo: function () {
                print('权限不足。这件事连梯度都救不了你。', 'err');
            },
            matrix: function () {
                print('欢迎来到矩阵。3 秒后返回现实...', 'acc');
                var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
                var n = 0;
                var iv = setInterval(function () {
                    burst(Math.random() * window.innerWidth, Math.random() * window.innerHeight, 6, 4);
                    if (++n >= 12) clearInterval(iv);
                }, 250);
            },
            clear: function () { body.innerHTML = ''; },
            exit: function () { close(); }
        };

        // train 单独实现:假的训练过程,loss 往下掉
        COMMANDS.train = function () {
            busy = true;
            print('初始化 Dueling DQN ... env=FlappyBird-v0', 'dim');
            var ep = 0, total = 8;
            var iv = setInterval(function () {
                ep++;
                var loss = (1.8 * Math.pow(0.62, ep) + Math.random() * 0.05).toFixed(4);
                var reward = Math.round(-120 + 340 * (1 - Math.pow(0.68, ep)) + Math.random() * 18);
                print('episode ' + ep + '/' + total + '  loss=' + loss + '  avg_reward=' + reward);
                if (ep >= total) {
                    clearInterval(iv);
                    print('训练完成 ✔ 策略已收敛(并没有,这只是个彩蛋)', 'acc');
                    print('想看真训练?去游戏区按 A 召唤 Flappy AI。', 'dim');
                    busy = false;
                }
            }, 380);
        };

        function build() {
            term = document.createElement('div');
            term.id = 'fxTerm';
            term.innerHTML =
                '<div class="fx-term-bar">' +
                '  <span class="fx-term-dot" style="background:#ff5f57"></span>' +
                '  <span class="fx-term-dot" style="background:#febc2e"></span>' +
                '  <span class="fx-term-dot" style="background:#28c840"></span>' +
                '  <i>skystar@site ~ zsh</i>' +
                '</div>' +
                '<div class="fx-term-body"></div>' +
                '<div class="fx-term-input-row">' +
                '  <span class="fx-prompt">➜ ~</span>' +
                '  <input type="text" autocomplete="off" spellcheck="false" aria-label="终端输入" />' +
                '</div>';
            document.body.appendChild(term);
            body = term.querySelector('.fx-term-body');
            input = term.querySelector('input');

            input.addEventListener('keydown', function (e) {
                e.stopPropagation();               // 别让游戏脚本抢按键
                if (e.key === 'Enter') {
                    var cmd = input.value.trim().toLowerCase();
                    input.value = '';
                    if (!cmd || busy) return;
                    history.push(cmd); hIdx = history.length;
                    print('➜ ~ ' + cmd, 'dim');
                    (COMMANDS[cmd] || function () {
                        print('zsh: command not found: ' + cmd + '  (试试 help)', 'err');
                    })();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (hIdx > 0) { hIdx--; input.value = history[hIdx]; }
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (hIdx < history.length - 1) { hIdx++; input.value = history[hIdx]; }
                    else { hIdx = history.length; input.value = ''; }
                } else if (e.key === 'Escape') {
                    close();
                }
            });
            // 点击终端外不收起,避免误触;ESC / ` 关闭即可
        }

        function print(text, cls) {
            var div = document.createElement('div');
            div.className = 'fx-line' + (cls ? ' ' + cls : '');
            div.textContent = text;
            body.appendChild(div);
            body.scrollTop = body.scrollHeight;
        }

        function open() {
            if (!term) {
                build();
                print('SKY STAR 终端 v1.0 —— 输入 help 查看命令', 'acc');
                print('提示:这里的一切都是彩蛋,除了简历部分。', 'dim');
            }
            term.classList.add('open');
            setTimeout(function () { input.focus(); }, 120);
        }
        function close() {
            if (term) term.classList.remove('open');
        }

        window.addEventListener('keydown', function (e) {
            if (e.key !== '`' && e.key !== '~') return;
            if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target !== input) return;
            e.preventDefault();
            if (term && term.classList.contains('open')) close(); else open();
        });
    })();

})();
