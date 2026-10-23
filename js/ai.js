/* v1.9.23 AI 助手：侧边栏对话面板 + 多步骤任务链 + 处理方式（询问 / 自动通过）+ 操作记录
 *
 * 安全约定：
 *   - 前端永不接触 Cloudflare 密钥，只调自家 ai-chat 边缘函数。
 *   - 写操作由后端登记成 ai_pending_actions（任务链），这里只负责展示 + 让用户确认。
 *   - "自动通过"是用户自己显式选择的，选择存在 localStorage；敏感操作（退工会、赠积分）
 *     后端仍然会二次校验权限与额度，前端开关绕不过去。
 */
(function () {
  const API = SUPABASE_URL, ANON = SUPABASE_ANON_KEY;
  const FN = `${API}/functions/v1/ai-chat`;
  const MODE_KEY = 'fkd_ai_mode';        // 'ask' | 'auto'

  const history = [];                    // [{role, content}]
  let busy = false;
  let ready = false;
  let showLog = false;

  function token() { return getToken(); }
  function meId() { const p = parseToken(); return p ? p.sub : null; }

  function getMode() {
    try { return localStorage.getItem(MODE_KEY) === 'auto' ? 'auto' : 'ask'; } catch (e) { return 'ask'; }
  }
  function setMode(m) {
    try { localStorage.setItem(MODE_KEY, m === 'auto' ? 'auto' : 'ask'); } catch (e) {}
    renderModeBar();
  }

  async function call(payload) {
    const r = await fetch(FN, {
      method: 'POST',
      headers: {
        'apikey': ANON,
        'Authorization': `Bearer ${token()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    let data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    return { status: r.status, data };
  }

  function fmtPts(n) {
    if (typeof window.fmtPts === 'function') return window.fmtPts(n);
    const v = Number(n);
    if (!isFinite(v)) return '0';
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }

  function esc(s) {
    return (typeof escapeHTML === 'function')
      ? escapeHTML(String(s == null ? '' : s))
      : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function bubble(role, text) {
    const mine = role === 'user';
    return `<div class="ai-msg ${mine ? 'me' : 'bot'}">
      <div class="ai-ava">${mine ? '我' : 'AI'}</div>
      <div class="ai-bub">${esc(text).replace(/\n/g, '<br>')}</div>
    </div>`;
  }

  /* ---------- 处理方式条 ---------- */
  function renderModeBar() {
    const bar = document.getElementById('aiModeBar');
    if (!bar) return;
    const m = getMode();
    bar.innerHTML = `
      <span class="ai-mode-label">执行方式</span>
      <div class="ai-mode-seg" role="group">
        <button type="button" class="ai-mode-btn ${m === 'ask' ? 'on' : ''}" data-mode="ask">先问我</button>
        <button type="button" class="ai-mode-btn ${m === 'auto' ? 'on' : ''}" data-mode="auto">自动通过</button>
      </div>
      <button type="button" class="ai-log-btn" id="aiLogBtn">操作记录</button>`;
    bar.querySelectorAll('[data-mode]').forEach(b => {
      b.onclick = () => {
        setMode(b.dataset.mode);
        if (b.dataset.mode === 'auto') showToast('已开启自动通过：AI 的操作会直接执行');
      };
    });
    const lb = document.getElementById('aiLogBtn');
    if (lb) lb.onclick = toggleLog;
  }

  /* ---------- 任务链卡片（一句话多动作） ---------- */
  function batchCard(b) {
    const items = (b.items || []).map(it => `
      <li class="ai-batch-item">
        <span class="ai-batch-no">${it.seq}</span>
        <span class="ai-batch-txt">${esc(it.summary)}</span>
      </li>`).join('');
    const label = (b.count > 1) ? `待确认的 ${b.count} 个操作` : '待确认的操作';
    return `<div class="ai-pending ai-batch" data-bid="${esc(b.batch_id)}">
      <div class="ai-pending-head">${label}</div>
      <ol class="ai-batch-list">${items}</ol>
      <div class="ai-pending-acts">
        <button class="submit-btn small" data-batch-ok="${esc(b.batch_id)}">全部执行</button>
        <button class="submit-btn small ghost" data-batch-no="${esc(b.batch_id)}">全部取消</button>
      </div>
    </div>`;
  }

  /* ---------- 单条兼容卡片 ---------- */
  function pendingCard(p) {
    return `<div class="ai-pending" data-pid="${esc(p.id)}">
      <div class="ai-pending-head">待确认的操作</div>
      <div class="ai-pending-body">${esc(p.summary)}</div>
      <div class="ai-pending-acts">
        <button class="submit-btn small" data-ai-ok="${esc(p.id)}">确认执行</button>
        <button class="submit-btn small ghost" data-ai-no="${esc(p.id)}">取消</button>
      </div>
    </div>`;
  }

  function scrollBottom() {
    const box = document.getElementById('aiMsgs');
    if (box) box.scrollTop = box.scrollHeight;
  }

  function push(html) {
    const box = document.getElementById('aiMsgs');
    if (!box) return;
    box.insertAdjacentHTML('beforeend', html);
    scrollBottom();
  }

  function finishCard(card, cls, tip, detail) {
    if (!card) return;
    card.classList.add(cls);
    const acts = card.querySelector('.ai-pending-acts');
    if (acts) acts.innerHTML = `<span class="ai-done-tip">${esc(tip)}</span>`;
    if (detail) {
      card.insertAdjacentHTML('beforeend', `<div class="ai-batch-result">${esc(detail)}</div>`);
    }
  }

  function wireCards(scope) {
    scope.querySelectorAll('[data-batch-ok]').forEach(btn => {
      btn.onclick = async () => {
        const bid = btn.dataset.batchOk;
        const card = btn.closest('.ai-pending');
        btn.disabled = true;
        btn.textContent = '执行中...';
        const { data } = await call({ action: 'exec_batch', batch_id: bid });
        if (data && data.success) {
          const dn = (data.done != null) ? data.done : ((data.total != null) ? data.total : '');
          const tt = (data.total != null) ? data.total : '';
          finishCard(card, 'done', '已全部执行');
          push(bubble('assistant', (dn !== '' && tt !== '') ? `都办好了（${dn}/${tt}）。` : '都办好了～'));
        } else {
          btn.disabled = false;
          btn.textContent = '全部执行';
          const done = (data && data.done) || 0;
          const total = (data && data.total) || 0;
          const msg = (data && data.error) || '执行失败';
          finishCard(card, 'failed', done ? `执行到第 ${done}/${total} 步就停了` : '没有执行', msg);
        }
      };
    });
    scope.querySelectorAll('[data-batch-no]').forEach(btn => {
      btn.onclick = async () => {
        const bid = btn.dataset.batchNo;
        const card = btn.closest('.ai-pending');
        await call({ action: 'cancel_batch', batch_id: bid });
        finishCard(card, 'cancelled', '已取消');
      };
    });
    scope.querySelectorAll('[data-ai-ok]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.aiOk;
        const card = btn.closest('.ai-pending');
        btn.disabled = true;
        btn.textContent = '执行中...';
        const { data } = await call({ action: 'exec', id });
        if (data && data.success) {
          finishCard(card, 'done', '已执行');
          push(bubble('assistant', '办好了～'));
        } else {
          btn.disabled = false;
          btn.textContent = '确认执行';
          const msg = (data && data.error) || '执行失败';
          if (card) card.insertAdjacentHTML('beforeend', `<div class="form-message error">${esc(msg)}</div>`);
        }
      };
    });
    scope.querySelectorAll('[data-ai-no]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.aiNo;
        const card = btn.closest('.ai-pending');
        await call({ action: 'cancel', id });
        finishCard(card, 'cancelled', '已取消');
      };
    });
  }

  /* ---------- 操作记录 ---------- */
  async function toggleLog() {
    const panel = document.getElementById('aiLogPanel');
    if (!panel) return;
    if (showLog) { panel.classList.remove('open'); showLog = false; return; }
    showLog = true;
    panel.classList.add('open');
    panel.innerHTML = '<div class="ai-log-empty">加载中...</div>';
    const { status, data } = await call({ action: 'log', limit: 30 });
    const list = (data && data.list) || [];
    if (status !== 200 || !list.length) {
      panel.innerHTML = '<div class="ai-log-empty">还没有操作记录</div>';
      return;
    }
    panel.innerHTML = `<div class="ai-log-head">操作记录</div>` + list.map(x => {
      const when = (x.created_at || '').replace('T', ' ').slice(5, 16);
      const okCls = x.ok ? 'ok' : 'fail';
      const who = x.approved_by === 'auto' ? '自动' : '确认';
      return `<div class="ai-log-row">
        <span class="ai-log-dot ${okCls}"></span>
        <span class="ai-log-main">
          <span class="ai-log-sum">${esc(x.summary || x.kind || '')}</span>
          <span class="ai-log-meta">${esc(when)} · ${esc(who)}${x.err ? ' · ' + esc(x.err) : ''}</span>
        </span>
      </div>`;
    }).join('');
  }

  async function send() {
    if (busy) return;
    const input = document.getElementById('aiInput');
    const text = (input.value || '').trim();
    if (!text) return;
    if (!meId()) { showToast('请先登录', true); openAuthModal('login'); return; }

    busy = true;
    const btn = document.getElementById('aiSend');
    btn.disabled = true;

    input.value = '';
    input.style.height = 'auto';
    push(bubble('user', text));
    history.push({ role: 'user', content: text });

    push(`<div class="ai-msg bot ai-typing" id="aiTyping"><div class="ai-ava">AI</div><div class="ai-bub"><span></span><span></span><span></span></div></div>`);

    const { status, data } = await call({ messages: history.slice(-12), mode: getMode() });

    const t = document.getElementById('aiTyping');
    if (t) t.remove();

    if (status === 402) {
      push(bubble('assistant', '积分不够啦，去个人主页签个到就能领积分～'));
      if (window.setAIFoot) window.setAIFoot('当前积分：' + fmtPts(data && data.balance));
    } else if (status === 429) {
      push(bubble('assistant', (data && data.error) || '太快了，等会儿再问～'));
    } else if (status !== 200 || !data || !data.success) {
      push(bubble('assistant', (data && data.error) || '我这边出了点问题，稍后再试试'));
    } else {
      const reply = data.reply || '';
      history.push({ role: 'assistant', content: reply });
      push(bubble('assistant', reply));

      const u = data.usage || {};
      if (window.setAIFoot && u.balance !== undefined) {
        const freeTip = u.cost ? '' : ' · 本次免费';
        window.setAIFoot(`本次 ${u.chars || 0} 字 · 消耗 ${fmtPts(u.cost)} 积分${freeTip} · 余额 ${fmtPts(u.balance)}`);
      }

      if (data.batch && data.batch.batch_id) {
        push(batchCard(data.batch));
        const ar = data.auto_result;
        if (ar) {
          const card = document.querySelector('.ai-batch[data-bid="' + data.batch.batch_id + '"]');
          const dn = (ar.done != null) ? ar.done : 0;
          const tt = (ar.total != null) ? ar.total : ((data.batch && data.batch.count) || 0);
          if (ar.ok) {
            finishCard(card, 'done', tt ? `已自动执行 ${dn || tt}/${tt}` : '已自动执行');
          } else {
            finishCard(card, 'failed', `执行到第 ${dn}/${tt} 步就停了`, ar.error || '');
          }
        }
      } else if (data.batch_error) {
        push(bubble('assistant', '操作没排上：' + data.batch_error));
      }
      (data.pending || []).forEach(p => push(pendingCard(p)));

      const box = document.getElementById('aiMsgs');
      if (box) wireCards(box);
      scrollBottom();
    }

    if (history.length > 12) history.splice(0, history.length - 12);

    busy = false;
    btn.disabled = false;
    input.focus();
  }

  window.initAI = function () {
    const root = document.getElementById('aiRoot');
    if (!root) return;

    if (!ready) {
      ready = true;
      root.innerHTML = `
        <div class="ai-layout">
          <div class="ai-head">
            <div class="ai-title"><svg class="ui-ic" aria-hidden="true"><use href="#ic-spark"></use></svg> AI 助手</div>
            <div class="ai-sub">能聊 MC，也能帮你查积分、发消息 · 按字数扣积分</div>
            <div class="ai-mode-bar" id="aiModeBar"></div>
          </div>
          <div class="ai-log-panel" id="aiLogPanel"></div>
          <div class="ai-msgs" id="aiMsgs">
            <div class="ai-msg bot">
              <div class="ai-ava">AI</div>
              <div class="ai-bub">你好，我是 FKD 的 AI 助手。<br>可以问我游戏问题，也能让我帮你查积分、看排行榜，或者给站友发消息。<br>一句话说几件事也行，我会按顺序排好给你确认。</div>
            </div>
          </div>
          <div class="ai-inputbar">
            <textarea id="aiInput" rows="1" maxlength="2000" placeholder="想说点什么...（Enter 发送，Shift+Enter 换行）"></textarea>
            <button class="submit-btn small" id="aiSend">发送</button>
          </div>
          <div class="ai-foot" id="aiFoot"></div>
        </div>`;

      renderModeBar();

      const input = document.getElementById('aiInput');
      document.getElementById('aiSend').onclick = send;
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      });
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });
    } else {
      renderModeBar();
    }
  };

  window.setAIFoot = function (txt) {
    const f = document.getElementById('aiFoot');
    if (f) f.textContent = txt || '';
  };

  const _sw = window.switchView;
  window.switchView = function (name) {
    if (typeof _sw === 'function') _sw(name);
    if (name === 'ai') window.initAI();
  };
})();
