/* ==========================================================================
   PostPilot AI v1.1 - Application Mockup State Machine & Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  
  // --- App State ---
  let appState = {
    isLoggedIn: false,
    currentTab: 'fila', // 'fila' | 'ready' | 'settings'
    rssFeeds: [
      { id: 1, name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", active: true },
      { id: 2, name: "Hacker News (Tech/AI)", url: "https://news.ycombinator.com/rss", active: true },
      { id: 3, name: "The Verge AI Section", url: "https://theverge.com/ai-artificial-intelligence/rss", active: true }
    ],
    telegramConnected: false,
    telegramChatId: "",
    preferenceRealPhotos: true,
    
    // Fila de Aprovação (Drafts)
    draftPosts: [
      {
        id: "d1",
        title: "Modelos Open Source alcançam GPT-4o em codificação",
        source: "Hacker News",
        score: 95,
        image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=500&auto=format&fit=crop&q=80",
        caption: "🚨 REVOLUÇÃO OPEN SOURCE! O novo modelo de IA aberto de 70B parâmetros acaba de empatar com o GPT-4o em testes de benchmark de engenharia de software.\n\nIsso significa que qualquer desenvolvedor agora pode rodar em sua própria máquina local um assistente de código de nível mundial sem pagar por API.\n\nO monopólio das Big Techs está caindo? Escreva nos comentários! 👇\n\n#opensource #desenvolvedores #programacao #inteligenciaartificial #gpt4",
        date: "Há 1h"
      },
      {
        id: "d2",
        title: "Apple prepara Siri com motor de LLM local para iOS 18",
        source: "The Verge AI Section",
        score: 88,
        image: "https://images.unsplash.com/photo-1510519138101-570d1dca3d66?w=500&auto=format&fit=crop&q=80",
        caption: "🍏 SIRI COM SUPERPODERES! Fontes internas confirmam que a Apple está finalizando a integração de uma versão otimizada de um LLM rodando 100% offline direto no processador A18 do iPhone.\n\nRespostas instantâneas, sem latência de internet e com privacidade absoluta para os dados do usuário. \n\nO que você mais gostaria que a nova Siri fizesse? 👇\n\n#apple #ios18 #siri #iphone #tecnologia #ia",
        date: "Há 3h"
      },
      {
        id: "d3",
        title: "Robô humanoide da Figure AI começa a trabalhar na BMW",
        source: "TechCrunch AI",
        score: 91,
        image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=500&auto=format&fit=crop&q=80",
        caption: "🤖 DO LABORATÓRIO PARA A FÁBRICA! O robô Figure 02 iniciou oficialmente seus testes na linha de montagem da BMW nos EUA, realizando tarefas complexas de montagem de peças de precisão.\n\nEquipados com redes neurais treinadas em simulação física, eles aprendem observando operadores humanos e ajustam seus movimentos em tempo real.\n\nA era dos robôs nas fábricas começou. ⚡\n\n#robotica #figureai #bmw #automacao #futuro #tecnologia",
        date: "Há 5h"
      }
    ],
    
    // Posts Aprovados (Ready)
    readyPosts: [
      {
        id: "r1",
        title: "IA descobre nova classe de antibióticos após 60 anos",
        source: "Science Feed",
        score: 96,
        image: "https://images.unsplash.com/photo-1532187643603-ba119ca4109e?w=500&auto=format&fit=crop&q=80",
        caption: "🔬 A IA SALVANDO VIDAS! Pesquisadores do MIT utilizaram redes de aprendizado profundo para triar 12 milhões de compostos químicos e descobriram uma molécula inédita capaz de matar bactérias resistentes a antibióticos comuns.\n\nEssa descoberta demoraria mais de uma década e milhões de dólares em testes manuais tradicionais. A IA fez em poucos dias.\n\nO poder da tecnologia a serviço da saúde humana. 💜\n\n#ciencia #medtech #inteligenciaartificial #mit #descoberta",
        status: "approved" // "approved" | "posted"
      }
    ]
  };

  // --- Auth View Switcher ---
  const authContainer = document.getElementById('auth-container');
  const appContainer = document.getElementById('app-container');
  const authTitle = document.getElementById('auth-title');
  const authDesc = document.getElementById('auth-desc');
  const authSubmitBtn = document.getElementById('auth-submit-btn');
  const authSwitchLink = document.getElementById('auth-switch-link');
  const authSwitchPrompt = document.getElementById('auth-switch-prompt');
  
  let isRegisterMode = false;

  // Check URL Hash for registration link from Landing page
  if (window.location.hash === '#signup') {
    toggleAuthMode(true);
  }

  if (authSwitchLink) {
    authSwitchLink.addEventListener('click', (e) => {
      e.preventDefault();
      toggleAuthMode(!isRegisterMode);
    });
  }

  function toggleAuthMode(register) {
    isRegisterMode = register;
    if (isRegisterMode) {
      authTitle.textContent = "Crie sua conta";
      authDesc.textContent = "Cadastre-se para colocar seu feed no piloto automático.";
      authSubmitBtn.textContent = "Criar conta";
      authSwitchPrompt.textContent = "Já tem uma conta? ";
      authSwitchLink.textContent = "Entrar";
    } else {
      authTitle.textContent = "Entrar no App";
      authDesc.textContent = "Entre com suas credenciais para gerenciar sua fila de posts.";
      authSubmitBtn.textContent = "Entrar";
      authSwitchPrompt.textContent = "Novo por aqui? ";
      authSwitchLink.textContent = "Criar Conta";
    }
  }

  const authForm = document.getElementById('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      appState.isLoggedIn = true;
      authContainer.style.display = 'none';
      appContainer.style.display = 'flex';
      renderApp();
      showToast("Sucesso: Login efetuado!");
    });
  }

  // Logout Handler
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      appState.isLoggedIn = false;
      appContainer.style.display = 'none';
      authContainer.style.display = 'flex';
      showToast("Você saiu da conta.");
    });
  }

  // --- Sidebar Navigation ---
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  function switchTab(tab) {
    appState.currentTab = tab;
    
    // Update active class in sidebar links
    navLinks.forEach(link => {
      if (link.getAttribute('data-tab') === tab) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Toggle panels visibility
    document.getElementById('panel-fila').style.display = tab === 'fila' ? 'block' : 'none';
    document.getElementById('panel-ready').style.display = tab === 'ready' ? 'block' : 'none';
    document.getElementById('panel-settings').style.display = tab === 'settings' ? 'block' : 'none';

    // Show/Hide top Scan button depending on tab
    const btnScan = document.getElementById('btn-scan');
    if (btnScan) {
      btnScan.style.display = tab === 'fila' ? 'flex' : 'none';
    }

    renderTabContent();
  }

  // --- Scan RSS News Simulator ---
  const btnScan = document.getElementById('btn-scan');
  if (btnScan) {
    btnScan.addEventListener('click', () => {
      if (btnScan.classList.contains('scanning')) return;
      
      btnScan.classList.add('scanning');
      btnScan.innerHTML = `<i style="display:inline-block;">🔄</i> Varrendo notícias...`;
      
      showToast("Buscando atualizações de feeds RSS...");
      
      setTimeout(() => {
        // Generate mock post
        const newPost = {
          id: "d_" + Date.now(),
          title: "Inteligência Artificial de fusão nuclear atinge recorde de calor",
          source: "Science Feed",
          score: Math.floor(Math.random() * 15) + 81, // 81 to 95
          image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=500&auto=format&fit=crop&q=80",
          caption: "💥 RECORDE HISTÓRICO! Uma IA preditiva desenvolvida para controle magnético de plasma ajudou a conter a fusão nuclear estável a 100 milhões de graus por 48 segundos.\n\nEssa tecnologia nos aproxima da energia limpa e infinita baseada na dinâmica das estrelas. A IA controlou as bobinas eletromagnéticas com precisão impossível para humanos.\n\nEstamos perto da eletricidade gratuita para sempre? ⚡\n\n#energia #fusao #tecnologia #pesquisa #futuro #inteligenciaartificial",
          date: "Agora mesmo"
        };
        
        appState.draftPosts.unshift(newPost);
        btnScan.classList.remove('scanning');
        btnScan.innerHTML = `<i>🔄</i> Varrer agora`;
        
        showToast("✓ Nova notícia viral estruturada na Fila!");
        
        if (appState.currentTab === 'fila') {
          renderFila();
        }
      }, 2500);
    });
  }

  // --- Render Functions ---
  function renderApp() {
    switchTab(appState.currentTab);
  }

  function renderTabContent() {
    if (appState.currentTab === 'fila') {
      renderFila();
    } else if (appState.currentTab === 'ready') {
      renderReady();
    } else if (appState.currentTab === 'settings') {
      renderSettings();
    }
  }

  // 1. Render Fila de Aprovação
  const filaGrid = document.getElementById('fila-grid');
  function renderFila() {
    filaGrid.innerHTML = '';
    
    if (appState.draftPosts.length === 0) {
      filaGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">🏖️</div>
          <h4 class="empty-title">Nenhum post na Fila de Aprovação</h4>
          <p class="empty-desc">Todos os posts foram revisados. Clique em "Varrer agora" para buscar novas notícias nos feeds RSS.</p>
        </div>
      `;
      return;
    }
    
    appState.draftPosts.forEach(post => {
      const card = document.createElement('div');
      card.className = 'glass-panel app-card';
      
      const scoreClass = post.score >= 90 ? 'score-high' : 'score-med';
      const imageLabel = appState.preferenceRealPhotos ? 'FOTO REAL (BANCO)' : 'ARTE IA (FALLBACK)';

      card.innerHTML = `
        <div class="card-header-app">
          <span class="card-source-tag">${post.source}</span>
          <span class="card-score-badge ${scoreClass}">Score: ${post.score}%</span>
        </div>
        <div class="card-media-app" style="background-image: url('${post.image}')">
          <span class="badge-image-preference">${imageLabel}</span>
        </div>
        <div class="card-body-app">
          <h4 class="card-title-app">${post.title}</h4>
          <p class="card-caption-app">${post.caption.replace(/\n/g, '<br>')}</p>
          <div class="card-actions-app">
            <button class="showcase-btn btn-approve" data-id="${post.id}">✓ Aprovar</button>
            <button class="showcase-btn btn-edit" data-id="${post.id}">✎ Editar</button>
            <button class="showcase-btn btn-discard" data-id="${post.id}">✕ Descartar</button>
          </div>
        </div>
      `;
      
      // Wire Action buttons
      card.querySelector('.btn-approve').addEventListener('click', () => approvePost(post.id));
      card.querySelector('.btn-edit').addEventListener('click', () => openEditDrawer(post.id));
      card.querySelector('.btn-discard').addEventListener('click', () => discardPost(post.id));
      
      filaGrid.appendChild(card);
    });
  }

  // 2. Render Posts Prontos
  const readyGrid = document.getElementById('ready-grid');
  const readyFilterSelect = document.getElementById('ready-filter');
  
  if (readyFilterSelect) {
    readyFilterSelect.addEventListener('change', () => {
      renderReady();
    });
  }

  function renderReady() {
    readyGrid.innerHTML = '';
    const filter = readyFilterSelect ? readyFilterSelect.value : 'todos';
    
    let filtered = appState.readyPosts;
    if (filter === 'copiados') {
      filtered = appState.readyPosts.filter(p => p.status === 'posted');
    } else if (filter === 'pendentes') {
      filtered = appState.readyPosts.filter(p => p.status === 'approved');
    }
    
    if (filtered.length === 0) {
      readyGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">📁</div>
          <h4 class="empty-title">Nenhum post pronto encontrado</h4>
          <p class="empty-desc">Aprove posts na fila para enviá-los a esta seção.</p>
        </div>
      `;
      return;
    }
    
    filtered.forEach(post => {
      const card = document.createElement('div');
      card.className = 'glass-panel app-card';
      
      const badgeText = post.status === 'posted' ? '✓ POSTADO' : '📂 PRONTO';
      const badgeStyle = post.status === 'posted' 
        ? 'background: rgba(70,229,183,0.15); color: var(--color-approved); border: 1px solid rgba(70,229,183,0.2);'
        : 'background: rgba(255,255,255,0.05); color: var(--text-primary); border: 1px solid rgba(255,255,255,0.08);';

      card.innerHTML = `
        <div class="card-header-app">
          <span class="card-source-tag">${post.source}</span>
          <span class="card-score-badge" style="${badgeStyle}">${badgeText}</span>
        </div>
        <div class="card-media-app" style="background-image: url('${post.image}')"></div>
        <div class="card-body-app">
          <h4 class="card-title-app">${post.title}</h4>
          <p class="card-caption-app">${post.caption.replace(/\n/g, '<br>')}</p>
          <div class="card-actions-app" style="flex-wrap: wrap;">
            <button class="post-action-btn-ready btn-copy-caption" data-id="${post.id}">📄 Copiar Legenda</button>
            <button class="post-action-btn-ready btn-download-art" data-id="${post.id}">📥 Baixar Arte</button>
            ${post.status === 'approved' 
              ? `<button class="post-action-btn-ready btn-mark-posted" style="border-color:rgba(70,229,183,0.25);" data-id="${post.id}">✓ Marcar Postado</button>` 
              : ''
            }
          </div>
        </div>
      `;
      
      // Wire Copy Caption
      card.querySelector('.btn-copy-caption').addEventListener('click', (e) => {
        navigator.clipboard.writeText(post.caption).then(() => {
          showToast("Legenda copiada para o clipboard!");
          e.target.classList.add('copied');
          e.target.innerHTML = `✓ Copiado!`;
          setTimeout(() => {
            e.target.classList.remove('copied');
            e.target.innerHTML = `📄 Copiar Legenda`;
          }, 2000);
        });
      });
      
      // Wire Download Art (Simulated)
      card.querySelector('.btn-download-art').addEventListener('click', () => {
        showToast("Iniciando download da imagem em PNG... (Simulado)");
        const link = document.createElement('a');
        link.href = post.image;
        link.download = `postpilot_${post.id}.jpg`;
        document.body.appendChild(link);
        showToast("Arte baixada com sucesso!");
        document.body.removeChild(link);
      });

      // Wire Mark as Posted
      const btnMark = card.querySelector('.btn-mark-posted');
      if (btnMark) {
        btnMark.addEventListener('click', () => {
          post.status = 'posted';
          showToast("Post marcado como publicado!");
          renderReady();
        });
      }
      
      readyGrid.appendChild(card);
    });
  }

  // 3. Render Settings
  const feedList = document.getElementById('rss-feed-list');
  const feedForm = document.getElementById('feed-add-form');
  const telegramToggle = document.getElementById('tg-toggle');
  const tgTokenWrap = document.getElementById('tg-token-wrap');
  const tgChatWrap = document.getElementById('tg-chat-wrap');
  const tgTokenInput = document.getElementById('tg-token');
  const tgChatInput = document.getElementById('tg-chat-id');
  const imagePrefCheckbox = document.getElementById('pref-image-real');

  function renderSettings() {
    if (!feedList) return;
    
    feedList.innerHTML = '';
    appState.rssFeeds.forEach(feed => {
      const li = document.createElement('div');
      li.className = 'feed-item';
      li.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:2px;">
          <strong style="font-size:0.85rem; color:var(--text-primary);">${feed.name}</strong>
          <span style="font-size:0.7rem; color:var(--text-muted);">${feed.url}</span>
        </div>
        <button class="btn-remove-feed" data-id="${feed.id}">✕</button>
      `;
      
      li.querySelector('.btn-remove-feed').addEventListener('click', () => {
        appState.rssFeeds = appState.rssFeeds.filter(f => f.id !== feed.id);
        showToast("Fonte RSS removida.");
        renderSettings();
      });
      
      feedList.appendChild(li);
    });

    // Wire feed additions
    if (feedForm) {
      feedForm.onsubmit = (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('feed-name-new');
        const urlInput = document.getElementById('feed-url-new');
        
        if (nameInput.value && urlInput.value) {
          appState.rssFeeds.push({
            id: Date.now(),
            name: nameInput.value,
            url: urlInput.value,
            active: true
          });
          nameInput.value = '';
          urlInput.value = '';
          showToast("✓ Feed adicionado!");
          renderSettings();
        }
      };
    }

    // Toggle Telegram Settings
    if (telegramToggle) {
      telegramToggle.checked = appState.telegramConnected;
      tgTokenWrap.style.display = appState.telegramConnected ? 'block' : 'none';
      tgChatWrap.style.display = appState.telegramConnected ? 'block' : 'none';
      
      telegramToggle.onchange = () => {
        appState.telegramConnected = telegramToggle.checked;
        tgTokenWrap.style.display = telegramToggle.checked ? 'block' : 'none';
        tgChatWrap.style.display = telegramToggle.checked ? 'block' : 'none';
        
        if (telegramToggle.checked) {
          showToast("Conectando bot do Telegram...");
        } else {
          showToast("Notificações via Telegram desativadas.");
        }
      };
    }

    // Color/Brand Preferences
    if (imagePrefCheckbox) {
      imagePrefCheckbox.checked = appState.preferenceRealPhotos;
      imagePrefCheckbox.onchange = () => {
        appState.preferenceRealPhotos = imagePrefCheckbox.checked;
        showToast(imagePrefCheckbox.checked ? "Preferência: Fotos Reais (Unsplash/Pexels)" : "Preferência: Artes com Fallback IA");
      };
    }
  }

  // --- Approve / Discard Handlers ---
  function approvePost(id) {
    const postIdx = appState.draftPosts.findIndex(p => p.id === id);
    if (postIdx > -1) {
      const post = appState.draftPosts[postIdx];
      appState.draftPosts.splice(postIdx, 1);
      
      // Move to Ready list
      appState.readyPosts.unshift({
        id: post.id,
        title: post.title,
        source: post.source,
        score: post.score,
        image: post.image,
        caption: post.caption,
        status: "approved"
      });
      
      showToast("✓ Post Aprovado! Enviado para 'Prontos'.");
      
      if (appState.telegramConnected) {
        showToast("✈️ Notificação enviada para o Telegram!");
      }
      
      renderFila();
    }
  }

  function discardPost(id) {
    const postIdx = appState.draftPosts.findIndex(p => p.id === id);
    if (postIdx > -1) {
      appState.draftPosts.splice(postIdx, 1);
      showToast("✕ Post descartado.");
      renderFila();
    }
  }

  // --- Edit Drawer Modal ---
  const drawerOverlay = document.getElementById('drawer-overlay');
  const drawer = document.getElementById('edit-drawer');
  const editCaptionArea = document.getElementById('edit-caption');
  const editImagePreview = document.getElementById('edit-image-preview');
  const btnSaveEdit = document.getElementById('btn-save-edit');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  
  let currentlyEditingPostId = null;

  function openEditDrawer(id) {
    const post = appState.draftPosts.find(p => p.id === id);
    if (post) {
      currentlyEditingPostId = id;
      editCaptionArea.value = post.caption;
      editImagePreview.style.backgroundImage = `url('${post.image}')`;
      
      drawerOverlay.classList.add('active');
      drawer.classList.add('active');
    }
  }

  function closeDrawer() {
    drawerOverlay.classList.remove('active');
    drawer.classList.remove('active');
    currentlyEditingPostId = null;
  }

  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener('click', closeDrawer);
  }
  if (drawerOverlay) {
    drawerOverlay.addEventListener('click', closeDrawer);
  }

  if (btnSaveEdit) {
    btnSaveEdit.addEventListener('click', () => {
      if (currentlyEditingPostId) {
        const post = appState.draftPosts.find(p => p.id === currentlyEditingPostId);
        if (post) {
          post.caption = editCaptionArea.value;
          showToast("Alterações salvas com sucesso!");
          closeDrawer();
          renderFila();
        }
      }
    });
  }

  // Switch image generation simulation
  const btnRegenImage = document.getElementById('btn-regen-image');
  if (btnRegenImage) {
    btnRegenImage.addEventListener('click', () => {
      if (currentlyEditingPostId) {
        const post = appState.draftPosts.find(p => p.id === currentlyEditingPostId);
        if (post) {
          btnRegenImage.textContent = "Buscando...";
          const randomUrls = [
            "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=500&auto=format&fit=crop&q=80",
            "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=500&auto=format&fit=crop&q=80",
            "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=80",
            "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=500&auto=format&fit=crop&q=80"
          ];
          const newImg = randomUrls[Math.floor(Math.random() * randomUrls.length)];
          
          setTimeout(() => {
            post.image = newImg;
            editImagePreview.style.backgroundImage = `url('${newImg}')`;
            btnRegenImage.textContent = "🔄 Alternar Imagem";
            showToast("Imagem alternada!");
          }, 1000);
        }
      }
    });
  }

  // --- Mobile Sidebar Toggle ---
  const mobileToggle = document.getElementById('mobile-toggle');
  const sidebar = document.getElementById('app-sidebar');
  
  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    });
    
    document.addEventListener('click', (e) => {
      if (!sidebar.contains(e.target) && e.target !== mobileToggle) {
        sidebar.classList.remove('open');
      }
    });
  }

  // --- Toast Notification Helper ---
  function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  // --- Boot Dashboard ---
  if (appState.isLoggedIn) {
    authContainer.style.display = 'none';
    appContainer.style.display = 'flex';
    renderApp();
  }
});
