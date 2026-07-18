/* ==========================================================================
   PostPilot AI v1.1 - Landing Page Scrollytelling Logic (GSAP)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  
  // --- Bento Menu Toggle ---
  const bentoBtn = document.getElementById('bento-btn');
  const bentoOverlay = document.getElementById('bento-overlay');

  if (bentoBtn && bentoOverlay) {
    bentoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      bentoOverlay.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!bentoOverlay.contains(e.target) && e.target !== bentoBtn) {
        bentoOverlay.classList.remove('open');
      }
    });
  }

  // --- GSAP Scrollytelling Timeline ---
  // Ensure GSAP is loaded before configuring ScrollTrigger
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    
    // Register ScrollTrigger plugin
    gsap.registerPlugin(ScrollTrigger);

    // Check if the user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Elements
    const phoneWrap = document.querySelector('.phone-3d-wrap');
    const textBlocks = gsap.utils.toArray('.scrolly-text-block');
    const screenLayers = gsap.utils.toArray('.screen-layer');
    const progressDots = document.querySelectorAll('.scroll-progress-dot');
    const progressBar = document.querySelector('.scroll-progress-bar');
    
    // Float items
    const floatRss = document.querySelector('.float-rss-card');
    const floatOrb = document.querySelector('.float-orb-mini');
    const floatIg = document.querySelector('.float-instagram-card');
    const floatSeal = document.querySelector('.float-seal');

    if (!prefersReducedMotion) {
      
      // 1. Create main timeline scrubbed by scroll
      const scrollyTimeline = gsap.timeline({
        scrollTrigger: {
          trigger: '.hero-scrollytelling',
          start: 'top top',
          end: 'bottom bottom',
          scrub: 1, // Smooth scrubbing
          onUpdate: (self) => {
            // Update custom right progress rail height
            const progress = self.progress * 100;
            if (progressBar) progressBar.style.height = `${progress}%`;
            
            // Map progress to active dots
            let activeIdx = 0;
            if (progress >= 25 && progress < 50) activeIdx = 1;
            else if (progress >= 50 && progress < 75) activeIdx = 2;
            else if (progress >= 75) activeIdx = 3;
            
            progressDots.forEach((dot, idx) => {
              if (idx === activeIdx) dot.classList.add('active');
              else dot.classList.remove('active');
            });
          }
        }
      });

      // 2. Define keyframes for Phone Rotation and Scaling
      scrollyTimeline
        // Phase 1: Default state (already set in CSS)
        // Phase 1 -> 2 (0% to 33% scroll timeline)
        .to(phoneWrap, { 
          rotateY: 25, 
          rotateX: 18, 
          scale: 1.05, 
          z: 30,
          duration: 1 
        }, 0)
        
        // Phase 2 -> 3 (33% to 66% scroll timeline)
        .to(phoneWrap, { 
          rotateY: -35, 
          rotateX: 22, 
          scale: 0.95, 
          z: -10,
          duration: 1 
        }, 1)
        
        // Phase 3 -> 4 (66% to 100% scroll timeline)
        .to(phoneWrap, { 
          rotateY: 0, 
          rotateX: 0, 
          scale: 1.15, 
          z: 80,
          duration: 1 
        }, 2);

      // 3. Screen UI Transitions (Cross-fading layers)
      scrollyTimeline
        // Screen 1 -> 2
        .to(screenLayers[0], { opacity: 0, duration: 0.3 }, 0.3)
        .to(screenLayers[1], { opacity: 1, duration: 0.4 }, 0.4)
        
        // Screen 2 -> 3
        .to(screenLayers[1], { opacity: 0, duration: 0.3 }, 1.3)
        .to(screenLayers[2], { opacity: 1, duration: 0.4 }, 1.4)
        
        // Screen 3 -> 4
        .to(screenLayers[2], { opacity: 0, duration: 0.3 }, 2.3)
        .to(screenLayers[3], { opacity: 1, duration: 0.4 }, 2.4);

      // 4. Text Blocks Fade Transitions
      scrollyTimeline
        // Text 1 -> 2
        .to(textBlocks[0], { opacity: 0, y: -20, duration: 0.3 }, 0.2)
        .to(textBlocks[1], { opacity: 1, y: 0, duration: 0.4 }, 0.4)
        
        // Text 2 -> 3
        .to(textBlocks[1], { opacity: 0, y: -20, duration: 0.3 }, 1.2)
        .to(textBlocks[2], { opacity: 1, y: 0, duration: 0.4 }, 1.4)
        
        // Text 3 -> 4
        .to(textBlocks[2], { opacity: 0, y: -20, duration: 0.3 }, 2.2)
        .to(textBlocks[3], { opacity: 1, y: 0, duration: 0.4 }, 2.4);

      // 5. Floating Auxiliary 3D Items Animations
      scrollyTimeline
        // RSS Node slides in during Phase 1, slides out/fades in Phase 2
        .to(floatRss, { opacity: 1, x: 20, rotate: 5, duration: 0.4 }, 0)
        .to(floatRss, { opacity: 0, x: -50, duration: 0.3 }, 0.8)
        
        // AI Orb floats in Phase 2, spins and fades in Phase 3
        .to(floatOrb, { opacity: 1, y: -30, duration: 0.4 }, 0.5)
        .to(floatOrb, { opacity: 0, y: 80, duration: 0.3 }, 1.5)
        
        // IG Mock Post Card enters in Phase 3, exits in Phase 4
        .to(floatIg, { opacity: 1, x: -30, rotate: -5, duration: 0.4 }, 1.3)
        .to(floatIg, { opacity: 0, x: 50, duration: 0.3 }, 2.3)
        
        // Approval seal stomps down in Phase 4
        .to(floatSeal, { opacity: 1, scale: 1, rotate: -15, duration: 0.4 }, 2.5);

    } else {
      // Reduced motion fallback: Simple step transitions without rotation scrubbing
      textBlocks[0].classList.add('active');
      screenLayers[0].classList.add('active');

      ScrollTrigger.create({
        trigger: '.hero-scrollytelling',
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          const progress = self.progress * 100;
          let phase = 0;
          if (progress >= 25 && progress < 50) phase = 1;
          else if (progress >= 50 && progress < 75) phase = 2;
          else if (progress >= 75) phase = 3;

          // Toggle simple visibility classes
          textBlocks.forEach((tb, i) => {
            if (i === phase) tb.classList.add('active');
            else tb.classList.remove('active');
          });

          screenLayers.forEach((sl, i) => {
            if (i === phase) sl.classList.add('active');
            else sl.classList.remove('active');
          });
        }
      });
    }

    // Scroll Dots Click handler to jump to scroll stages
    progressDots.forEach((dot, idx) => {
      dot.addEventListener('click', () => {
        const targetScroll = (idx / 3) * (document.querySelector('.hero-scrollytelling').offsetHeight - window.innerHeight);
        window.scrollTo({
          top: targetScroll,
          behavior: 'smooth'
        });
      });
    });
  }

  // --- Interactive Fila de Aprovação (Showcase Preview) ---
  const mockPosts = [
    {
      title: "Google AI supera humanos na medicina",
      score: "Score: 94% (Viral)",
      image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&auto=format&fit=crop&q=60",
      caption: "🚨 O JOGO MUDOU NA MEDICINA! A nova inteligência artificial do Google acaba de ultrapassar os médicos mais experientes do mundo em diagnósticos de precisão. O que antes demorava semanas agora é feito em 3 segundos. \n\nVocê confia o seu diagnóstico a uma IA ou prefere o método tradicional? Comente abaixo! 👇\n\n#medtech #inteligenciaartificial #googleai #futuro",
      source: "TechCrunch AI"
    },
    {
      title: "Anthropic lança Claude 4.5 Sonnet",
      score: "Score: 89% (Estável)",
      image: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=500&auto=format&fit=crop&q=60",
      caption: "💥 CLAUDE 4.5 ACABA DE SER LANÇADO! A Anthropic acaba de liberar a nova versão do seu modelo de linguagem e os primeiros testes mostram uma capacidade de raciocínio lógico que faz o GPT-4 parecer ultrapassado. \n\nO grande destaque é a velocidade de compilação de código e a redução de alucinações em 80%.\n\nPreparado para mudar de assistente? 🔥\n\n#claude #anthropic #desenvolvimento #llm #tech",
      source: "Hacker News"
    },
    {
      title: "Novo chip da Nvidia com refrigeração líquida",
      score: "Score: 92% (Viral)",
      image: "https://images.unsplash.com/photo-1591453089816-0fbb971b454c?w=500&auto=format&fit=crop&q=60",
      caption: "🖥️ MONSTRO DO PROCESSAMENTO! A Nvidia revelou sua nova arquitetura de chips Blackwell com refrigeração líquida integrada direto de fábrica. Eles prometem rodar modelos de IA com 25x menos energia.\n\nÉ o fim das fazendas de servidores derretendo com processamento de LLM.\n\nO futuro do hardware de IA chegou. ⚡\n\n#nvidia #blackwell #chips #hardware #ai",
      source: "The Verge"
    }
  ];

  let currentShowcaseIdx = 0;
  const showcaseTitle = document.getElementById('showcase-title');
  const showcaseScore = document.getElementById('showcase-score');
  const showcaseBadge = document.getElementById('showcase-badge');
  const showcaseMedia = document.getElementById('showcase-media');
  const showcaseCaption = document.getElementById('showcase-caption');

  const btnApprove = document.getElementById('showcase-approve');
  const btnEdit = document.getElementById('showcase-edit');
  const btnDiscard = document.getElementById('showcase-discard');

  function updateShowcaseCard() {
    const post = mockPosts[currentShowcaseIdx];
    if (showcaseTitle && post) {
      showcaseTitle.innerHTML = `<span class="orb-logo"></span> ${post.title}`;
      showcaseScore.textContent = post.score;
      showcaseBadge.textContent = post.source;
      showcaseMedia.style.backgroundImage = `url('${post.image}')`;
      showcaseCaption.value = post.caption;
    }
  }

  function nextShowcasePost() {
    currentShowcaseIdx = (currentShowcaseIdx + 1) % mockPosts.length;
    updateShowcaseCard();
  }

  if (btnApprove) {
    btnApprove.addEventListener('click', () => {
      showToast("✓ Post Aprovado! Adicionado à fila 'Prontos'.");
      nextShowcasePost();
    });
  }

  if (btnDiscard) {
    btnDiscard.addEventListener('click', () => {
      showToast("✕ Post Descartado com sucesso.");
      nextShowcasePost();
    });
  }

  if (btnEdit) {
    btnEdit.addEventListener('click', () => {
      showToast("✎ Modo de Edição Ativado! (Redirecionando...)");
      setTimeout(() => {
        window.location.href = 'app.html';
      }, 1000);
    });
  }

  // Toast Helper
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

  // Initialize Showcase card
  updateShowcaseCard();
});
