/* v1.9 工会模块：排名 / 我的工会 / 创建 / 申请(会长审核) / 退出 / 成员与赠送入口 */
(function () {
  const API = SUPABASE_URL;
  const ANON = SUPABASE_ANON_KEY;

  function token() { return getToken(); }
  function meId() { const p = parseToken(); return p ? p.sub : null; }

  async function rpc(name, body) {
    const r = await fetch(`${API}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { 'apikey': ANON, 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    return { status: r.status, data: await r.json().catch(() => ({ ok: false })) };
  }
  async function rest(path, query) {
    const r = await fetch(`${API}/rest/v1/${path}?${query}`, {
      headers: { 'apikey': ANON, 'Authorization': `Bearer ${token()}` }
    });
    return { status: r.status, data: await r.json().catch(() => null) };
  }

  function initGuilds() {
    const root = document.getElementById('guildRoot');
    if (!root) return;
    if (root.dataset.ready === '1') { loadGuildRank(); return; }
    root.dataset.ready = '1';
    root.innerHTML = `
      <div class="guild-head"><h2>⚔️ 工会</h2>
        <button class="submit-btn small" id="openCreateGuildBtn">➕ 创建工会</button>
      </div>
      <div class="guild-tabs">
        <button class="guild-tab active" data-gtab="rank">🏆 工会排名</button>
        <button class="guild-tab" data-gtab="mine">👥 我的工会</button>
      </div>
      <div class="subpanel active" id="guildRankPanel"><div class="guild-list" id="guildRankList"><div class="empty-hint">加载中...</div></div></div>
      <div class="subpanel" id="guildMinePanel">
        <div class="guild-list" id="guildMineList"></div>
        <div class="guild-apply-box">
          <input id="guildApplyInput" placeholder="输入工会名搜索并申请加入" />
          <button class="submit-btn small" id="guildSearchBtn">搜索</button>
          <div class="guild-search-result" id="guildSearchResult"></div>
        </div>
      </div>
      <div class="modal-overlay" id="createGuildModal">
        <div class="modal">
          <button class="modal-close" id="closeCreateGuildModal">&times;</button>
          <h3>➕ 创建工会</h3>
          <div class="form-group"><label>工会名称</label><input id="cgName" placeholder="最多 20 字" maxlength="20"/></div>
          <div class="form-group"><label>简称/标签（可选）</label><input id="cgTag" placeholder="如 FKD" maxlength="10"/></div>
          <div class="form-group"><label>简介（可选）</label><textarea id="cgDesc" rows="3" maxlength="200"></textarea></div>
          <button class="submit-btn" id="cgSubmitBtn">创建</button>
          <div class="form-message" id="cgMessage"></div>
        </div>
      </div>`;
    root.querySelectorAll('.guild-tab').forEach(t => {
      t.onclick = () => {
        root.querySelectorAll('.guild-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const tab = t.dataset.gtab;
        document.getElementById('guildRankPanel').classList.toggle('active', tab === 'rank');
        document.getElementById('guildMinePanel').classList.toggle('active', tab === 'mine');
        if (tab === 'rank') loadGuildRank(); else loadMyGuilds();
      };
    });
    document.getElementById('openCreateGuildBtn').onclick = () => document.getElementById('createGuildModal').classList.add('active');
    document.getElementById('closeCreateGuildModal').onclick = () => document.getElementById('createGuildModal').classList.remove('active');
    document.getElementById('cgSubmitBtn').onclick = createGuild;
    document.getElementById('guildSearchBtn').onclick = searchGuild;
    loadGuildRank();
  }

  async function loadGuildRank() {
    const box = document.getElementById('guildRankList');
    if (!box) return;
    box.innerHTML = '<div class="empty-hint">加载中...</div>';
    const { data } = await rpc('guild_rank_list', { p_limit: 50 });
    const list = (data && data.list) || [];
    if (!list.length) { box.innerHTML = '<div class="empty-hint">还没有工会，快去创建一个吧！</div>'; return; }
    box.innerHTML = list.map((g, i) => {
      const rank = i + 1;
      const top = rank <= 3 ? ' guild-top' : '';
      return `<div class="guild-card${top}">
        <div class="gc-rank">${rank}</div>
        <div class="gc-main">
          <div class="gc-name">${escapeHTML(g.name)}${g.tag ? `<span class="gc-tag">${escapeHTML(g.tag)}</span>` : ''}</div>
          <div class="gc-meta">成员 ${g.member_count || 0} 人 · 活跃值总和 ${g.total_active || 0}</div>
        </div>
        <div class="gc-actions"><button class="submit-btn small" data-rank="${g.id}">成员</button></div>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-rank]').forEach(b => b.onclick = () => showGuildMembers(b.dataset.rank, true));
  }

  async function loadMyGuilds() {
    const box = document.getElementById('guildMineList');
    if (!box) return;
    const uid = meId();
    if (!uid) {
      box.innerHTML = '<div class="empty-hint">请先 <a href="#" id="gLoginLink">登录</a> 查看你的工会</div>';
      const l = document.getElementById('gLoginLink');
      if (l) l.onclick = e => { e.preventDefault(); openAuthModal('login'); };
      return;
    }
    box.innerHTML = '<div class="empty-hint">加载中...</div>';
    const appr = await rest('guild_members', `select=guild_id,role,guilds(id,name,tag)&user_id=eq.${uid}&status=eq.approved`);
    const pend = await rest('guild_members', `select=guild_id,guilds(id,name,tag)&user_id=eq.${uid}&status=eq.pending`);
    const a = Array.isArray(appr.data) ? appr.data : [];
    const p = Array.isArray(pend.data) ? pend.data : [];
    if (!a.length && !p.length) {
      box.innerHTML = '<div class="empty-hint">你还没加入任何工会，搜索并申请加入，或自己创建。</div>';
      return;
    }
    let html = '';
    html += p.map(g => `<div class="guild-card"><div class="gc-main"><div class="gc-name">${escapeHTML(g.guilds ? g.guilds.name : '工会')}</div><div class="gc-meta">申请待审核</div></div></div>`).join('');
    html += a.map(g => {
      const gid = g.guilds ? g.guilds.id : g.guild_id;
      const isOwner = (g.role === 'owner');
      return `<div class="guild-card">
        <div class="gc-main"><div class="gc-name">${escapeHTML(g.guilds ? g.guilds.name : '工会')}${g.guilds && g.guilds.tag ? `<span class="gc-tag">${escapeHTML(g.guilds.tag)}</span>` : ''}</div><div class="gc-meta">${isOwner ? '👑 会长' : '成员'}</div></div>
        <div class="gc-actions">
          <button class="submit-btn small" data-mem="${gid}">成员</button>
          ${isOwner ? '<button class="submit-btn small" data-pend="' + gid + '">待审批</button>' : ''}
          <button class="submit-btn small ghost" data-leave="${gid}">退出</button>
        </div>
      </div>`;
    }).join('');
    box.innerHTML = html;
    box.querySelectorAll('[data-mem]').forEach(b => b.onclick = () => showGuildMembers(b.dataset.mem, false));
    box.querySelectorAll('[data-pend]').forEach(b => b.onclick = () => showGuildPending(b.dataset.pend));
    box.querySelectorAll('[data-leave]').forEach(b => b.onclick = () => leaveGuild(b.dataset.leave));
  }

  async function createGuild() {
    const uid = meId();
    if (!uid) { showToast('请先登录', true); openAuthModal('login'); return; }
    const name = document.getElementById('cgName').value.trim();
    const tag = document.getElementById('cgTag').value.trim();
    const desc = document.getElementById('cgDesc').value.trim();
    const msg = document.getElementById('cgMessage');
    if (!name) { msg.textContent = '工会名不能为空'; msg.className = 'form-message error'; return; }
    const { data } = await rpc('create_guild', { p_name: name, p_tag: tag, p_desc: desc });
    if (data && data.ok) {
      showToast('工会创建成功！');
      document.getElementById('createGuildModal').classList.remove('active');
      document.getElementById('cgName').value = ''; document.getElementById('cgTag').value = ''; document.getElementById('cgDesc').value = '';
      loadMyGuilds();
    } else { msg.textContent = (data && data.msg) || '创建失败'; msg.className = 'form-message error'; }
  }

  async function searchGuild() {
    const q = document.getElementById('guildApplyInput').value.trim();
    const box = document.getElementById('guildSearchResult');
    if (!q) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="empty-hint">搜索中...</div>';
    const { data } = await rest('guilds', `select=id,name,tag&name=ilike.*${encodeURIComponent(q)}*&limit=10`);
    if (!Array.isArray(data) || !data.length) { box.innerHTML = '<div class="empty-hint">没有匹配的工会</div>'; return; }
    box.innerHTML = data.map(g => `
      <div class="guild-card">
        <div class="gc-main"><div class="gc-name">${escapeHTML(g.name)}${g.tag ? `<span class="gc-tag">${escapeHTML(g.tag)}</span>` : ''}</div></div>
        <div class="gc-actions"><button class="submit-btn small" data-apply="${g.id}">申请加入</button></div>
      </div>`).join('');
    box.querySelectorAll('[data-apply]').forEach(b => b.onclick = () => applyGuild(b.dataset.apply));
  }

  async function applyGuild(gid) {
    const uid = meId();
    if (!uid) { showToast('请先登录', true); openAuthModal('login'); return; }
    const { data } = await rpc('apply_guild', { p_guild: gid });
    if (data && data.ok) { showToast('已提交申请，等待会长审核'); document.getElementById('guildApplyInput').value = ''; document.getElementById('guildSearchResult').innerHTML = ''; }
    else showToast((data && data.msg) || '申请失败', true);
  }

  async function showGuildMembers(gid, fromRank) {
    const box = document.getElementById('guildMineList');
    box.innerHTML = '<div class="empty-hint">加载中...</div>';
    const { data } = await rest('guild_members', `select=user_id,role,users(id,username,avatar_url,active_value)&guild_id=eq.${gid}&status=eq.approved`);
    const list = Array.isArray(data) ? data : [];
    let html = `<button class="submit-btn small ghost" id="gmBack">← 返回</button><div class="guild-members">`;
    if (!list.length) html += '<div class="empty-hint">暂无成员</div>';
    html += list.map(m => {
      const u = m.users || {};
      const av = u.avatar_url ? `<img class="hall-avatar" src="${escapeHTML(u.avatar_url)}" onerror="this.style.display='none'"/>` : `<div class="hall-avatar hall-avatar-empty">${escapeHTML((u.username || '?').slice(0, 1))}</div>`;
      const isMe = (u.id === meId());
      return `<div class="guild-member">
        ${av}
        <span class="gm-name">${escapeHTML(u.username || '匿名')}${m.role === 'owner' ? ' 👑' : ''}</span>
        <span class="gm-av">活跃 ${u.active_value || 0}</span>
        ${isMe ? '' : `<button class="submit-btn small" data-gift="${u.id}" data-gname="${escapeHTML(u.username || '')}">🎁 赠送</button>`}
      </div>`;
    }).join('');
    html += '</div>';
    box.innerHTML = html;
    const back = document.getElementById('gmBack');
    if (back) back.onclick = () => fromRank ? loadGuildRank() : loadMyGuilds();
    box.querySelectorAll('[data-gift]').forEach(b => b.onclick = () => window.giftUser(b.dataset.gift, b.dataset.gname));
  }

  async function showGuildPending(gid) {
    const box = document.getElementById('guildMineList');
    box.innerHTML = '<div class="empty-hint">加载中...</div>';
    const { data } = await rest('guild_members', `select=user_id,users(id,username)&guild_id=eq.${gid}&status=eq.pending`);
    const list = Array.isArray(data) ? data : [];
    let html = `<button class="submit-btn small ghost" id="gpBack">← 返回</button><div class="guild-pending">`;
    if (!list.length) html += '<div class="empty-hint">没有待审核的申请</div>';
    html += list.map(m => {
      const u = m.users || {};
      return `<div class="gp-item"><span class="gp-name">${escapeHTML(u.username || '匿名')}</span>
        <button class="submit-btn small" data-app="1" data-uid="${u.id}" data-gid="${gid}">批准</button>
        <button class="submit-btn small ghost" data-app="0" data-uid="${u.id}" data-gid="${gid}">拒绝</button></div>`;
    }).join('');
    html += '</div>';
    box.innerHTML = html;
    const back = document.getElementById('gpBack'); if (back) back.onclick = loadMyGuilds;
    box.querySelectorAll('[data-app]').forEach(b => b.onclick = () => handleApply(b.dataset.gid, b.dataset.uid, b.dataset.app === '1'));
  }

  async function handleApply(gid, uid, approve) {
    const { data } = await rpc('handle_guild_apply', { p_guild: gid, p_user: uid, p_approve: approve });
    if (data && data.ok) { showToast(approve ? '已批准加入' : '已拒绝'); showGuildPending(gid); }
    else showToast((data && data.msg) || '操作失败', true);
  }

  async function leaveGuild(gid) {
    if (!confirm('确定退出该工会？')) return;
    const { data } = await rpc('leave_guild', { p_guild: gid });
    if (data && data.ok) { showToast('已退出工会'); loadMyGuilds(); }
    else showToast((data && data.msg) || '退出失败', true);
  }

  const _sw = window.switchView;
  window.switchView = function (name) { if (typeof _sw === 'function') _sw(name); if (name === 'guilds') initGuilds(); };
})();
