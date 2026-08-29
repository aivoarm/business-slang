/* ==========================================================================
   BizTalk - Progressive Learning & Mobile PWA App Controller
   ========================================================================== */

class BizTalkApp {
  constructor() {
    this.data = null;
    this.currentIndustry = 'procurement';
    this.searchQuery = '';

    // Local Storage Progress State
    this.savedTermIds = new Set(JSON.parse(localStorage.getItem('biztalk_saved_terms') || '[]'));
    this.theme = localStorage.getItem('biztalk_theme') || 'dark';
    this.userProgress = JSON.parse(localStorage.getItem('biztalk_user_progress') || '{}');
    this.userXP = parseInt(localStorage.getItem('biztalk_xp') || '0', 10);
    this.userStreak = parseInt(localStorage.getItem('biztalk_streak') || '1', 10);

    // Active Stage / Quiz State
    this.activeStage = null;
    this.quizQuestions = [];
    this.currentQuizIndex = 0;
    this.quizScore = 0;

    // Interview Trainer State
    this.trainerTerms = [];
    this.trainerIndex = 0;

    this.init();
  }

  async init() {
    this.applyTheme(this.theme);
    await this.loadData();
    this.registerServiceWorker();
    this.setupEventListeners();
    this.renderStageIndustryChips();
    this.renderStagesForIndustry(this.currentIndustry);
    this.renderDictionary();
    this.updateUserStatsDisplay();
    this.initQuiz();
    this.initTrainer();
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
          .then(reg => console.log('PWA ServiceWorker registered with scope:', reg.scope))
          .catch(err => console.log('ServiceWorker registration failed:', err));
      });
    }
  }

  async loadData() {
    try {
      const response = await fetch('./data/business_slang.json');
      this.data = await response.json();
      
      // Update Hero Stats
      document.getElementById('stat-terms-count').textContent = `${this.data.terms.length}+`;
      document.getElementById('stat-industries-count').textContent = this.data.industries.length;
    } catch (err) {
      console.error('Failed to load business slang data:', err);
    }
  }

  applyTheme(theme) {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('biztalk_theme', theme);
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
      themeBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
    }
  }

  toggleTheme() {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  updateUserStatsDisplay() {
    document.getElementById('stat-xp-count').textContent = `${this.userXP} XP`;
    document.getElementById('streak-val').textContent = this.userStreak;
    const badge = document.getElementById('saved-count-badge');
    if (badge) badge.textContent = this.savedTermIds.size;
  }

  initHeroBanner() {
    const banner = document.getElementById('hero-banner');
    const dismissBtn = document.getElementById('dismiss-hero-btn');

    if (localStorage.getItem('biztalk_hero_dismissed') === 'true') {
      if (banner) banner.style.display = 'none';
    }

    dismissBtn?.addEventListener('click', () => {
      if (banner) {
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(-10px)';
        setTimeout(() => {
          banner.style.display = 'none';
        }, 300);
      }
      localStorage.setItem('biztalk_hero_dismissed', 'true');
    });
  }

  setupEventListeners() {
    this.initHeroBanner();

    // Theme Toggle
    document.getElementById('theme-toggle')?.addEventListener('click', () => this.toggleTheme());

    // Reselect Sector Menu / Header Buttons
    const showSectorPicker = () => {
      this.switchTab('stages');
      const wrapper = document.getElementById('sector-selection-wrapper');
      if (wrapper) {
        wrapper.style.display = 'block';
        wrapper.scrollIntoView({ behavior: 'smooth' });
      }
    };

    document.getElementById('nav-reselect-sector')?.addEventListener('click', showSectorPicker);
    document.getElementById('change-sector-btn')?.addEventListener('click', showSectorPicker);

    // Desktop Nav Tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        if (e.currentTarget.id === 'nav-reselect-sector') return;
        const view = e.currentTarget.dataset.view;
        this.switchTab(view);
      });
    });

    // Mobile Bottom Bar Tabs
    document.querySelectorAll('.mobile-tab-item').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        this.switchTab(view);
      });
    });

    // Logo Click
    document.getElementById('logo-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.switchTab('stages');
    });

    // Search Trigger Modal
    const searchModal = document.getElementById('search-modal');
    const openSearchBtn = document.getElementById('open-search-btn');
    const closeSearchBtn = document.getElementById('close-search-btn');
    const modalSearchInput = document.getElementById('modal-search-input');

    openSearchBtn?.addEventListener('click', () => {
      searchModal.classList.add('open');
      modalSearchInput.focus();
    });

    closeSearchBtn?.addEventListener('click', () => {
      searchModal.classList.remove('open');
    });

    searchModal?.addEventListener('click', (e) => {
      if (e.target === searchModal) searchModal.classList.remove('open');
    });

    // Keyboard Shortcuts (Cmd+K / Ctrl+K)
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchModal.classList.toggle('open');
        if (searchModal.classList.contains('open')) {
          modalSearchInput.focus();
        }
      }
    });

    // Inline Search Input
    document.getElementById('inline-search')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderDictionary();
    });

    // Modal Search Input
    modalSearchInput?.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      this.renderSearchResults(query);
    });

    // Detail Modal Close
    const detailModal = document.getElementById('detail-modal');
    document.getElementById('close-detail-btn')?.addEventListener('click', () => {
      detailModal.classList.remove('open');
    });
    detailModal?.addEventListener('click', (e) => {
      if (e.target === detailModal) detailModal.classList.remove('open');
    });

    // Saved Clear All
    document.getElementById('clear-bookmarks-btn')?.addEventListener('click', () => {
      if (confirm('Clear your saved study deck?')) {
        this.savedTermIds.clear();
        this.saveBookmarks();
        this.renderSavedDeck();
        this.renderDictionary();
      }
    });

    // Footer Nav Links
    document.getElementById('footer-dict-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.switchTab('dictionary');
    });
    document.getElementById('footer-quiz-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.switchTab('quiz');
    });
    document.getElementById('footer-interview-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.switchTab('trainer');
    });
  }

  switchTab(viewId) {
    // Update Desktop Nav Tabs
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.view === viewId);
    });

    // Update Mobile Nav Tabs
    document.querySelectorAll('.mobile-tab-item').forEach(t => {
      t.classList.toggle('active', t.dataset.view === viewId);
    });

    // Show View
    document.querySelectorAll('.tab-view').forEach(view => {
      view.style.display = view.id === `view-${viewId}` ? 'block' : 'none';
    });

    if (viewId === 'saved') {
      this.renderSavedDeck();
    } else if (viewId === 'quiz') {
      this.renderQuizQuestion();
    } else if (viewId === 'trainer') {
      this.renderTrainerCard();
    } else if (viewId === 'stages') {
      this.renderStagesForIndustry(this.currentIndustry);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* Progressive Stages Rendering */
  renderStageIndustryChips() {
    const gridContainer = document.getElementById('sector-grid-selector');
    const wrapper = document.getElementById('sector-selection-wrapper');
    if (!gridContainer || !this.data) return;

    // Check if domain was previously selected
    const savedDomain = localStorage.getItem('biztalk_selected_domain');
    if (savedDomain && this.data.industries.some(i => i.id === savedDomain)) {
      this.currentIndustry = savedDomain;
      if (wrapper) wrapper.style.display = 'none';
    }

    gridContainer.innerHTML = this.data.industries.map(ind => {
      const termsCount = this.data.terms.filter(t => t.industry === ind.id).length;
      const isActive = this.currentIndustry === ind.id;

      return `
        <div class="sector-card-item ${isActive ? 'active' : ''}" data-industry="${ind.id}">
          <span class="sector-card-icon">${ind.icon}</span>
          <span class="sector-card-name">${ind.name}</span>
          <span class="sector-card-count">${termsCount} Terms</span>
        </div>
      `;
    }).join('');

    gridContainer.querySelectorAll('.sector-card-item').forEach(card => {
      card.addEventListener('click', (e) => {
        gridContainer.querySelectorAll('.sector-card-item').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.currentIndustry = e.currentTarget.dataset.industry;
        localStorage.setItem('biztalk_selected_domain', this.currentIndustry);

        const indObj = this.data.industries.find(i => i.id === this.currentIndustry);
        const titleEl = document.getElementById('active-sector-title');
        const subTitleEl = document.getElementById('active-sector-subtitle');

        if (titleEl && indObj) {
          titleEl.textContent = `${indObj.icon} ${indObj.name}`;
        }
        if (subTitleEl && indObj) {
          subTitleEl.textContent = `${indObj.description}`;
        }

        // Dismiss Domain Selection Grid after choosing
        if (wrapper) {
          wrapper.style.display = 'none';
        }

        this.renderStagesForIndustry(this.currentIndustry);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  renderStagesForIndustry(indId) {
    const container = document.getElementById('stages-container');
    if (!container || !this.data) return;

    const indObj = this.data.industries.find(i => i.id === indId);
    if (!indObj) return;

    const stages = indObj.stages || [];
    const indProgress = this.userProgress[indId] || { level: 1 };

    container.innerHTML = stages.map(st => {
      const isUnlocked = st.level <= indProgress.level;
      const termsInStage = this.data.terms.filter(t => t.industry === indId && (t.stage || t.level) === st.level);

      return `
        <div class="stage-card ${isUnlocked ? 'unlocked' : 'locked'}" data-level="${st.level}">
          <div class="stage-header-row">
            <div>
              <span class="stage-status-badge ${isUnlocked ? 'unlocked' : 'locked'}">
                ${isUnlocked ? '🔓 Unlocked' : '🔒 Locked'}
              </span>
              <h3 class="stage-title" style="margin-top: 0.4rem;">${st.title}</h3>
            </div>
            <span style="font-size: 1.6rem;">${isUnlocked ? '🚀' : '🔒'}</span>
          </div>

          <p class="stage-desc">${st.description}</p>

          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 0.8rem; font-size: 0.85rem; color: var(--text-muted);">
            <span>${termsInStage.length} Essential Terms</span>
            ${isUnlocked 
              ? `<button class="btn-primary start-stage-btn" data-level="${st.level}" style="padding: 0.4rem 1rem; font-size: 0.85rem;">Start Practice →</button>`
              : `<span style="font-size: 0.8rem;">Complete Level ${st.level - 1} to Unlock</span>`
            }
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.start-stage-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const level = parseInt(e.currentTarget.dataset.level, 10);
        this.startStageQuiz(indId, level);
      });
    });
  }

  startStageQuiz(indId, level) {
    const terms = this.data.terms.filter(t => t.industry === indId && (t.stage || t.level) === level);
    if (!terms.length) {
      alert('No terms available for this level yet!');
      return;
    }

    this.activeStage = { indId, level };
    this.quizQuestions = [...terms];
    this.currentQuizIndex = 0;
    this.quizScore = 0;
    this.switchTab('quiz');
  }

  renderDictionary() {
    const grid = document.getElementById('term-grid');
    if (!grid || !this.data) return;

    const terms = this.getFilteredTerms();

    if (terms.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
          <h3>No business terms found</h3>
          <p>Try searching for a different keyword.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = terms.map(term => this.createTermCardHTML(term)).join('');
    this.attachCardEventListeners(grid);
  }

  getFilteredTerms() {
    if (!this.data) return [];
    return this.data.terms.filter(term => {
      const matchesIndustry = this.currentIndustry === 'all' || term.industry === this.currentIndustry;
      const matchesQuery = !this.searchQuery || 
        term.term.toLowerCase().includes(this.searchQuery) ||
        (term.full_name && term.full_name.toLowerCase().includes(this.searchQuery)) ||
        term.meaning.toLowerCase().includes(this.searchQuery);
      return matchesIndustry && matchesQuery;
    });
  }

  createTermCardHTML(term) {
    const isBookmarked = this.savedTermIds.has(term.id);
    const indObj = this.data.industries.find(i => i.id === term.industry);

    return `
      <div class="term-card" data-id="${term.id}">
        <div>
          <div class="card-top">
            <div class="term-header">
              <span class="term-title">${term.term}</span>
              ${term.full_name ? `<span class="term-fullname">${term.full_name}</span>` : ''}
              <div class="term-badges">
                <span class="badge badge-${term.type}">${term.type}</span>
                <span class="badge">Level ${term.stage || 1}</span>
              </div>
            </div>
            <div class="card-actions">
              <button class="btn-tts" data-term="${term.term}" title="Listen Pronunciation">🔊</button>
              <button class="btn-bookmark ${isBookmarked ? 'bookmarked' : ''}" data-id="${term.id}">
                ${isBookmarked ? '★' : '☆'}
              </button>
            </div>
          </div>

          <p class="term-meaning">${term.meaning}</p>

          <div class="interview-tip-box">
            <div class="tip-header">💡 How to drop in an interview</div>
            <div class="tip-content">${term.interview_tip}</div>
          </div>
        </div>

        <div class="card-footer">
          <span>Sector: <strong style="color:var(--text-accent);">${indObj ? indObj.name : term.industry}</strong></span>
          <button class="btn-detail" data-id="${term.id}">View Script →</button>
        </div>
      </div>
    `;
  }

  attachCardEventListeners(container) {
    container.querySelectorAll('.btn-tts').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.speakText(e.currentTarget.dataset.term);
      });
    });

    container.querySelectorAll('.btn-bookmark').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        if (this.savedTermIds.has(id)) {
          this.savedTermIds.delete(id);
        } else {
          this.savedTermIds.add(id);
        }
        this.saveBookmarks();
        this.renderDictionary();
      });
    });

    container.querySelectorAll('.btn-detail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.openDetailModal(e.currentTarget.dataset.id);
      });
    });
  }

  openDetailModal(termId) {
    const term = this.data.terms.find(t => t.id === termId);
    if (!term) return;

    const modal = document.getElementById('detail-modal');
    const indObj = this.data.industries.find(i => i.id === term.industry);

    document.getElementById('modal-term-industry').textContent = indObj ? indObj.name : term.industry;
    document.getElementById('modal-term-title').textContent = term.term;
    document.getElementById('modal-term-fullname').textContent = term.full_name || '';
    document.getElementById('modal-term-meaning').textContent = term.meaning;
    document.getElementById('modal-term-tip').textContent = term.interview_tip;
    document.getElementById('modal-term-quote').textContent = `"${term.sample_interview_response}"`;

    const ttsBtn = document.getElementById('modal-tts-btn');
    ttsBtn.onclick = () => this.speakText(term.term);

    const bookmarkBtn = document.getElementById('modal-bookmark-btn');
    const isSaved = this.savedTermIds.has(term.id);
    bookmarkBtn.textContent = isSaved ? '★ Bookmarked' : '⭐ Bookmark for Prep';
    bookmarkBtn.onclick = () => {
      if (this.savedTermIds.has(term.id)) {
        this.savedTermIds.delete(term.id);
        bookmarkBtn.textContent = '⭐ Bookmark for Prep';
      } else {
        this.savedTermIds.add(term.id);
        bookmarkBtn.textContent = '★ Bookmarked';
      }
      this.saveBookmarks();
      this.renderDictionary();
    };

    modal.classList.add('open');
  }

  speakText(text) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  }

  saveBookmarks() {
    localStorage.setItem('biztalk_saved_terms', JSON.stringify([...this.savedTermIds]));
    this.updateUserStatsDisplay();
  }

  renderSavedDeck() {
    const grid = document.getElementById('saved-grid');
    if (!grid || !this.data) return;

    const savedTerms = this.data.terms.filter(t => this.savedTermIds.has(t.id));

    if (savedTerms.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
          <div style="font-size: 3.5rem; margin-bottom: 1rem;">⭐</div>
          <h3>Your Study Deck is Empty</h3>
          <p>Click the star (☆) icon on any term to save it here for quick prep.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = savedTerms.map(term => this.createTermCardHTML(term)).join('');
    this.attachCardEventListeners(grid);
  }

  renderSearchResults(query) {
    const container = document.getElementById('modal-search-results');
    if (!container || !this.data) return;

    if (!query) {
      container.innerHTML = '<div style="padding:1.5rem; text-align:center; color:var(--text-muted);">Type to search across all industries...</div>';
      return;
    }

    const matches = this.data.terms.filter(t => 
      t.term.toLowerCase().includes(query) ||
      (t.full_name && t.full_name.toLowerCase().includes(query)) ||
      t.meaning.toLowerCase().includes(query)
    );

    if (matches.length === 0) {
      container.innerHTML = '<div style="padding:1.5rem; text-align:center; color:var(--text-muted);">No matching terms found</div>';
      return;
    }

    container.innerHTML = matches.map(term => `
      <div class="search-item" data-id="${term.id}">
        <div>
          <strong style="color:var(--text-primary); font-size:1rem;">${term.term}</strong>
          <span style="font-size:0.8rem; color:var(--text-muted); margin-left:0.5rem;">${term.full_name || ''}</span>
          <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.2rem;">${term.meaning.substring(0, 80)}...</div>
        </div>
        <span class="badge badge-${term.type}">${term.type}</span>
      </div>
    `).join('');

    container.querySelectorAll('.search-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        document.getElementById('search-modal').classList.remove('open');
        this.openDetailModal(id);
      });
    });
  }

  /* Scenario Quiz Engine */
  initQuiz() {
    if (!this.data) return;
    this.quizQuestions = [...this.data.terms];
    this.currentQuizIndex = 0;
    this.quizScore = 0;

    document.getElementById('quiz-prev-btn')?.addEventListener('click', () => {
      if (this.currentQuizIndex > 0) {
        this.currentQuizIndex--;
        this.renderQuizQuestion();
      }
    });

    document.getElementById('quiz-next-btn')?.addEventListener('click', () => {
      if (this.currentQuizIndex < this.quizQuestions.length - 1) {
        this.currentQuizIndex++;
        this.renderQuizQuestion();
      } else {
        this.completeQuizStage();
      }
    });
  }

  renderQuizQuestion() {
    if (!this.quizQuestions.length) return;
    const item = this.quizQuestions[this.currentQuizIndex];
    const indObj = this.data.industries.find(i => i.id === item.industry);

    document.getElementById('quiz-industry-tag').textContent = indObj ? indObj.name : item.industry;
    document.getElementById('quiz-score').textContent = this.quizScore;

    const progressPercent = ((this.currentQuizIndex + 1) / this.quizQuestions.length) * 100;
    document.getElementById('quiz-progress').style.width = `${progressPercent}%`;

    const box = document.getElementById('quiz-question-box');
    const feedback = document.getElementById('quiz-feedback');
    feedback.classList.remove('visible');

    box.innerHTML = `
      <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">
        Question ${this.currentQuizIndex + 1} of ${this.quizQuestions.length}
      </div>
      <h3 class="question-prompt">
        "${item.context_question || `What is the core definition of ${item.term}?`}"
      </h3>
      <div class="options-list">
        ${item.options.map((opt, idx) => `
          <button class="option-btn" data-idx="${idx}">
            <span style="font-weight:700; width: 24px;">${String.fromCharCode(65 + idx)}.</span>
            <span>${opt}</span>
          </button>
        `).join('')}
      </div>
    `;

    box.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const selectedIdx = parseInt(e.currentTarget.dataset.idx, 10);
        this.handleQuizAnswer(item, selectedIdx, box.querySelectorAll('.option-btn'), feedback);
      });
    });
  }

  handleQuizAnswer(item, selectedIdx, optionBtns, feedback) {
    optionBtns.forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === item.correct_option) {
        btn.classList.add('selected-correct');
      } else if (idx === selectedIdx) {
        btn.classList.add('selected-incorrect');
      }
    });

    if (selectedIdx === item.correct_option) {
      this.quizScore += 10;
      this.userXP += 15;
      document.getElementById('quiz-score').textContent = this.quizScore;
      this.updateUserStatsDisplay();
      this.playChimeSound(true);

      feedback.style.borderColor = 'var(--success)';
      feedback.innerHTML = `
        <div style="color:var(--success); font-weight:700; margin-bottom:0.25rem;">✅ Spot on answer! (+15 XP)</div>
        <p style="font-size:0.9rem; color:var(--text-primary);">${item.meaning}</p>
        <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.4rem;"><strong>Interview Tip:</strong> ${item.interview_tip}</div>
      `;
    } else {
      this.playChimeSound(false);
      feedback.style.borderColor = 'var(--danger)';
      feedback.innerHTML = `
        <div style="color:var(--danger); font-weight:700; margin-bottom:0.25rem;">❌ Not quite.</div>
        <p style="font-size:0.9rem; color:var(--text-primary);">Correct: <strong>${item.options[item.correct_option]}</strong></p>
        <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.4rem;">${item.meaning}</div>
      `;
    }

    localStorage.setItem('biztalk_xp', this.userXP);
    feedback.classList.add('visible');
  }

  completeQuizStage() {
    if (this.activeStage) {
      const { indId, level } = this.activeStage;
      const currentLevel = (this.userProgress[indId] && this.userProgress[indId].level) || 1;

      if (level >= currentLevel && level < 3) {
        this.userProgress[indId] = { level: level + 1 };
        localStorage.setItem('biztalk_user_progress', JSON.stringify(this.userProgress));
        alert(`🎉 Level ${level} Complete! You unlocked Level ${level + 1} for this sector!`);
      } else {
        alert(`🎉 Stage Complete! Total Score: ${this.quizScore} pts`);
      }
    } else {
      alert(`🎉 Practice Session Complete! Total Score: ${this.quizScore} pts`);
    }

    this.switchTab('stages');
  }

  playChimeSound(isCorrect) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (isCorrect) {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (e) {}
  }

  /* Interview Prep Trainer Engine */
  initTrainer() {
    if (!this.data) return;
    this.trainerTerms = [...this.data.terms];
    this.trainerIndex = 0;

    const flashcard = document.getElementById('interview-flashcard');
    document.getElementById('trainer-flip')?.addEventListener('click', () => {
      flashcard.classList.toggle('flipped');
    });

    flashcard?.addEventListener('click', () => {
      flashcard.classList.toggle('flipped');
    });

    document.getElementById('trainer-prev')?.addEventListener('click', () => {
      if (this.trainerIndex > 0) {
        this.trainerIndex--;
        flashcard.classList.remove('flipped');
        this.renderTrainerCard();
      }
    });

    document.getElementById('trainer-next')?.addEventListener('click', () => {
      if (this.trainerIndex < this.trainerTerms.length - 1) {
        this.trainerIndex++;
        flashcard.classList.remove('flipped');
        this.renderTrainerCard();
      }
    });
  }

  renderTrainerCard() {
    const card = document.getElementById('interview-flashcard');
    if (!card || !this.trainerTerms.length) return;

    const term = this.trainerTerms[this.trainerIndex];
    const indObj = this.data.industries.find(i => i.id === term.industry);

    card.innerHTML = `
      <div class="flashcard-front">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
            <span class="badge badge-framework">${indObj ? indObj.name : term.industry}</span>
            <span style="font-size:0.8rem; color:var(--text-muted);">${this.trainerIndex + 1} / ${this.trainerTerms.length}</span>
          </div>
          <h2 style="font-family:var(--font-heading); font-size:2.2rem; margin-bottom:0.4rem; color:var(--text-primary);">${term.term}</h2>
          <div style="color:var(--text-muted); font-size:1rem; margin-bottom:1.5rem;">${term.full_name || ''}</div>
          <p style="font-size:1.1rem; color:var(--text-secondary); line-height:1.6;">${term.meaning}</p>
        </div>

        <div style="text-align:center; color:var(--accent-primary); font-weight:600; font-size:0.9rem; margin-top:2rem;">
          👆 Click card to reveal Candidate Response Script
        </div>
      </div>

      <div class="flashcard-back">
        <div>
          <div class="tip-header" style="font-size:0.85rem; margin-bottom:0.5rem;">🎯 Candidate Response Script</div>
          <div class="interview-quote">"${term.sample_interview_response}"</div>
          <div class="interview-tip-box" style="margin-top:1.25rem;">
            <div class="tip-header">💡 Why this response works</div>
            <div class="tip-content">${term.interview_tip}</div>
          </div>
        </div>

        <div style="text-align:center; color:var(--text-muted); font-size:0.85rem; margin-top:1.5rem;">
          🔄 Click to flip back to definition
        </div>
      </div>
    `;
  }
}

// Bootstrap App
document.addEventListener('DOMContentLoaded', () => {
  window.bizTalkApp = new BizTalkApp();
});
