/**
 * Better Vibe Landing Page - Interactive Features
 * Clean, minimal dark theme
 */

(function () {
  'use strict';

  // ---------- ASCII Background Generator ----------
  const asciiBg = document.getElementById('asciiBg');

  if (asciiBg) {
    const chars = '01';
    const cols = Math.floor(window.innerWidth / 10);
    const rows = Math.floor(window.innerHeight / 12);

    let asciiContent = '';
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        // Sparse pattern - mostly spaces
        if (Math.random() > 0.92) {
          asciiContent += chars[Math.floor(Math.random() * chars.length)];
        } else {
          asciiContent += ' ';
        }
      }
      asciiContent += '\n';
    }
    asciiBg.textContent = asciiContent;
  }

  // ---------- Navigation Scroll Effect ----------
  const nav = document.getElementById('nav');
  let ticking = false;

  function updateNav() {
    const scrollY = window.scrollY;

    if (scrollY > 50) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }

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
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -30px 0px',
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
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

  // ---------- Initial Reveal ----------
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
