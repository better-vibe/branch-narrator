/**
 * Better Vibe Landing Page - Interactive Features
 * Award-winning interactions and animations
 */

(function () {
  'use strict';

  // ---------- Cursor Glow Effect ----------
  const cursorGlow = document.getElementById('cursorGlow');

  if (cursorGlow && window.matchMedia('(pointer: fine)').matches) {
    let mouseX = 0;
    let mouseY = 0;
    let glowX = 0;
    let glowY = 0;

    document.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    // Smooth follow animation
    function animateGlow() {
      const speed = 0.08;
      glowX += (mouseX - glowX) * speed;
      glowY += (mouseY - glowY) * speed;

      cursorGlow.style.left = `${glowX}px`;
      cursorGlow.style.top = `${glowY}px`;

      requestAnimationFrame(animateGlow);
    }

    animateGlow();
  }

  // ---------- Navigation Scroll Effect ----------
  const nav = document.getElementById('nav');
  let lastScrollY = 0;
  let ticking = false;

  function updateNav() {
    const scrollY = window.scrollY;

    if (scrollY > 50) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }

    lastScrollY = scrollY;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateNav);
      ticking = true;
    }
  });

  // ---------- Scroll Reveal Animations ----------
  const revealElements = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          // Optionally unobserve after revealing
          // revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px',
    }
  );

  revealElements.forEach((el) => revealObserver.observe(el));

  // ---------- Code Tabs ----------
  const codeTabs = document.querySelectorAll('.code-tab');
  const codePanels = document.querySelectorAll('.code-panel');

  codeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      // Update active tab
      codeTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active panel
      codePanels.forEach((panel) => {
        panel.classList.remove('active');
        if (panel.id === `panel-${targetTab}`) {
          panel.classList.add('active');
        }
      });
    });
  });

  // ---------- Copy to Clipboard ----------
  const copyButtons = document.querySelectorAll('.copy-btn');

  copyButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const textToCopy = btn.dataset.copy;

      try {
        await navigator.clipboard.writeText(textToCopy);

        // Visual feedback
        btn.classList.add('copied');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;

        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = originalHTML;
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    });
  });

  // ---------- Smooth Scroll for Anchor Links ----------
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');

      // Skip if it's just "#"
      if (href === '#') return;

      const target = document.querySelector(href);

      if (target) {
        e.preventDefault();

        const navHeight = nav.offsetHeight;
        const targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight - 20;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth',
        });
      }
    });
  });

  // ---------- Terminal Typing Effect ----------
  const terminalCommands = document.querySelectorAll('.terminal-command');

  const terminalObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const command = entry.target;
          const text = command.textContent;
          command.textContent = '';
          command.style.opacity = '1';

          let i = 0;
          const typeInterval = setInterval(() => {
            if (i < text.length) {
              command.textContent += text[i];
              i++;
            } else {
              clearInterval(typeInterval);
            }
          }, 50);

          terminalObserver.unobserve(command);
        }
      });
    },
    { threshold: 0.5 }
  );

  terminalCommands.forEach((cmd) => {
    const originalText = cmd.textContent;
    cmd.dataset.text = originalText;
    terminalObserver.observe(cmd);
  });

  // ---------- Parallax Effect for Hero ----------
  const heroGradient = document.querySelector('.hero-gradient');

  if (heroGradient && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      const heroHeight = document.querySelector('.hero').offsetHeight;

      if (scrollY < heroHeight) {
        const parallaxValue = scrollY * 0.3;
        heroGradient.style.transform = `translateX(-50%) translateY(${parallaxValue}px)`;
      }
    });
  }

  // ---------- Get Started CTA Click ----------
  const ctaButton = document.querySelector('.nav-cta');

  if (ctaButton) {
    ctaButton.addEventListener('click', () => {
      const productsSection = document.getElementById('products');

      if (productsSection) {
        const navHeight = nav.offsetHeight;
        const targetPosition = productsSection.getBoundingClientRect().top + window.scrollY - navHeight - 20;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth',
        });
      }
    });
  }

  // ---------- Preload Animations ----------
  // Remove loading state after page is fully loaded
  window.addEventListener('load', () => {
    document.body.classList.add('loaded');

    // Trigger initial reveals for elements in viewport
    setTimeout(() => {
      revealElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight) {
          el.classList.add('visible');
        }
      });
    }, 100);
  });

  // ---------- Easter Egg: Konami Code ----------
  const konamiCode = [
    'ArrowUp',
    'ArrowUp',
    'ArrowDown',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowLeft',
    'ArrowRight',
    'b',
    'a',
  ];
  let konamiIndex = 0;

  document.addEventListener('keydown', (e) => {
    if (e.key === konamiCode[konamiIndex]) {
      konamiIndex++;

      if (konamiIndex === konamiCode.length) {
        // Easter egg activated!
        document.body.style.setProperty('--color-accent', '#10b981');
        document.body.style.setProperty('--color-accent-light', '#34d399');
        document.body.style.setProperty('--gradient-primary', 'linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #8b5cf6 100%)');

        console.log('%c Better Vibes Activated! ', 'background: #10b981; color: white; font-size: 16px; padding: 10px;');

        konamiIndex = 0;
      }
    } else {
      konamiIndex = 0;
    }
  });

  // ---------- Performance: Pause animations when tab is not visible ----------
  document.addEventListener('visibilitychange', () => {
    const marquee = document.querySelector('.marquee-track');

    if (marquee) {
      if (document.hidden) {
        marquee.style.animationPlayState = 'paused';
      } else {
        marquee.style.animationPlayState = 'running';
      }
    }
  });
})();
