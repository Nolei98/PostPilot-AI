/* ============================================================
   PostPilot AI v1.4 — Application Simulator
   ============================================================ */

(function () {
  'use strict';

  /* ===========================================================
     STATE
     =========================================================== */
  const state = {
    isLoggedIn: false,
    authMode: 'login', // 'login' | 'register'
    currentTab: 'fila',
    activePlan: 'Pro',
    postsGeneratedThisMonth: 90,
    postsLimitThisMonth: 90,
    preferredLanguage: 'pt',
    telegramConnected: true,
    preferenceRealPhotos: true,

    rssFeeds: [
      { id: 1, name: 'TechCrunch', url: 'https://techcrunch.com/feed', sector: 'Tech' },
      { id: 2, name: 'InfoMoney', url: 'https://infomoney.com/feed', sector: 'Finanças' },
      { id: 3, name: 'Vogue BR', url: 'https://vogue.globo.com/feed', sector: 'Moda' },
      { id: 4, name: 'Saúde Abril', url: 'https://saude.abril.com.br/feed', sector: 'Saúde' },
    ],

    draftPosts: [
      {
        id: 'd1',
        source: 'TechCrunch',
        sector: 'Tech',
        score: 92,
        image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=375&fit=crop',
        caption:
          '🚀 A inteligência artificial está revolucionando a forma como empresas operam. Novas ferramentas de IA generativa prometem reduzir custos operacionais em até 40% nos próximos dois anos.\n\nO futuro da automação já chegou — e quem não se adaptar, fica para trás.\n\n#IA #Tecnologia #Inovação #PostPilotAI',
      },
      {
        id: 'd2',
        source: 'InfoMoney',
        sector: 'Finanças',
        score: 78,
        image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=375&fit=crop',
        caption:
          '📊 O mercado financeiro brasileiro registrou alta de 2,3% nesta semana, impulsionado por resultados acima do esperado no setor bancário.\n\nAnalistas apontam que o cenário de juros em queda deve continuar atraindo investidores estrangeiros.\n\n#Finanças #Investimentos #Bolsa #PostPilotAI',
      },
      {
        id: 'd3',
        source: 'Vogue BR',
        sector: 'Moda',
        score: 85,
        image: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&h=375&fit=crop',
        caption:
          '✨ As tendências de moda sustentável ganham força em 2026. Grandes marcas estão investindo em tecidos reciclados e processos de produção com menor impacto ambiental.\n\nModa consciente é o novo luxo.\n\n#Moda #Sustentabilidade #Fashion #PostPilotAI',
      },
    ],

    readyPosts: [
      {
        id: 'r1',
        source: 'Saúde Abril',
        sector: 'Saúde',
        score: 88,
        image: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=600&h=375&fit=crop',
        caption:
          '🧬 Novo estudo revela que a prática regular de exercícios físicos pode reduzir o risco de doenças neurodegenerativas em até 35%.\n\nCuidar do corpo é cuidar da mente.\n\n#Saúde #BemEstar #Ciência #PostPilotAI',
        posted: false,
      },
    ],

    editingPost: null,
  };

  /* ===========================================================
     DOM REFS
     =========================================================== */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  /* ===========================================================
     AUTH
     =========================================================== */
  function initAuth() {
    const authWrapper = $('#auth-wrapper');
    const appWrapper = $('#app-wrapper');
    const authForm = $('#auth-form');
    const toggleAuthBtn = $('#toggle-auth-mode');
    const authTitle = $('#auth-title');
    const authSubmitBtn = $('#auth-submit-btn');
    const authToggleText = $('#auth-toggle-text');

    if (!authForm) return;

    toggleAuthBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (state.authMode === 'login') {
        state.authMode = 'register';
        authTitle.textContent = 'CRIAR CONTA';
        authSubmitBtn.textContent = 'Registrar';
        authToggleText.innerHTML = 'Já tem conta? <a href="#" id="toggle-auth-mode">Entrar</a>';
      } else {
        state.authMode = 'login';
        authTitle.textContent = 'ENTRAR';
        authSubmitBtn.textContent = 'Entrar';
        authToggleText.innerHTML = 'Não tem conta? <a href="#" id="toggle-auth-mode">Criar conta</a>';
      }
      // rebind
      $('#toggle-auth-mode')?.addEventListener('click', (ev) => {
        ev.preventDefault();
        initAuth();
      });
    });

    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      state.isLoggedIn = true;
      authWrapper.style.display = 'none';
      appWrapper.style.display = 'flex';
      switchTab('fila');
      showToast(state.authMode === 'login' ? 'Login efetuado ✓' : 'Conta criada ✓');
    });
  }

  function handleLogout() {
    state.isLoggedIn = false;
    const authWrapper = $('#auth-wrapper');
    const appWrapper = $('#app-wrapper');
    if (authWrapper) authWrapper.style.display = '';
    if (appWrapper) appWrapper.style.display = 'none';
    showToast('Sessão encerrada');
  }

  /* ===========================================================
     SIDEBAR NAV
     =========================================================== */
  function switchTab(tab) {
    state.currentTab = tab;

    // Update nav links
    $$('.nav-link').forEach((link) => {
      link.classList.toggle('active', link.dataset.tab === tab);
    });

    // Show/hide panels
    $$('.tab-panel').forEach((panel) => {
      panel.style.display = panel.dataset.panel === tab ? '' : 'none';
    });

    // Render tab content
    if (tab === 'fila') renderFila();
    else if (tab === 'ready') renderReady();
    else if (tab === 'settings') renderSettings();
    else if (tab === 'billing') renderBilling();
  }

  function initSidebarNav() {
    $$('.nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        switchTab(link.dataset.tab);
        // close mobile sidebar
        $('.app-sidebar')?.classList.remove('is-open');
      });
    });
  }

  /* ===========================================================
     SCAN RSS
     =========================================================== */
  function initScanButton() {
    const btn = $('#btn-scan-rss');
    if (!btn) return;

    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-scanning')) return;

      btn.classList.add('is-scanning');
      btn.textContent = 'Buscando…';

      setTimeout(() => {
        btn.classList.remove('is-scanning');
        btn.textContent = '⟳ Scan RSS';

        const newPost = {
          id: 'd' + Date.now(),
          source: 'Saúde Abril',
          sector: 'Saúde',
          score: 81,
          image: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=600&h=375&fit=crop',
          caption:
            '💊 Pesquisadores brasileiros desenvolvem novo tratamento para diabetes tipo 2 que reduz dependência de insulina em 60%.\n\nA ciência nacional continua a surpreender o mundo.\n\n#Saúde #Pesquisa #Brasil #PostPilotAI',
        };

        state.draftPosts.unshift(newPost);
        renderFila();
        showToast('1 novo post encontrado ✓');
      }, 2500);
    });
  }

  /* ===========================================================
     RENDER: FILA
     =========================================================== */
  function renderFila() {
    const grid = $('#fila-grid');
    if (!grid) return;

    if (state.draftPosts.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <p>Nenhum post na fila. Clique em <strong>Scan RSS</strong> para buscar novos conteúdos.</p>
        </div>`;
      return;
    }

    grid.innerHTML = state.draftPosts
      .map(
        (post) => `
      <div class="app-card" data-id="${post.id}">
        <div class="card-header-app">
          <span class="card-source-tag">${post.source}</span>
          <span class="card-score-badge ${post.score >= 85 ? 'score-high' : 'score-med'}">${post.score}/100</span>
        </div>
        <div class="card-media-app">
          <img src="${post.image}" alt="Post image" loading="lazy" />
        </div>
        <div class="card-body-app">
          <p>${post.caption.replace(/\n/g, '<br>')}</p>
        </div>
        <div class="card-actions-app">
          <button class="btn-approve" onclick="window._app.approvePost('${post.id}')">✓ Aprovar</button>
          <button class="btn-edit" onclick="window._app.openEditDrawer('${post.id}')">✎ Editar</button>
          <button class="btn-discard" onclick="window._app.discardPost('${post.id}')">✕ Descartar</button>
        </div>
      </div>`
      )
      .join('');
  }

  /* ===========================================================
     RENDER: READY
     =========================================================== */
  function renderReady() {
    const grid = $('#ready-grid');
    if (!grid) return;

    if (state.readyPosts.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          <p>Nenhum post aprovado ainda. Aprove posts na aba <strong>Fila</strong>.</p>
        </div>`;
      return;
    }

    grid.innerHTML = state.readyPosts
      .map(
        (post) => `
      <div class="app-card" data-id="${post.id}">
        <div class="card-header-app">
          <span class="card-source-tag">${post.source}</span>
          <span class="card-score-badge score-high">${post.score}/100</span>
        </div>
        <div class="card-media-app">
          <img src="${post.image}" alt="Post image" loading="lazy" />
        </div>
        <div class="card-body-app">
          <p>${post.caption.replace(/\n/g, '<br>')}</p>
        </div>
        <div class="card-actions-app" style="justify-content:flex-start; gap:8px;">
          <button class="post-action-btn-ready" onclick="window._app.copyCaption('${post.id}', this)">📋 Copiar</button>
          <button class="post-action-btn-ready" onclick="window._app.downloadImage('${post.id}')">⬇ Download</button>
          <button class="post-action-btn-ready" onclick="window._app.markPosted('${post.id}')">✓ Postado</button>
        </div>
      </div>`
      )
      .join('');
  }

  /* ===========================================================
     RENDER: SETTINGS
     =========================================================== */
  function renderSettings() {
    const container = $('#settings-content');
    if (!container) return;

    container.innerHTML = `
      <!-- RSS Feeds -->
      <div class="settings-section-card">
        <h4>📡 Feeds RSS</h4>
        <div id="feed-list">
          ${state.rssFeeds
            .map(
              (f) => `
            <div class="feed-item" data-id="${f.id}">
              <div class="feed-item-info">
                <span class="feed-item-name">${f.name}</span>
                <span class="feed-item-url">${f.url}</span>
                <span class="feed-item-sector">${f.sector}</span>
              </div>
              <button class="btn-remove" onclick="window._app.removeFeed(${f.id})">✕</button>
            </div>`
            )
            .join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;align-items:flex-end;">
          <div class="form-group" style="flex:1;min-width:160px;margin-bottom:0;">
            <label class="form-label">URL do Feed</label>
            <input class="form-input" type="url" id="new-feed-url" placeholder="https://exemplo.com/feed" />
          </div>
          <div class="form-group" style="width:140px;margin-bottom:0;">
            <label class="form-label">Setor</label>
            <select class="form-input" id="new-feed-sector">
              <option value="Tech">Tech</option>
              <option value="Finanças">Finanças</option>
              <option value="Moda">Moda</option>
              <option value="Saúde">Saúde</option>
              <option value="Educação">Educação</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
          <button class="btn btn-gradient" style="padding:10px 20px;margin-bottom:0;" onclick="window._app.addFeed()">+ Adicionar</button>
        </div>
      </div>

      <!-- Telegram -->
      <div class="settings-section-card">
        <h4>📲 Telegram</h4>
        <div class="toggle-group">
          <div>
            <div class="toggle-label">Enviar posts aprovados via Telegram</div>
            <div class="toggle-sublabel">Conecte seu bot para receber notificações</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="toggle-telegram" ${state.telegramConnected ? 'checked' : ''} onchange="window._app.toggleTelegram(this.checked)" />
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>

      <!-- Brand Preferences -->
      <div class="settings-section-card">
        <h4>🎨 Preferências de Marca</h4>
        <div class="toggle-group">
          <div>
            <div class="toggle-label">Priorizar fotos reais</div>
            <div class="toggle-sublabel">Quando ativo, usa fotos ao invés de ilustrações</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="toggle-photos" ${state.preferenceRealPhotos ? 'checked' : ''} onchange="window._app.togglePhotos(this.checked)" />
            <span class="switch-slider"></span>
          </label>
        </div>
        <div class="toggle-group">
          <div>
            <div class="toggle-label">Idioma dos posts</div>
            <div class="toggle-sublabel">Idioma padrão para geração de legendas</div>
          </div>
          <select class="footer-lang-select" id="lang-select" onchange="window._app.changeLang(this.value)">
            <option value="pt" ${state.preferredLanguage === 'pt' ? 'selected' : ''}>Português</option>
            <option value="en" ${state.preferredLanguage === 'en' ? 'selected' : ''}>English</option>
            <option value="es" ${state.preferredLanguage === 'es' ? 'selected' : ''}>Español</option>
          </select>
        </div>
      </div>
    `;
  }

  /* ===========================================================
     RENDER: BILLING
     =========================================================== */
  function renderBilling() {
    const container = $('#billing-content');
    if (!container) return;

    const pct = state.postsLimitThisMonth > 0
      ? Math.min(100, Math.round((state.postsGeneratedThisMonth / state.postsLimitThisMonth) * 100))
      : 0;

    const plans = [
      { name: 'Radar', limit: 5, price: 'Grátis' },
      { name: 'Criador', limit: 30, price: 'R$49' },
      { name: 'Pro', limit: 90, price: 'R$149' },
    ];

    container.innerHTML = `
      <!-- Usage -->
      <div class="usage-wrap">
        <div class="usage-label">
          <span class="usage-label-text">Posts gerados este mês</span>
          <span class="usage-label-count">${state.postsGeneratedThisMonth} / ${state.postsLimitThisMonth}</span>
        </div>
        <div class="usage-bar-outer">
          <div class="usage-bar-inner" style="width:${pct}%"></div>
        </div>
      </div>

      <h4 style="margin-bottom:4px;">PLANO ATUAL: <span class="gradient-text">${state.activePlan.toUpperCase()}</span></h4>
      <p style="font-size:.8rem;color:var(--text-muted);margin-bottom:8px;">Gerencie sua assinatura</p>

      <div class="plans-grid">
        ${plans
          .map(
            (p) => `
          <div class="plan-card ${state.activePlan === p.name ? 'is-active' : ''}">
            <div class="plan-name">${p.name}</div>
            <div class="plan-limit">${p.limit} posts/mês</div>
            <div class="plan-price">${p.price}${p.price !== 'Grátis' ? '<span>/mês</span>' : ''}</div>
            ${
              state.activePlan === p.name
                ? '<button class="btn btn-ghost" disabled style="width:100%;opacity:.5;">Plano atual</button>'
                : `<button class="btn btn-gradient" style="width:100%;" onclick="window._app.changePlan('${p.name}', ${p.limit})">${
                    plans.findIndex((x) => x.name === state.activePlan) > plans.findIndex((x) => x.name === p.name)
                      ? 'Downgrade'
                      : 'Upgrade'
                  }</button>`
            }
          </div>`
          )
          .join('')}
      </div>
    `;
  }

  /* ===========================================================
     POST ACTIONS
     =========================================================== */
  function approvePost(id) {
    const idx = state.draftPosts.findIndex((p) => p.id === id);
    if (idx === -1) return;

    const post = state.draftPosts.splice(idx, 1)[0];
    state.readyPosts.push({ ...post, posted: false });
    renderFila();
    showToast('Post aprovado ✓');
  }

  function discardPost(id) {
    const idx = state.draftPosts.findIndex((p) => p.id === id);
    if (idx === -1) return;

    state.draftPosts.splice(idx, 1);
    renderFila();
    showToast('Post descartado');
  }

  /* ===========================================================
     EDIT DRAWER
     =========================================================== */
  function openEditDrawer(id) {
    const post =
      state.draftPosts.find((p) => p.id === id) || state.readyPosts.find((p) => p.id === id);
    if (!post) return;

    state.editingPost = post;

    const overlay = $('#drawer-overlay');
    const drawer = $('#edit-drawer');
    const textarea = $('#drawer-caption');
    const imgPreview = $('#drawer-img');

    if (textarea) textarea.value = post.caption;
    if (imgPreview) imgPreview.src = post.image;

    overlay?.classList.add('is-open');
    drawer?.classList.add('is-open');
  }

  function closeEditDrawer() {
    state.editingPost = null;
    $('#drawer-overlay')?.classList.remove('is-open');
    $('#edit-drawer')?.classList.remove('is-open');
  }

  function saveDrawerEdit() {
    if (!state.editingPost) return;

    const textarea = $('#drawer-caption');
    if (textarea) state.editingPost.caption = textarea.value;

    closeEditDrawer();

    if (state.currentTab === 'fila') renderFila();
    else if (state.currentTab === 'ready') renderReady();

    showToast('Alterações salvas ✓');
  }

  function regenerateImage() {
    if (!state.editingPost) return;

    const images = [
      'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=600&h=375&fit=crop',
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&h=375&fit=crop',
      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=375&fit=crop',
      'https://images.unsplash.com/photo-1559526324-593bc073d938?w=600&h=375&fit=crop',
    ];

    const newImg = images[Math.floor(Math.random() * images.length)];
    state.editingPost.image = newImg;

    const imgPreview = $('#drawer-img');
    if (imgPreview) imgPreview.src = newImg;

    showToast('Imagem regenerada ✓');
  }

  /* ===========================================================
     READY ACTIONS
     =========================================================== */
  function copyCaption(id, btn) {
    const post = state.readyPosts.find((p) => p.id === id);
    if (!post) return;

    navigator.clipboard.writeText(post.caption).then(() => {
      btn.classList.add('copied');
      btn.textContent = '✓ Copiado';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.textContent = '📋 Copiar';
      }, 2000);
    }).catch(() => {
      showToast('Erro ao copiar');
    });
  }

  function downloadImage(id) {
    const post = state.readyPosts.find((p) => p.id === id);
    if (!post) return;

    const a = document.createElement('a');
    a.href = post.image;
    a.target = '_blank';
    a.download = `postpilot-${id}.jpg`;
    a.click();
    showToast('Download iniciado');
  }

  function markPosted(id) {
    const idx = state.readyPosts.findIndex((p) => p.id === id);
    if (idx === -1) return;

    state.readyPosts.splice(idx, 1);
    renderReady();
    showToast('Post marcado como publicado ✓');
  }

  /* ===========================================================
     SETTINGS ACTIONS
     =========================================================== */
  function removeFeed(id) {
    state.rssFeeds = state.rssFeeds.filter((f) => f.id !== id);
    renderSettings();
    showToast('Feed removido');
  }

  function addFeed() {
    const urlInput = $('#new-feed-url');
    const sectorSelect = $('#new-feed-sector');
    if (!urlInput || !sectorSelect) return;

    const url = urlInput.value.trim();
    if (!url) {
      showToast('Insira uma URL válida');
      return;
    }

    state.rssFeeds.push({
      id: Date.now(),
      name: new URL(url).hostname.replace('www.', ''),
      url: url,
      sector: sectorSelect.value,
    });

    renderSettings();
    showToast('Feed adicionado ✓');
  }

  function toggleTelegram(val) {
    state.telegramConnected = val;
    showToast(val ? 'Telegram conectado ✓' : 'Telegram desconectado');
  }

  function togglePhotos(val) {
    state.preferenceRealPhotos = val;
    showToast(val ? 'Fotos reais ativadas' : 'Ilustrações ativadas');
  }

  function changeLang(lang) {
    state.preferredLanguage = lang;
    const labels = { pt: 'Português', en: 'English', es: 'Español' };
    showToast(`Idioma: ${labels[lang] || lang}`);
  }

  /* ===========================================================
     BILLING ACTIONS
     =========================================================== */
  function changePlan(name, limit) {
    state.activePlan = name;
    state.postsLimitThisMonth = limit;
    state.postsGeneratedThisMonth = Math.min(state.postsGeneratedThisMonth, limit);
    renderBilling();
    showToast(`Plano alterado para ${name} ✓`);
  }

  /* ===========================================================
     MOBILE SIDEBAR TOGGLE
     =========================================================== */
  function initMobileToggle() {
    const btn = $('#sidebar-toggle-btn');
    const sidebar = $('.app-sidebar');
    if (!btn || !sidebar) return;

    btn.addEventListener('click', () => {
      sidebar.classList.toggle('is-open');
    });

    // close on outside click
    document.addEventListener('click', (e) => {
      if (
        sidebar.classList.contains('is-open') &&
        !sidebar.contains(e.target) &&
        !btn.contains(e.target)
      ) {
        sidebar.classList.remove('is-open');
      }
    });
  }

  /* ===========================================================
     TOAST
     =========================================================== */
  let toastTimer = null;

  function showToast(message) {
    const toast = $('#app-toast');
    if (!toast) return;

    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('is-visible');

    toastTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 2800);
  }

  /* ===========================================================
     INIT
     =========================================================== */
  function init() {
    initAuth();
    initSidebarNav();
    initScanButton();
    initMobileToggle();

    // Logout
    $('#btn-logout')?.addEventListener('click', handleLogout);

    // Drawer
    $('#drawer-overlay')?.addEventListener('click', closeEditDrawer);
    $('#drawer-close-btn')?.addEventListener('click', closeEditDrawer);
    $('#drawer-save-btn')?.addEventListener('click', saveDrawerEdit);
    $('#drawer-regen-btn')?.addEventListener('click', regenerateImage);

    // Expose methods globally for inline onclick
    window._app = {
      approvePost,
      discardPost,
      openEditDrawer,
      copyCaption,
      downloadImage,
      markPosted,
      removeFeed,
      addFeed,
      toggleTelegram,
      togglePhotos,
      changeLang,
      changePlan,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
