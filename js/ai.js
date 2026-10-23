/* v1.9.21 AI 助手：侧边栏对话面板 + 待确认的写操作卡片
 *
 * 安全约定：
 *   - 前端永不接触 Cloudflare 密钥，只调自家 ai-chat 边缘函数。
 *   - 写操作（发私聊/工会消息）由后端登记为 pending，这里只负责展示 + 让用户点"确认发送"，
 *     绝不自动执行。
 */
(function () {
  const API = SUPABASE_URL, ANON = SUPABASE_ANON_KEY;
  const FN = `${API}/functions/v1/ai-chat`;

  const history = [];          // [{role, content}]
  let busy = false;
  let ready = false;

  function token() { return getToken(); }
  function meId() { const p = parseToken(); return p ? p.sub : null; }

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

  function pendingCard(p) {
    return `<div class="ai-pending" data-pid="${esc(p.id)}">
      <div class="ai-pending-head">待确认的操作</div>
      <div class="ai-pending-body">${esc(p.summary)}</div>
      <div class="ai-pending-acts">
        <button class="submit-btn small" data-ai-ok="${esc(p.id)}">确认发送</button>
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

  function wirePending(scope) {
    scope.querySelectorAll('[data-ai-ok]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.aiOk;
        const card = btn.closest('.ai-pending');
        btn.disabled = true;
        btn.textContent = '发送中...';
        const { status, data } = await call({ action: 'exec', id });
        if (data && data.success) {
          if (card) { card.classList.add('done'); card.querySelector('.ai-pending-acts').innerHTML = '<span class="ai-done-tip">已发送</span>'; }
          push(bubble('assistant', '已经帮你发出去了～'));
        } else {
          btn.disabled = false;
          btn.textContent = '确认发送';
          const msg = (data && data.error) || '发送失败';
          if (card) card.querySelector('.ai-pending-acts').insertAdjacentHTML('afterend', `<div class="form-message error">${esc(msg)}</div>`);
        }
      };
    });
    scope.querySelectorAll('[data-ai-no]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.aiNo;
        const card = btn.closest('.ai-pending');
        await call({ action: 'cancel', id });
        if (card) { card.classList.add('cancelled'); card.querySelector('.ai-pending-acts').innerHTML = '<span class="ai-done-tip">已取消</span>'; }
      };
    });
  }

  async function send() {
    if (busy) return;                                   // 前端也挡一下连点
    const input = document.getElementById('aiInput');
    const text = (input.value || '').trim();
    if (!text) return;
    if (!meId()) { showToast('请先登录', true); openAuthModal('login'); return; }

    busy = true;
    const btn = document.getElementById('aiSend');
    btn.disabled = true;

    input.value = '';
    push(bubble('user', text));
    history.push({ role: 'user', content: text });

    // 打字指示
    push(`<div class="ai-msg bot ai-typing" id="aiTyping"><div class="ai-ava">AI</div><div class="ai-bub"><span></span><span></span><span></span></div></div>`);

    const { status, data } = await call({ messages: history.slice(-12) });

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
        window.setAIFoot(`本次 ${u.chars || 0} 字 · 消耗 ${fmtPts(u.cost)} 积分 · 余额 ${fmtPts(u.balance)}`);
      }
      (data.pending || []).forEach(p => {
        const box = document.getElementById('aiMsgs');
        box.insertAdjacentHTML('beforeend', pendingCard(p));
        wirePending(box);
      });
      scrollBottom();
    }

    // 只保留最近 12 条，跟后端一致，防止越滚越长
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
          </div>
          <div class="ai-msgs" id="aiMsgs">
            <div class="ai-msg bot">
              <div class="ai-ava">AI</div>
              <div class="ai-bub">你好，我是 FKD 的 AI 助手。<br>可以问我游戏问题，也能让我帮你查积分、看排行榜，或者给站友发消息（发之前会让你确认）。</div>
            </div>
          </div>
          <div class="ai-inputbar">
            <textarea id="aiInput" rows="1" maxlength="2000" placeholder="想说点什么...（Enter 发送，Shift+Enter 换行）"></textarea>
            <button class="submit-btn small" id="aiSend">发送</button>
          </div>
          <div class="ai-foot" id="aiFoot"></div>
        </div>`;

      const input = document.getElementById('aiInput');
      document.getElementById('aiSend').onclick = send;
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      });
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });
    }
  };

  window.setAIFoot = function (txt) {
    const f = document.getElementById('aiFoot');
    if (f) f.textContent = txt || '';
  };

  // 与 guilds.js / chat.js 相同的链式包装方式，保证互不覆盖
  const _sw = window.switchView;
  window.switchView = function (name) {
    if (typeof _sw === 'function') _sw(name);
    if (name === 'ai') window.initAI();
  };
})();
