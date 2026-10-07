/*
 * FKD 基岩结构查找器（Bedrock Edition，含网易版）
 * ---------------------------------------------------------------
 * 算法来源：MCBEStructureFinder（MIT License, github.com/bedrock-dev）
 *   - MT19937 随机数：mt_n_get()（be_random.cpp 原样移植，32 位运算）
 *   - 候选区块派生：cal_candicate_seed() + get_candicate_pos_in_area()
 * 仅计算结构“候选区块”，不做生物群系校验（biome 校验需内嵌完整基岩
 * 群系生成器，工作量极大且版本敏感）——因此输出为候选位置，少数情况下
 * 因群系条件不满足可能不生成，请游戏内确认。坐标算法与 Chunkbase 同源。
 *
 * 适用：基岩 1.18+（含网易版），32 位世界种子。要塞/末地/下界结构因机制
 * 不同或上游未完成，本工具暂不支持。
 */
(function () {
        'use strict';

        // ---- MT19937：基岩版 mt_n_get（按 be_random.cpp 原样移植） ----
        // C++ 用 uint32_t，JS 用 Math.imul 做 32 位乘法 + >>>0 截断模拟
        function mt_n_get(seed, n) {
                seed = seed >>> 0;
                const head = new Uint32Array(n + 1);
                head[0] = seed;
                for (let i = 1; i < n + 1; i++) {
                        head[i] = (Math.imul(0x6c078965, (head[i - 1] ^ (head[i - 1] >>> 30)) >>> 0) + i) >>> 0;
                }
                let temp = head[n];
                for (let i = n; i < 397; i++) {
                        temp = (Math.imul(0x6c078965, (temp ^ (temp >>> 30)) >>> 0) + (i + 1)) >>> 0;
                }
                const last = new Uint32Array(n + 1);
                last[0] = temp;
                for (let i = 1; i < n + 1; i++) {
                        last[i] = (Math.imul(0x6c078965, (last[i - 1] ^ (last[i - 1] >>> 30)) >>> 0) + (i + 397)) >>> 0;
                }
                const result = new Uint32Array(n);
                for (let i = 0; i < n; i++) {
                        const lo = head[i] & 0x80000000;
                        const hi = head[i + 1] & 0x7fffffff;
                        temp = (lo + hi) >>> 0;
                        head[i] = (temp >>> 1) ^ last[i];
                        if (temp % 2 !== 0) head[i] = (head[i] ^ 0x9908b0df) >>> 0;
                }
                for (let i = 0; i < n; i++) {
                        let y = head[i];
                        y = y ^ (y >>> 11);
                        y = (y ^ ((y << 7) & 0x9d2c5680)) >>> 0;
                        y = (y ^ ((y << 15) & 0xefc60000)) >>> 0;
                        y = y ^ (y >>> 18);
                        result[i] = y >>> 0;
                }
                return result;
        }

        // ---- 结构配置（来自 MCBEStructureFinder structure.h） ----
        // spacing=区域间距(区块) spawnRange=区域内偏移范围 salt=盐值 num=随机数个数
        const STRUCTS = {
                buried_treasure: { label: '埋藏宝藏',         dim: 'overworld', spacing: 4,  spawnRange: 2,  salt: 16842397,  num: 4, color: '#d6c27a', desc: '生成于海滩/石岸群系区块的 (x*16+8, z*16+8)' },
                village:         { label: '村庄',             dim: 'overworld', spacing: 27, spawnRange: 17, salt: 10387312,  num: 4, color: '#8bd17c', desc: '平原/ savanna/ 雪原/ 沙漠/ 冷针叶林等群系' },
                temple:          { label: '神庙(沙漠/丛林)',  dim: 'overworld', spacing: 32, spawnRange: 24, salt: 14357617,  num: 2, color: '#e0b35a', desc: '沙漠神殿 / 丛林神殿（含女巫小屋、雪屋）' },
                ocean_monument:  { label: '海底神殿',         dim: 'overworld', spacing: 32, spawnRange: 27, salt: 10387313,  num: 4, color: '#5aa9e6', desc: '需深海中心群系（深海洋）' },
                mansion:         { label: '林地府邸',         dim: 'overworld', spacing: 80, spawnRange: 60, salt: 10387319,  num: 4, color: '#a07be6', desc: '黑森林群系，极稀有' },
                pillager:        { label: '掠夺者哨塔',       dim: 'overworld', spacing: 80, spawnRange: 56, salt: 165745296, num: 4, color: '#c0504d', desc: '平原/ savanna/ 雪原等群系' }
        };

        // 种子文本归一（与 orefinder.js 保持一致：数字直接用，文本走 FNV-1a）
        function parseSeed(text) {
                text = (text || '').trim();
                if (!text) return 0;
                if (/^-?\d+$/.test(text)) return parseInt(text, 10) >>> 0;
                let h = 2166136261 >>> 0;
                for (let i = 0; i < text.length; i++) {
                        h ^= text.charCodeAt(i);
                        h = Math.imul(h, 16777619) >>> 0;
                }
                return h >>> 0;
        }

        // 数学正余（处理负数）
        function mod(a, n) { return ((a % n) + n) % n; }

        // 对应 C++ get_cong_with_module(base, spacing, value)：把 value 对齐进 base 所在的 spacing 网格
        function get_cong_with_module(base, spacing, value) {
                const m = mod(base, spacing);
                return base - m + mod(value - m, spacing);
        }

        // 对应 C++ cal_candicate_seed(p, salt) + worldSeed（32 位）
        //   seed = salt - 245998635*p.z - 1724254968*p.x + worldSeed  (mod 2^32)
        function calAreaSeed(px, pz, salt, worldSeed) {
                let s = (salt >>> 0);
                s = (s - Math.imul(245998635, pz >>> 0)) >>> 0;
                s = (s - Math.imul(1724254968, px >>> 0)) >>> 0;
                return (s + (worldSeed >>> 0)) >>> 0;
        }

        function chunkCenter(c) { return c * 16 + 8; }

        // 主查找：基于种子对目标坐标周围的区域做确定性网格扫描，输出候选区块
        function findStructures(opts) {
                const seed = parseSeed(opts.seedText);
                const st = STRUCTS[opts.structKey] || STRUCTS.village;
                const cx0 = Math.floor((opts.centerX || 0) / 16); // 中心区块坐标
                const cz0 = Math.floor((opts.centerZ || 0) / 16);
                const spacing = st.spacing;
                // 区块坐标 -> 区域坐标（floor 语义，与 cubiomes scala_down 一致）
                const areaCenterX = Math.floor(cx0 / spacing);
                const areaCenterZ = Math.floor(cz0 / spacing);
                // 搜索半径（方块）-> 区域半径（与 C++ 一致：range/(spacing*16)，向上取整后 -1）
                const range = Math.max(16, parseInt(opts.radius, 10) || 4000);
                let radius = Math.floor(range / (spacing * 16));
                if (range % spacing !== 0) radius++;
                radius--;
                const results = [];
                for (let i = -radius; i <= radius; i++) {
                        for (let j = -radius; j <= radius; j++) {
                                const ax = areaCenterX + i;
                                const az = areaCenterZ + j;
                                const areaSeed = calAreaSeed(ax, az, st.salt, seed);
                                const boxMinX = ax * spacing;
                                const boxMinZ = az * spacing;
                                const mt = mt_n_get(areaSeed, st.num);
                                const r1 = mt[0] % st.spawnRange;
                                const r2 = mt[1] % st.spawnRange;
                                let avgX, avgZ;
                                if (st.num === 2) {
                                        avgX = r1; avgZ = r2;
                                } else {
                                        const r3 = mt[2] % st.spawnRange;
                                        const r4 = mt[3] % st.spawnRange;
                                        avgX = Math.floor((r1 + r2) / 2);
                                        avgZ = Math.floor((r3 + r4) / 2);
                                }
                                const chunkX = get_cong_with_module(boxMinX, spacing, avgX);
                                const chunkZ = get_cong_with_module(boxMinZ, spacing, avgZ);
                                const dist = Math.round(Math.sqrt((chunkX - cx0) * (chunkX - cx0) + (chunkZ - cz0) * (chunkZ - cz0)) * 16);
                                results.push({ chunkX, chunkZ, x: chunkCenter(chunkX), z: chunkCenter(chunkZ), dist });
                        }
                }
                results.sort((a, b) => a.dist - b.dist || (a.chunkX - b.chunkX) || (a.chunkZ - b.chunkZ));
                return {
                        structKey: opts.structKey, struct: st, seed,
                        centerX: opts.centerX || 0, centerZ: opts.centerZ || 0,
                        range, total: results.length, results
                };
        }

        // 渲染结果（复用 ore-result 样式体系）
        function renderStructResult(containerId, data, opts) {
                opts = opts || {};
                const el = document.getElementById(containerId);
                if (!el) return;
                el.style.display = 'block';
                const o = data.struct;
                const dimName = o.dim === 'nether' ? '下界' : (o.dim === 'end' ? '末地' : '主世界');
                const rows = data.results.slice(0, 80).map(r => `
                        <div class="ore-row">
                                <span class="ore-chunk">区块 (${r.chunkX}, ${r.chunkZ})</span>
                                <span class="ore-finger">方块 (${r.x}, ${r.z})</span>
                                <span class="ore-dist">${r.dist} 格外</span>
                        </div>`).join('');
                el.innerHTML = `
                        <div class="ore-result-head">
                                <span class="ore-badge" style="background:${o.color}"></span>
                                <strong>${o.label}</strong>
                                <span class="ore-dim">· ${dimName}</span>
                                <span class="ore-seed">种子 ${data.seed}</span>
                        </div>
                        <div class="ore-ylevel">
                                <div class="oy-row"><span class="oy-label">候选数量</span><span class="oy-val" style="color:${o.color}">${data.total}</span></div>
                                <div class="oy-sub">搜索半径 ${data.range} 方块 · 中心 (${data.centerX}, ${data.centerZ})</div>
                        </div>
                        <p class="ore-desc">${o.desc}</p>
                        <div class="ore-list">
                                <div class="ore-list-title">按距离排序的候选区块（共 ${data.total} 个${data.results.length > 80 ? '，仅显示最近 80' : ''}）</div>
                                ${rows}
                        </div>
                        ${opts.bare ? '' : `<div class="ore-disclaimer">
                                ⚠️ <b>准确性说明</b>：坐标为<b>候选区块</b>（算法与 Chunkbase 同源，基于世界种子确定性派生）。本工具<b>未内置生物群系校验</b>，少数候选可能因群系条件不满足而不生成，请游戏内确认。要塞/末地/下界结构因机制不同暂不支持。
                        </div>`}`;
        }

        window.FKDStructureFinder = { STRUCTS, findStructures, renderStructResult, parseSeed, mt_n_get };
})();
