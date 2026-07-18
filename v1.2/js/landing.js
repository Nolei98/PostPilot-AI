/* ==========================================================================
   PostPilot AI v1.2 - Landing Page Motion Scrollytelling Logic (GSAP)
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

  // --- GSAP Scrollytelling Setup ---
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    
    // Register ScrollTrigger plugin
    gsap.registerPlugin(ScrollTrigger);

    // Elements
    const phoneWrap = document.querySelector('.phone-3d-wrap');
    const phoneIdleContainer = document.querySelector('.phone-3d-idle-container');
    const textBlocks = gsap.utils.toArray('.scrolly-text-block');
    const screenLayers = gsap.utils.toArray('.screen-layer');
    const scrollyForm = document.querySelector('.scrolly-form-wrap');
    const progressDots = document.querySelectorAll('.scroll-progress-dot');
    const progressBar = document.querySelector('.scroll-progress-bar');
    const circle = document.querySelector('.progress-ring__circle');
    
    // Props
    const floatRss = document.querySelector('.float-rss-card');
    const floatOrb = document.querySelector('.float-orb-mini');
    const floatIg = document.querySelector('.float-instagram-card');
    const floatSeal = document.querySelector('.float-seal');
    const floatIgGlyph = document.querySelector('.float-instagram-glyph');
    
    // Beat 3 Props
    const floatAiAvatar = document.querySelector('.float-ai-avatar-card');
    const avatarCross = document.querySelector('.avatar-cross');
    const floatRealMosaic = document.querySelector('.float-real-mosaic-card');
    
    // Screen Sweeper
    const lightSweep = document.querySelector('.screen-light-sweep');

    // Check if the user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Set up radial progress ring
    let circumference = 0;
    if (circle) {
      const radius = circle.r.baseVal.value;
      circumference = radius * 2 * Math.PI;
      circle.style.strokeDasharray = `${circumference} ${circumference}`;
      circle.style.strokeDashoffset = circumference;
    }

    // --- CONTINUOUS IDLE FLOATING (Breathing) ---
    // Floating animation loop runs continuously to give organic hover feel
    if (!prefersReducedMotion && phoneIdleContainer) {
      gsap.to(phoneIdleContainer, {
        y: "+=12",
        rotationZ: "+=0.6",
        rotationX: "-=0.8",
        duration: 3.5,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1
      });
      
      // Floating orbe breathing
      gsap.to(floatOrb, {
        y: "-=15",
        duration: 3,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1
      });
    }

    if (!prefersReducedMotion) {
      
      // Initialize states of props
      gsap.set(phoneWrap, { x: 250, y: -250, rotateY: -80, rotateX: 35, scale: 0.6, opacity: 0 });
      gsap.set(avatarCross, { opacity: 0, scale: 0.2 });

      // Create Master Timeline scrubbed by scroll
      const masterTimeline = gsap.timeline({
        scrollTrigger: {
          trigger: '.hero-scrollytelling',
          start: 'top top',
          end: 'bottom bottom',
          scrub: 1.2, // Smooth scrubbing
          onUpdate: (self) => {
            // Update indicator height
            const progress = self.progress * 100;
            if (progressBar) progressBar.style.height = `${progress}%`;
            
            // Map circular progress loader
            if (circle) {
              const offset = circumference - (self.progress * circumference);
              circle.style.strokeDashoffset = offset;
            }

            // Dot navigation highlighting
            let activeIdx = 0;
            if (progress >= 22 && progress < 48) activeIdx = 1;
            else if (progress >= 48 && progress < 75) activeIdx = 2;
            else if (progress >= 75) activeIdx = 3;
            
            progressDots.forEach((dot, idx) => {
              if (idx === activeIdx) dot.classList.add('active');
              else dot.classList.remove('active');
            });
          }
        }
      });

      // --- MOTION SCRIPT (Beat a Beat) ---
      
      // BEAT 1: Diagonal Entrance (0.0 to 1.0)
      masterTimeline
        .to(phoneWrap, { 
          x: 0, y: 0, rotateY: -20, rotateX: 12, scale: 1, opacity: 1, duration: 1.0 
        }, 0)
        .to(textBlocks[0], { opacity: 1, y: 0, duration: 0.4 }, 0.4)
        .to(floatRss, { opacity: 1, x: 20, rotate: 5, duration: 0.5 }, 0.3)
        .to(floatOrb, { opacity: 1, scale: 1, duration: 0.5 }, 0.4)
        
        // BEAT 2: Generation & Sucking Card into Orb (1.0 to 2.0)
        // Transition texts
        .to(textBlocks[0], { opacity: 0, y: -20, duration: 0.3 }, 0.9)
        .to(textBlocks[1], { opacity: 1, y: 0, duration: 0.4 }, 1.2)
        
        // Rotate phone slightly
        .to(phoneWrap, { rotateY: 20, rotateX: 8, duration: 1.0 }, 1.0)
        
        // Suck RSS Card into Orb
        .to(floatRss, { 
          x: 220, y: 50, scale: 0.1, opacity: 0, duration: 0.7, ease: "power2.in" 
        }, 1.0)
        
        // Create flying particles simulating engagement (curtidas/like tags flying up)
        .call(() => {
          // Trigger particles in preview (simulate likes floating)
          spawnLikeParticles();
        }, null, 1.2)
        
        // Transition Screen 1 -> Screen 2 (loader)
        .to(screenLayers[0], { opacity: 0, duration: 0.3 }, 1.1)
        .to(screenLayers[1], { opacity: 1, duration: 0.4 }, 1.3)
        
        // BEAT 3: Photos Real vs AI (2.0 to 3.0)
        .to(textBlocks[1], { opacity: 0, y: -20, duration: 0.3 }, 1.9)
        .to(textBlocks[2], { opacity: 1, y: 0, duration: 0.4 }, 2.2)
        
        // Rotate phone back isometric
        .to(phoneWrap, { rotateY: -35, rotateX: 18, duration: 1.0 }, 2.0)
        
        // Fade out Orb Mini
        .to(floatOrb, { opacity: 0, scale: 0.5, duration: 0.4 }, 2.0)
        
        // Slide in AI generated avatar card
        .to(floatAiAvatar, { opacity: 1, x: -30, duration: 0.5 }, 2.0)
        
        // Red cross strikes over AI avatar
        .to(avatarCross, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, 2.4)
        
        // Slide out/fade AI card
        .to(floatAiAvatar, { opacity: 0, scale: 0.8, y: 30, duration: 0.4 }, 2.8)
        
        // Slide in real photos mosaic card, touch screen, then fade into screen
        .to(floatRealMosaic, { opacity: 1, x: -40, duration: 0.4 }, 2.6)
        .to(floatRealMosaic, { 
          x: -120, y: 80, scale: 0.65, opacity: 0, duration: 0.5, ease: "power1.inOut" 
        }, 3.0)
        
        // Transition Screen 2 -> Screen 3 (Real Photos grid)
        .to(screenLayers[1], { opacity: 0, duration: 0.3 }, 2.3)
        .to(screenLayers[2], { opacity: 1, duration: 0.4 }, 2.7)
        
        // BEAT 4: Approval & Form Slide in (3.0 to 4.0)
        .to(textBlocks[2], { opacity: 0, y: -20, duration: 0.3 }, 2.9)
        .to(textBlocks[3], { opacity: 1, y: 0, duration: 0.4 }, 3.2)
        
        // Translate phone to left side and scale up face flat
        .to(phoneWrap, { 
          x: -240, rotateY: 0, rotateX: 0, scale: 1.22, duration: 1.0 
        }, 3.0)
        
        // Slide in Form card on the right
        .to(scrollyForm, { opacity: 1, x: 0, pointerEvents: 'auto', duration: 0.8 }, 3.2)
        
        // Transition Screen 3 -> Screen 4 (Approval layout ✓)
        .to(screenLayers[2], { opacity: 0, duration: 0.3 }, 3.1)
        .to(screenLayers[3], { opacity: 1, duration: 0.4 }, 3.4)
        
        // Float Approved Seal + Instagram glyph next to phone
        .to(floatSeal, { opacity: 1, scale: 1, rotate: -15, duration: 0.4 }, 3.5)
        .to(floatIgGlyph, { opacity: 1, scale: 1, rotate: 10, duration: 0.4 }, 3.6)
        
        // BEAT 5: Light Sweep Sweep and Reset (4.0 to 4.5)
        // Sweep shine light across screen
        .to(lightSweep, { left: '150%', duration: 0.8 }, 4.0)
        
        // Reset phone back to isometric center & fade out form
        .to(phoneWrap, { 
          x: 0, rotateY: -20, rotateX: 12, scale: 1, duration: 0.5 
        }, 4.2)
        .to(scrollyForm, { opacity: 0, x: 100, pointerEvents: 'none', duration: 0.4 }, 4.2)
        .to(floatSeal, { opacity: 0, scale: 0.5, duration: 0.3 }, 4.2)
        .to(floatIgGlyph, { opacity: 0, scale: 0.5, duration: 0.3 }, 4.2);

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

          textBlocks.forEach((tb, i) => {
            if (i === phase) {
              tb.style.opacity = '1';
              tb.style.pointerEvents = 'auto';
            } else {
              tb.style.opacity = '0';
              tb.style.pointerEvents = 'none';
            }
          });

          screenLayers.forEach((sl, i) => {
            if (i === phase) sl.classList.add('active');
            else sl.classList.remove('active');
          });

          if (phase === 3) {
            scrollyForm.classList.add('active');
            if (phoneWrap) phoneWrap.style.transform = 'translateX(-200px) scale(1.1)';
          } else {
            scrollyForm.classList.remove('active');
            if (phoneWrap) phoneWrap.style.transform = 'none';
          }
        }
      });
    }

    // Helper: spawn floating heart like particles during Beat 2
    function spawnLikeParticles() {
      const container = document.querySelector('.scrolly-visual-container');
      if (!container) return;
      
      for (let i = 0; i < 5; i++) {
        const particle = document.createElement('div');
        particle.className = 'like-particle';
        particle.textContent = Math.random() > 0.5 ? '❤️' : '⚡';
        
        // Random coords close to Orb Mini
        particle.style.top = '220px';
        particle.style.right = '40px';
        container.appendChild(particle);
        
        // Animate up and rotate
        gsap.to(particle, {
          y: -120 - Math.random() * 80,
          x: (Math.random() - 0.5) * 100,
          opacity: 1,
          scale: 1.5,
          duration: 1.5,
          ease: "power1.out",
          onComplete: () => {
            gsap.to(particle, {
              opacity: 0,
              duration: 0.3,
              onComplete: () => {
                container.removeChild(particle);
              }
            });
          }
        });
      }
    }

    // Scroll Dots Click handler
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

  updateShowcaseCard();
});
