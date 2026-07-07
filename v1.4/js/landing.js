/* ============================================================
   PostPilot AI v1.4 — Landing Page Motion Script
   ============================================================ */

(function () {
  'use strict';

  /* --------------------------------------------------------
     BENTO MENU TOGGLE
     -------------------------------------------------------- */
  const bentoBtn = document.querySelector('.bento-btn');
  const bentoOverlay = document.querySelector('.bento-overlay');

  if (bentoBtn && bentoOverlay) {
    bentoBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      bentoOverlay.classList.toggle('open');
    });

    document.addEventListener('click', function (e) {
      if (!bentoOverlay.contains(e.target) && !bentoBtn.contains(e.target)) {
        bentoOverlay.classList.remove('open');
      }
    });
  }

  /* --------------------------------------------------------
     3D HOVER TILT — RECURSO CARDS
     -------------------------------------------------------- */
  const recursoCards = document.querySelectorAll('.recurso-card');

  recursoCards.forEach(function (card) {
    card.addEventListener('mousemove', function (e) {
      const rect = card.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = (e.clientX - centerX) / (rect.width / 2);
      const deltaY = (e.clientY - centerY) / (rect.height / 2);

      card.style.transform =
        'rotateY(' + (deltaX * 8) + 'deg) rotateX(' + (-deltaY * 8) + 'deg)';
    });

    card.addEventListener('mouseleave', function () {
      card.style.transform = 'rotateY(0deg) rotateX(0deg)';
    });
  });

  /* --------------------------------------------------------
     GSAP SCROLLTRIGGER SETUP
     -------------------------------------------------------- */
  gsap.registerPlugin(ScrollTrigger);

  const phoneWrap = document.querySelector('.phone-3d-wrap');
  const phoneIdleContainer = document.querySelector('.phone-3d-idle-container');
  const textBlocks = document.querySelectorAll('.scrolly-text-block');
  const screenLayers = document.querySelectorAll('.screen-layer');
  const scrollyForm = document.querySelector('.scrolly-form-wrap');
  const progressDots = document.querySelectorAll('.progress-dot');
  const progressBar = document.querySelector('.scroll-progress-bar');
  const circle = document.querySelector('.progress-ring .ring-fill');
  const lightSweep = document.querySelector('.screen-light-sweep');
  const lightRingSweep = document.querySelector('.light-ring-sweep');

  // Float elements
  const floatRss = document.querySelector('.float-rss-card');
  const floatOrb = document.querySelector('.float-orb-mini');
  const floatAirplane = document.querySelector('.float-airplane');
  const floatIgCard = document.querySelector('.float-instagram-card');
  const floatSeal = document.querySelector('.float-seal');
  const floatIgGlyph = document.querySelector('.float-instagram-glyph');
  const floatAiAvatar = document.querySelector('.float-ai-avatar-card');
  const avatarCross = document.querySelector('.avatar-cross');
  const floatRealMosaic = document.querySelector('.float-real-mosaic-card');

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --------------------------------------------------------
     PROGRESS RING SETUP
     -------------------------------------------------------- */
  let circumference = 0;
  if (circle) {
    const radius = circle.getAttribute('r');
    circumference = 2 * Math.PI * parseFloat(radius);
    circle.style.strokeDasharray = circumference;
    circle.style.strokeDashoffset = circumference;
  }

  /* --------------------------------------------------------
     IDLE BREATHING ANIMATION
     -------------------------------------------------------- */
  if (!prefersReducedMotion && phoneIdleContainer) {
    gsap.to(phoneIdleContainer, {
      y: '+=12',
      rotationZ: '+=0.6',
      rotationX: '-=0.8',
      duration: 3.5,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1
    });
  }

  if (!prefersReducedMotion && floatOrb) {
    gsap.to(floatOrb, {
      y: '-=15',
      duration: 3,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1
    });
  }

  /* --------------------------------------------------------
     HELPER: ACTIVATE SCREEN LAYER
     -------------------------------------------------------- */
  function activateScreen(index) {
    screenLayers.forEach(function (layer, i) {
      layer.classList.toggle('active', i === index);
    });
  }

  /* --------------------------------------------------------
     HELPER: LIGHT RING SWEEP (NEW v1.4)
     -------------------------------------------------------- */
  function fireLightRingSweep() {
    if (!lightRingSweep) return;
    lightRingSweep.classList.add('active');
    setTimeout(function () {
      lightRingSweep.classList.remove('active');
    }, 600);
  }

  /* --------------------------------------------------------
     HELPER: LIKE PARTICLES SPAWNER
     -------------------------------------------------------- */
  function spawnLikeParticles() {
    var container = document.querySelector('.scrolly-visual-container');
    if (!container) return;

    var emojis = ['❤️', '⚡', '❤️', '🔥', '❤️'];
    for (var i = 0; i < 5; i++) {
      var particle = document.createElement('div');
      particle.className = 'like-particle';
      particle.textContent = emojis[i];
      particle.style.left = (40 + Math.random() * 60) + '%';
      particle.style.top = '60%';
      container.appendChild(particle);

      gsap.to(particle, {
        y: -(80 + Math.random() * 120),
        x: (Math.random() - 0.5) * 100,
        opacity: 1,
        duration: 0.4,
        ease: 'power2.out',
        onComplete: function () {
          gsap.to(particle, {
            y: '-=40',
            opacity: 0,
            duration: 0.6,
            ease: 'power1.in',
            onComplete: function () {
              if (particle.parentNode) particle.parentNode.removeChild(particle);
            }
          });
        }
      });
    }
  }

  /* --------------------------------------------------------
     HELPER: TOAST
     -------------------------------------------------------- */
  function showToast(message) {
    var toast = document.querySelector('.toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(function () {
      toast.classList.remove('show');
    }, 2400);
  }

  /* --------------------------------------------------------
     MASTER TIMELINE (SCROLL-SCRUBBED)
     -------------------------------------------------------- */
  if (!prefersReducedMotion && phoneWrap) {
    // Initial state
    gsap.set(phoneWrap, {
      x: 250,
      y: -250,
      rotateY: -80,
      rotateX: 35,
      scale: 0.6,
      opacity: 0
    });

    gsap.set(textBlocks, { opacity: 0, y: 30 });
    activateScreen(0);

    var masterTL = gsap.timeline({
      scrollTrigger: {
        trigger: '.hero-scrollytelling',
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1.2,
        onUpdate: function (self) {
          var progress = self.progress;

          // Progress bar
          if (progressBar) {
            progressBar.style.height = (progress * 100) + '%';
          }

          // Progress ring
          if (circle && circumference) {
            circle.style.strokeDashoffset = circumference - (progress * circumference);
          }

          // Active dot
          var dotIndex = Math.min(Math.floor(progress * 4), 3);
          progressDots.forEach(function (dot, i) {
            dot.classList.toggle('active', i <= dotIndex);
          });
        }
      }
    });

    /* ----- ATO 1 (0 → 1.0): Phone slides in ----- */
    masterTL
      // Phone enters diagonally
      .to(phoneWrap, {
        x: 0,
        y: 0,
        rotateY: -25,
        rotateX: 15,
        scale: 1,
        opacity: 1,
        duration: 0.8,
        ease: 'power2.out'
      }, 0)
      // Text 0 fades in
      .to(textBlocks[0], { opacity: 1, y: 0, duration: 0.4 }, 0.1)
      // Screen 0 active
      .call(function () { activateScreen(0); }, null, 0.1)
      // RSS card appears
      .to(floatRss, { opacity: 1, x: 0, y: 0, duration: 0.5 }, 0.3)
      // Orb appears
      .to(floatOrb, { opacity: 1, scale: 1, duration: 0.5 }, 0.4);

    /* ----- ATO 2 (1.0 → 2.0): News to post ----- */
    masterTL
      // Text 0 out
      .to(textBlocks[0], { opacity: 0, y: -20, duration: 0.3 }, 1.0)
      // Text 1 in
      .to(textBlocks[1], { opacity: 1, y: 0, duration: 0.4 }, 1.1)
      // Phone rotates
      .to(phoneWrap, { rotateY: 15, rotateX: -5, duration: 0.8 }, 1.0)
      // RSS card sucked into orb
      .to(floatRss, { x: 120, y: -60, scale: 0.3, opacity: 0, duration: 0.5 }, 1.1)
      // Paper airplane flies across
      .fromTo(floatAirplane, { opacity: 0, x: -200, y: 50, rotation: 0 }, {
        opacity: 1, x: 200, y: -100, rotation: 30, duration: 0.7, ease: 'power1.inOut'
      }, 1.2)
      .to(floatAirplane, { opacity: 0, x: 300, duration: 0.3 }, 1.7)
      // Like particles
      .call(spawnLikeParticles, null, 1.5)
      // Screen 0 → 1
      .call(function () { activateScreen(1); }, null, 1.3)
      // LIGHT RING SWEEP at 1.8
      .call(fireLightRingSweep, null, 1.8);

    /* ----- ATO 3 (2.0 → 3.0): Real photos ----- */
    masterTL
      // Text 1 out
      .to(textBlocks[1], { opacity: 0, y: -20, duration: 0.3 }, 2.0)
      // Text 2 in
      .to(textBlocks[2], { opacity: 1, y: 0, duration: 0.4 }, 2.1)
      // Phone rotates back
      .to(phoneWrap, { rotateY: -15, rotateX: 10, duration: 0.8 }, 2.0)
      // Orb fades
      .to(floatOrb, { opacity: 0, scale: 0.5, duration: 0.4 }, 2.0)
      // AI avatar enters
      .fromTo(floatAiAvatar, { opacity: 0, x: 60, scale: 0.7 }, {
        opacity: 1, x: 0, scale: 1, duration: 0.5
      }, 2.1)
      // Red cross strikes
      .to(avatarCross, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, 2.35)
      // Avatar fades
      .to(floatAiAvatar, { opacity: 0, scale: 0.6, duration: 0.4 }, 2.55)
      // Real mosaic enters
      .fromTo(floatRealMosaic, { opacity: 0, y: 40, scale: 0.8 }, {
        opacity: 1, y: 0, scale: 1, duration: 0.5
      }, 2.5)
      // Mosaic merges into phone screen area
      .to(floatRealMosaic, { x: -60, y: -20, scale: 0.6, opacity: 0, duration: 0.4 }, 2.8)
      // Screen 1 → 2
      .call(function () { activateScreen(2); }, null, 2.3)
      // LIGHT RING SWEEP at 2.8
      .call(fireLightRingSweep, null, 2.8);

    /* ----- ATO 4 (3.0 → 4.0): Approval ----- */
    masterTL
      // Text 2 out
      .to(textBlocks[2], { opacity: 0, y: -20, duration: 0.3 }, 3.0)
      // Text 3 in
      .to(textBlocks[3], { opacity: 1, y: 0, duration: 0.4 }, 3.1)
      // Phone slides left, scales up, flat
      .to(phoneWrap, { x: -80, scale: 1.05, rotateY: 0, rotateX: 0, duration: 0.8 }, 3.0)
      // Screen 2 → 3
      .call(function () { activateScreen(3); }, null, 3.2)
      // Form slides in
      .to(scrollyForm, { opacity: 1, x: 0, duration: 0.5 }, 3.3)
      .call(function () {
        if (scrollyForm) scrollyForm.classList.add('active');
      }, null, 3.3)
      // Seal appears
      .to(floatSeal, { opacity: 1, scale: 1, duration: 0.4 }, 3.4)
      // IG glyph appears
      .to(floatIgGlyph, { opacity: 1, scale: 1, duration: 0.4 }, 3.5);

    /* ----- SOLTURA (4.0 → 4.5): Release ----- */
    masterTL
      // Screen light sweep
      .to(lightSweep, { x: '300%', duration: 0.5, ease: 'power2.inOut' }, 4.0)
      // Phone returns to center isometric
      .to(phoneWrap, { x: 0, scale: 1, rotateY: -20, rotateX: 12, duration: 0.5 }, 4.0)
      // Form/seal/glyph fade out
      .to(scrollyForm, { opacity: 0, x: 60, duration: 0.4 }, 4.0)
      .call(function () {
        if (scrollyForm) scrollyForm.classList.remove('active');
      }, null, 4.0)
      .to(floatSeal, { opacity: 0, scale: 0.5, duration: 0.3 }, 4.0)
      .to(floatIgGlyph, { opacity: 0, scale: 0.5, duration: 0.3 }, 4.0)
      // Text 3 out
      .to(textBlocks[3], { opacity: 0, y: -20, duration: 0.3 }, 4.2);
  }

  /* --------------------------------------------------------
     SCROLL DOTS CLICK HANDLERS
     -------------------------------------------------------- */
  progressDots.forEach(function (dot, i) {
    dot.addEventListener('click', function () {
      var heroEl = document.querySelector('.hero-scrollytelling');
      if (!heroEl) return;
      var heroRect = heroEl.getBoundingClientRect();
      var heroHeight = heroRect.height;
      var heroTop = window.scrollY + heroRect.top;
      var targetScroll = heroTop + (heroHeight * (i / 4));
      window.scrollTo({ top: targetScroll, behavior: 'smooth' });
    });
  });

  /* --------------------------------------------------------
     POST-HERO SCROLL-REVEAL ANIMATIONS (NEW v1.4)
     -------------------------------------------------------- */
  var revealElements = document.querySelectorAll('.scroll-reveal');

  if (revealElements.length > 0) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  /* --------------------------------------------------------
     ANIMATED COUNTER (NEW v1.4)
     -------------------------------------------------------- */
  var counterElements = document.querySelectorAll('.counter-animate');

  if (counterElements.length > 0) {
    var counterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.5
    });

    counterElements.forEach(function (el) {
      counterObserver.observe(el);
    });
  }

  function animateCounter(el) {
    var target = parseInt(el.getAttribute('data-target'), 10) || 0;
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    var duration = 2000;
    var startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var elapsed = timestamp - startTime;
      var progress = Math.min(elapsed / duration, 1);
      // Ease out quad
      var eased = 1 - (1 - progress) * (1 - progress);
      var current = Math.floor(eased * target);

      el.textContent = prefix + formatNumber(current) + suffix;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = prefix + formatNumber(target) + suffix;
      }
    }

    requestAnimationFrame(step);
  }

  function formatNumber(num) {
    return num.toLocaleString('pt-BR');
  }

  /* --------------------------------------------------------
     STAGGERED PRICING CARD ENTRANCE (NEW v1.4)
     -------------------------------------------------------- */
  var priceCards = document.querySelectorAll('.price-card');

  if (priceCards.length > 0) {
    var priceObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var cards = document.querySelectorAll('.price-card');
          cards.forEach(function (card, index) {
            setTimeout(function () {
              card.classList.add('visible');
            }, index * 150);
          });
          priceObserver.disconnect();
        }
      });
    }, {
      threshold: 0.2
    });

    priceObserver.observe(priceCards[0]);
  }

  /* --------------------------------------------------------
     MINI PHONE ANCHOR (NEW v1.4)
     -------------------------------------------------------- */
  var miniPhoneAnchor = document.querySelector('.mini-phone-anchor');
  var heroSection = document.querySelector('.hero-scrollytelling');

  if (miniPhoneAnchor && heroSection && !prefersReducedMotion) {
    ScrollTrigger.create({
      trigger: heroSection,
      start: 'bottom top',
      onEnter: function () {
        miniPhoneAnchor.classList.add('visible');
      },
      onLeaveBack: function () {
        miniPhoneAnchor.classList.remove('visible');
      }
    });
  }

  /* --------------------------------------------------------
     INTERACTIVE SHOWCASE
     -------------------------------------------------------- */
  var showcasePosts = [
    {
      title: 'Revolução Fintech no Brasil',
      score: '94',
      image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=400&fit=crop',
      caption: '💡 O mercado fintech brasileiro ultrapassou 1.500 startups ativas. A digitalização dos serviços financeiros não é mais tendência — é realidade.\n\n#Fintech #Inovação #Brasil',
      source: 'Reuters via RSS'
    },
    {
      title: 'Tendências de Moda Sustentável',
      score: '87',
      image: 'https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400&h=400&fit=crop',
      caption: '🌿 Moda sustentável cresce 42% em buscas no último trimestre. Marcas que investem em ESG estão liderando o engajamento digital.\n\n#ModaSustentável #ESG #Tendências',
      source: 'Vogue Business via RSS'
    },
    {
      title: 'IA Generativa na Saúde',
      score: '91',
      image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=400&fit=crop',
      caption: '🏥 Hospitais brasileiros já utilizam IA generativa para triagem e diagnóstico preliminar. O futuro da saúde digital é agora.\n\n#Saúde #IA #Tecnologia',
      source: 'MIT Tech Review via RSS'
    }
  ];

  var currentShowcaseIndex = 0;
  var showcaseMedia = document.querySelector('.showcase-media img');
  var showcaseCaption = document.querySelector('.showcase-caption-area');
  var showcaseTitle = document.querySelector('.showcase-nav .nav-title');
  var showcaseScore = document.querySelector('.showcase-nav .nav-score');
  var showcaseSource = document.querySelector('.showcase-source-tag');

  function updateShowcase(index) {
    var post = showcasePosts[index];
    if (!post) return;

    if (showcaseMedia) showcaseMedia.src = post.image;
    if (showcaseCaption) showcaseCaption.value = post.caption;
    if (showcaseTitle) showcaseTitle.textContent = post.title;
    if (showcaseScore) showcaseScore.textContent = '⚡ ' + post.score + '/100';
    if (showcaseSource) showcaseSource.textContent = post.source;
  }

  // Approve button
  var btnApprove = document.querySelector('.btn-approve');
  if (btnApprove) {
    btnApprove.addEventListener('click', function () {
      showToast('✅ Post aprovado e agendado para publicação!');
      currentShowcaseIndex = (currentShowcaseIndex + 1) % showcasePosts.length;
      setTimeout(function () { updateShowcase(currentShowcaseIndex); }, 600);
    });
  }

  // Edit button
  var btnEdit = document.querySelector('.btn-edit');
  if (btnEdit) {
    btnEdit.addEventListener('click', function () {
      showToast('✏️ Post enviado para edição.');
    });
  }

  // Discard button
  var btnDiscard = document.querySelector('.btn-discard');
  if (btnDiscard) {
    btnDiscard.addEventListener('click', function () {
      showToast('🗑️ Post descartado.');
      currentShowcaseIndex = (currentShowcaseIndex + 1) % showcasePosts.length;
      setTimeout(function () { updateShowcase(currentShowcaseIndex); }, 600);
    });
  }

  // Initialize showcase
  updateShowcase(0);

  /* --------------------------------------------------------
     REDUCED MOTION FALLBACK
     -------------------------------------------------------- */
  if (prefersReducedMotion && phoneWrap) {
    gsap.set(phoneWrap, { x: 0, y: 0, rotateY: -20, rotateX: 10, scale: 1, opacity: 1 });

    activateScreen(0);
    if (textBlocks[0]) gsap.set(textBlocks[0], { opacity: 1, y: 0 });

    // Simple phase-based toggling using scroll
    var heroEl = document.querySelector('.hero-scrollytelling');
    if (heroEl) {
      ScrollTrigger.create({
        trigger: heroEl,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: function (self) {
          var progress = self.progress;
          var phase = Math.floor(progress * 4);
          phase = Math.min(phase, 3);

          textBlocks.forEach(function (block, i) {
            gsap.set(block, { opacity: i === phase ? 1 : 0, y: 0 });
          });
          activateScreen(phase);
        }
      });
    }
  }
})();
