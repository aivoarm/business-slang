/* ==========================================================================
   buz-slang - Pure Conversational AI Quiz Coach Controller
   ========================================================================== */

class BuzSlangApp {
  constructor() {
    this.theme = localStorage.getItem('buzslang_theme') || 'dark';
    this.userXP = parseInt(localStorage.getItem('buzslang_xp') || '0', 10);
    this.userStreak = parseInt(localStorage.getItem('buzslang_streak') || '1', 10);

    this.chatState = {
      step: 1, // 1: domain, 2: level, 3: depth, 4: generating, 5: playing quiz, 6: summary
      domain: '',
      level: '',
      depth: 5,
      quizQuestions: [],
      currentIndex: 0,
      score: 0
    };

    this.init();
  }

  init() {
    this.applyTheme(this.theme);
    this.setupEventListeners();
    this.updateUserStatsDisplay();

    // Check if active session exists to resume where dropped off
    const activeSession = this.loadActiveQuizSession();
    if (activeSession && Array.isArray(activeSession.quizQuestions) && activeSession.quizQuestions.length > 0 && activeSession.currentIndex < activeSession.quizQuestions.length) {
      this.promptResumeQuizSession(activeSession);
    } else {
      this.renderChatStep();
    }
  }

  /* Active Session Persistence (Resume where dropped) */
  saveActiveQuizSession() {
    if (this.chatState.step === 5 && Array.isArray(this.chatState.quizQuestions) && this.chatState.quizQuestions.length > 0) {
      const sessionData = {
        step: 5,
        domain: this.chatState.domain,
        level: this.chatState.level,
        depth: this.chatState.depth,
        quizQuestions: this.chatState.quizQuestions,
        currentIndex: this.chatState.currentIndex,
        score: this.chatState.score,
        savedAt: Date.now()
      };
      localStorage.setItem('buzslang_active_session', JSON.stringify(sessionData));
    }
  }

  loadActiveQuizSession() {
    try {
      const raw = localStorage.getItem('buzslang_active_session');
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Failed to parse active quiz session:', e);
    }
    return null;
  }

  clearActiveQuizSession() {
    localStorage.removeItem('buzslang_active_session');
  }

  promptResumeQuizSession(session) {
    const messagesEl = document.getElementById('ai-chat-messages');
    const controlsEl = document.getElementById('ai-chat-controls');
    if (!messagesEl || !controlsEl) return;

    this.chatState = session;
    const subTitle = document.getElementById('active-domain-subtitle');
    if (subTitle) subTitle.textContent = `${session.domain} • ${session.level}`;

    messagesEl.innerHTML = `
      <div class="chat-bubble bot">
        👋 Welcome back! You have an in-progress quiz session for <strong>${session.domain}</strong>.<br>
        <span style="font-size:0.88rem; color:var(--text-accent);">
          Question ${session.currentIndex + 1} of ${session.quizQuestions.length} • Current Score: ${session.score} pts
        </span>
      </div>
    `;

    controlsEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:0.65rem; width:100%;">
        <button class="btn-primary" id="resume-session-btn" style="width:100%; justify-content:center; padding:0.9rem;">
          ▶️ Resume Quiz (Question ${session.currentIndex + 1} of ${session.quizQuestions.length})
        </button>
        <button class="btn-secondary" id="start-new-topic-btn" style="width:100%; justify-content:center; padding:0.75rem; font-size:0.85rem;">
          🔄 Start New Quiz Topic
        </button>
      </div>
    `;

    document.getElementById('resume-session-btn').onclick = () => {
      this.renderInlineQuizCard();
    };

    document.getElementById('start-new-topic-btn').onclick = () => {
      this.resetChat();
    };
  }

  applyTheme(theme) {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('buzslang_theme', theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
  }

  toggleTheme() {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  updateUserStatsDisplay() {
    const xpEl = document.getElementById('stat-xp-val');
    const streakEl = document.getElementById('streak-val');
    if (xpEl) xpEl.textContent = this.userXP;
    if (streakEl) streakEl.textContent = this.userStreak;
  }

  setupEventListeners() {
    document.getElementById('theme-toggle')?.addEventListener('click', () => this.toggleTheme());
    document.getElementById('reset-chat-top-btn')?.addEventListener('click', () => this.resetChat());
    document.getElementById('logo-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.resetChat();
    });
  }

  resetChat() {
    this.clearActiveQuizSession();
    this.chatState = {
      step: 1,
      domain: '',
      level: '',
      depth: 5,
      quizQuestions: [],
      currentIndex: 0,
      score: 0
    };
    const subTitle = document.getElementById('active-domain-subtitle');
    if (subTitle) subTitle.textContent = 'Personalized Career Scenario Generator';
    this.renderChatStep();
  }

  renderChatStep() {
    const messagesEl = document.getElementById('ai-chat-messages');
    const controlsEl = document.getElementById('ai-chat-controls');
    if (!messagesEl || !controlsEl) return;

    if (this.chatState.step === 1) {
      messagesEl.innerHTML = `
        <div class="chat-bubble bot">
          👋 Hi! I'm your <strong>AI Quiz Coach</strong>.<br>
          Which domain or industry topic would you like to master today?

          <div style="margin-top: 0.85rem;">
            <div style="font-size:0.82rem; color:var(--text-accent); font-weight:600; margin-bottom:0.5rem;">Select a domain or type a custom topic:</div>
            <div class="chat-chips-container" style="margin-bottom:0.75rem;">
              <button class="chat-chip-btn" data-domain="🤖 AI & Data Literacy">🤖 AI & Data</button>
              <button class="chat-chip-btn" data-domain="📦 Procurement & Supply Chain">📦 Supply Chain</button>
              <button class="chat-chip-btn" data-domain="💻 Software Engineering">💻 Software Dev</button>
              <button class="chat-chip-btn" data-domain="💰 Corporate Finance">💰 Corporate Finance</button>
              <button class="chat-chip-btn" data-domain="⚖️ Legal & Compliance">⚖️ Legal & Risk</button>
              <button class="chat-chip-btn" data-domain="🏥 Healthcare Ops">🏥 Healthcare Ops</button>
            </div>
            <div class="chat-custom-input-group">
              <input type="text" id="chat-custom-domain-input" class="chat-custom-input" placeholder="Or type custom topic (e.g. BioTech Regulations)...">
              <button class="btn-primary" id="chat-custom-domain-btn" style="padding:0.7rem 1.3rem; font-size:0.88rem;">Next →</button>
            </div>
          </div>
        </div>
      `;

      controlsEl.innerHTML = `<div style="text-align:center; font-size:0.82rem; color:var(--text-muted);">Choose a domain above or type a topic to start</div>`;

      messagesEl.querySelectorAll('.chat-chip-btn').forEach(btn => {
        btn.onclick = (e) => {
          this.chatState.domain = e.currentTarget.dataset.domain;
          this.chatState.step = 2;
          this.renderChatStep();
        };
      });

      const inputEl = document.getElementById('chat-custom-domain-input');
      const submitBtn = document.getElementById('chat-custom-domain-btn');
      const submitCustom = () => {
        const val = inputEl.value.trim();
        if (val) {
          this.chatState.domain = val;
          this.chatState.step = 2;
          this.renderChatStep();
        }
      };
      if (submitBtn) submitBtn.onclick = submitCustom;
      if (inputEl) inputEl.onkeydown = (e) => { if (e.key === 'Enter') submitCustom(); };

    } else if (this.chatState.step === 2) {
      messagesEl.innerHTML += `
        <div class="chat-bubble user">🎯 ${this.chatState.domain}</div>
        <div class="chat-bubble bot">
          Awesome! What is your target <strong>proficiency level</strong> for ${this.chatState.domain}?
          <div class="chat-chips-container" style="margin-top:0.85rem;">
            <button class="chat-chip-btn" data-level="Beginner 🌱">🌱 Level 1: Beginner / Core Terms</button>
            <button class="chat-chip-btn" data-level="Intermediate ⚡">⚡ Level 2: Intermediate / Scenario Mastery</button>
            <button class="chat-chip-btn" data-level="Executive 🎩">🎩 Level 3: Executive / Advanced Strategy</button>
          </div>
        </div>
      `;
      messagesEl.scrollTop = messagesEl.scrollHeight;

      controlsEl.innerHTML = `<div style="text-align:center; font-size:0.82rem; color:var(--text-muted);">Select proficiency level above</div>`;

      messagesEl.querySelectorAll('.chat-chip-btn').forEach(btn => {
        btn.onclick = (e) => {
          this.chatState.level = e.currentTarget.dataset.level;
          this.chatState.step = 3;
          this.renderChatStep();
        };
      });

    } else if (this.chatState.step === 3) {
      messagesEl.innerHTML += `
        <div class="chat-bubble user">${this.chatState.level}</div>
        <div class="chat-bubble bot">
          Got it! How deep do you want your practice quiz to be?
          <div class="chat-chips-container" style="margin-top:0.85rem;">
            <button class="chat-chip-btn" data-depth="3">⚡ Quick Refresh (3 Questions)</button>
            <button class="chat-chip-btn" data-depth="5">🎯 Core Mastery (5 Questions)</button>
            <button class="chat-chip-btn" data-depth="10">🔥 Deep Dive Simulation (10 Questions)</button>
          </div>
        </div>
      `;
      messagesEl.scrollTop = messagesEl.scrollHeight;

      controlsEl.innerHTML = `<div style="text-align:center; font-size:0.82rem; color:var(--text-muted);">Select quiz length above</div>`;

      messagesEl.querySelectorAll('.chat-chip-btn').forEach(btn => {
        btn.onclick = (e) => {
          this.chatState.depth = parseInt(e.currentTarget.dataset.depth, 10);
          this.chatState.step = 4;
          this.generateCustomQuizFromChat();
        };
      });
    }
  }

  async generateQuizFromClientFallback(domain, level, depth) {
    try {
      const res = await fetch('data/business_slang.json');
      if (!res.ok) return null;
      const staticDb = await res.json();
      if (!staticDb.terms || !staticDb.terms.length) return null;

      const normDomain = String(domain || '').toLowerCase().trim();
      const indObj = staticDb.industries?.find(i =>
        i.id.toLowerCase() === normDomain ||
        i.name.toLowerCase().includes(normDomain) ||
        normDomain.includes(i.name.toLowerCase())
      );

      const matchedId = indObj ? indObj.id : null;
      let matchingTerms = staticDb.terms.filter(t => {
        if (matchedId) return t.industry === matchedId;
        return t.industry.toLowerCase().includes(normDomain) ||
               (t.full_name && t.full_name.toLowerCase().includes(normDomain)) ||
               t.meaning.toLowerCase().includes(normDomain);
      });

      if (!matchingTerms || matchingTerms.length === 0) {
        matchingTerms = staticDb.terms;
      }

      const shuffled = [...matchingTerms].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, Math.min(depth, matchingTerms.length));

      return selected.map((term, idx) => {
        const peerTerms = staticDb.terms.filter(t => t.id !== term.id);
        const peerShuffled = [...peerTerms].sort(() => 0.5 - Math.random());
        const distractors = peerShuffled.slice(0, 3).map(t => t.meaning);
        const options = [term.meaning, ...distractors].sort(() => 0.5 - Math.random());
        const correctIdx = options.indexOf(term.meaning);

        return {
          id: `client_${term.id}_${idx}`,
          term: term.term,
          industry: indObj ? indObj.name : domain,
          context_question: term.context_question || `In a workplace scenario, what does "${term.term}" mean?`,
          options: options,
          correct_option: correctIdx,
          explanation: `${term.term} ${term.full_name ? `(${term.full_name})` : ''} means: ${term.meaning}`,
          real_world_example: term.sample_interview_response 
            ? `Example: "${term.sample_interview_response}"`
            : `Example: "In our team, we applied ${term.term} to optimize operational performance."`,
          interview_tip: term.interview_tip || `Mention your understanding of ${term.term} when asked about industry best practices.`
        };
      });
    } catch (e) {
      console.warn('Client-side fallback error:', e);
      return null;
    }
  }

  async generateCustomQuizFromChat(forceRefresh = false) {
    const messagesEl = document.getElementById('ai-chat-messages');
    const controlsEl = document.getElementById('ai-chat-controls');
    if (!messagesEl || !controlsEl) return;

    const subTitle = document.getElementById('active-domain-subtitle');
    if (subTitle) subTitle.textContent = `${this.chatState.domain} • ${this.chatState.level}`;

    messagesEl.innerHTML += `
      <div class="chat-bubble user">${forceRefresh ? '✨ Fresh Generation' : `${this.chatState.depth} Questions`}</div>
      <div class="chat-bubble bot" id="chat-generating-bubble">
        <div class="chat-loading-pulse">
          <span></span><span></span><span></span>
          <span>${forceRefresh ? 'Generating fresh questions...' : `Loading ${this.chatState.domain} quiz...`}</span>
        </div>
      </div>
    `;
    messagesEl.scrollTop = messagesEl.scrollHeight;
    controlsEl.innerHTML = `<div style="text-align:center; font-size:0.85rem; color:var(--text-muted);">Please wait...</div>`;

    try {
      let quizData = null;
      let fromCacheLabel = '⚡ Instant Local DB';

      try {
        const response = await fetch('/api/generate-custom-quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: this.chatState.domain,
            level: this.chatState.level,
            depth: this.chatState.depth,
            forceRefresh
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.quiz) && data.quiz.length > 0) {
            quizData = data.quiz;
            fromCacheLabel = data.fromCache ? '⚡ Instant DB Cache' : '✨ AI Generated';
          }
        }
      } catch (apiErr) {
        console.warn('API endpoint unavailable, attempting client fallback:', apiErr.message);
      }

      // Fallback to client-side static database if API failed or on static production host
      if (!quizData || quizData.length === 0) {
        console.log('Using client-side fallback static DB...');
        quizData = await this.generateQuizFromClientFallback(this.chatState.domain, this.chatState.level, this.chatState.depth);
        fromCacheLabel = '⚡ Static Database';
      }

      if (quizData && Array.isArray(quizData) && quizData.length > 0) {
        this.chatState.quizQuestions = quizData;
        this.chatState.currentIndex = 0;
        this.chatState.score = 0;
        this.chatState.step = 5;

        // Persist initial active session
        this.saveActiveQuizSession();

        const bubble = document.getElementById('chat-generating-bubble');
        if (bubble) {
          bubble.innerHTML = `🎉 <strong>Quiz Ready!</strong> (${quizData.length} Questions • ${fromCacheLabel})`;
        }

        this.renderInlineQuizCard();
      } else {
        throw new Error('Failed to load quiz data');
      }
    } catch (err) {
      console.error('[AI Chat Error]', err.message);
      const bubble = document.getElementById('chat-generating-bubble');
      if (bubble) {
        bubble.innerHTML = `⚠️ <strong>Generation issue:</strong> ${err.message}. Please try again!`;
      }
      controlsEl.innerHTML = `
        <button class="btn-secondary" id="retry-chat-btn" style="width:100%; justify-content:center;">
          🔄 Try Again
        </button>
      `;
      document.getElementById('retry-chat-btn').onclick = () => this.resetChat();
    }
  }

  renderInlineQuizCard() {
    const messagesEl = document.getElementById('ai-chat-messages');
    const controlsEl = document.getElementById('ai-chat-controls');
    if (!messagesEl || !controlsEl) return;

    const questions = this.chatState.quizQuestions;
    const idx = this.chatState.currentIndex;
    const item = questions[idx];

    // Remove old card wrapper if starting new quiz to ensure it renders below fresh bubble
    let quizCardContainer = document.getElementById('chat-quiz-3d-wrapper');
    if (quizCardContainer && idx === 0) {
      quizCardContainer.remove();
      quizCardContainer = null;
    }

    if (!quizCardContainer) {
      quizCardContainer = document.createElement('div');
      quizCardContainer.id = 'chat-quiz-3d-wrapper';
      quizCardContainer.className = 'quiz-3d-wrapper';
      messagesEl.appendChild(quizCardContainer);
    }

    quizCardContainer.innerHTML = `
      <div class="quiz-3d-card" id="quiz-3d-card">
        <div class="quiz-card-face quiz-card-front" id="quiz-card-front">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.75rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">
              Question ${idx + 1} of ${questions.length} • <strong style="color:var(--text-accent);">${item.term || 'Scenario'}</strong>
            </span>
            <span class="badge" style="background:linear-gradient(135deg, #0ea5e9, #6366f1); color:#fff; font-size:0.75rem; padding:0.25rem 0.6rem; border-radius:12px; font-weight:600;">✨ AI Generated</span>
          </div>

          <h3 style="font-family: var(--font-heading); font-size: 1.15rem; font-weight: 700; margin-bottom: 1.25rem; line-height: 1.4;">
            "${item.context_question}"
          </h3>

          <div class="options-list">
            ${item.options.map((opt, optionIdx) => `
              <button class="option-btn" data-idx="${optionIdx}">
                <span style="font-weight:700; width: 24px;">${String.fromCharCode(65 + optionIdx)}.</span>
                <span>${opt}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="quiz-card-face quiz-card-back" id="quiz-card-back">
          <!-- Populated on option click -->
        </div>
      </div>
    `;

    setTimeout(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (quizCardContainer) {
        quizCardContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);

    controlsEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; color:var(--text-muted);">
        <span>Score: <strong style="color:var(--accent-primary);">${this.chatState.score}</strong> pts</span>
        <span>${idx + 1} / ${questions.length} Questions</span>
      </div>
    `;

    const card3D = document.getElementById('quiz-3d-card');
    const frontFace = document.getElementById('quiz-card-front');
    const backFace = document.getElementById('quiz-card-back');

    frontFace.querySelectorAll('.option-btn').forEach(btn => {
      btn.onclick = (e) => {
        const selectedIdx = parseInt(e.currentTarget.dataset.idx, 10);
        this.handleInChatQuizAnswer(item, selectedIdx, card3D, backFace);
      };
    });
  }

  handleInChatQuizAnswer(item, selectedIdx, card3D, backFace) {
    const questions = this.chatState.quizQuestions;
    const idx = this.chatState.currentIndex;

    const isCorrect = typeof item.correct_option === 'number'
      ? selectedIdx === item.correct_option
      : item.options[selectedIdx] === item.correct_option;

    const correctText = typeof item.correct_option === 'number'
      ? item.options[item.correct_option]
      : item.correct_option;

    if (isCorrect) {
      this.chatState.score += 10;
      this.userXP += 15;
      this.updateUserStatsDisplay();
      this.playChimeSound(true);
    } else {
      this.playChimeSound(false);
    }

    localStorage.setItem('buzslang_xp', this.userXP);
    
    // Save current active progress (so user can drop off & resume at exact question)
    this.saveActiveQuizSession();

    if (backFace) {
      backFace.innerHTML = `
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem;">
            <span class="badge badge-framework">${this.chatState.domain}</span>
            <span style="font-size: 0.85rem; color: var(--text-muted);">
              Question ${idx + 1} of ${questions.length}
            </span>
          </div>

          <div style="padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem; background: ${isCorrect ? 'var(--success-bg)' : 'var(--danger-bg)'}; border: 1px solid ${isCorrect ? 'var(--success)' : 'var(--danger)'};">
            <div style="font-weight: 800; font-size: 1.1rem; color: ${isCorrect ? 'var(--success)' : 'var(--danger)'}; margin-bottom: 0.4rem;">
              ${isCorrect ? '✅ Spot on answer! (+15 XP)' : '❌ Not quite right'}
            </div>
            <div style="font-size: 1rem; color: var(--text-primary);">
              🎯 <strong>Correct Answer:</strong> ${correctText}
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <h4 style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.3rem;">📖 AI Rationale & Explanation</h4>
            <p style="font-size: 0.95rem; color: var(--text-primary); line-height: 1.5;">${item.explanation || item.meaning || ''}</p>
          </div>

          ${(item.real_world_example || item.sample_interview_response) ? `
            <div style="background: rgba(6, 182, 212, 0.08); border-left: 3px solid var(--accent-secondary); padding: 0.75rem 1rem; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; margin-bottom: 1rem;">
              <div style="font-size: 0.75rem; font-weight: 700; color: var(--accent-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">
                💬 Real-World Workplace Example
              </div>
              <div style="font-size: 0.9rem; font-style: italic; color: var(--text-primary);">
                "${item.real_world_example || item.sample_interview_response}"
              </div>
            </div>
          ` : ''}

          <div class="interview-tip-box" style="margin-bottom: 1.25rem;">
            <div class="tip-header">💡 How to drop this in a job interview</div>
            <div class="tip-content">${item.interview_tip || 'Emphasize your understanding of key principles and clear communication.'}</div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; border-top: 1px solid var(--border-color); padding-top: 1rem;">
          <button class="btn-secondary" id="inchat-flip-back-btn">← Review Question</button>
          <button class="btn-primary" id="inchat-next-question-btn">
            ${idx < questions.length - 1 ? 'Next Question →' : 'Complete Quiz 🎉'}
          </button>
        </div>
      `;

      document.getElementById('inchat-flip-back-btn').onclick = () => {
        if (card3D) card3D.classList.remove('flipped');
      };

      document.getElementById('inchat-next-question-btn').onclick = () => {
        if (card3D) card3D.classList.remove('flipped');
        setTimeout(() => {
          if (idx < questions.length - 1) {
            this.chatState.currentIndex++;
            this.saveActiveQuizSession();
            this.renderInlineQuizCard();
          } else {
            this.renderQuizSummary();
          }
        }, 200);
      };
    }

    if (card3D) {
      card3D.classList.add('flipped');
      setTimeout(() => {
        card3D.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  }

  renderQuizSummary() {
    this.clearActiveQuizSession();

    const messagesEl = document.getElementById('ai-chat-messages');
    const controlsEl = document.getElementById('ai-chat-controls');
    if (!messagesEl || !controlsEl) return;

    const total = this.chatState.quizQuestions.length;
    const maxScore = total * 10;
    const score = this.chatState.score;
    const percent = Math.round((score / maxScore) * 100);

    messagesEl.innerHTML += `
      <div class="chat-bubble bot" style="background: var(--bg-card-hover); border-color: var(--accent-primary);">
        <h3 style="font-family: var(--font-heading); margin-bottom: 0.5rem; color: var(--accent-secondary);">
          🏆 AI Quiz Complete!
        </h3>
        <p style="margin-bottom: 0.8rem;">
          You scored <strong>${score} / ${maxScore} pts (${percent}%)</strong> for <strong>${this.chatState.domain}</strong>!
        </p>
        <span class="badge" style="background: var(--accent-gradient); color: #fff;">+${total * 15} XP Earned</span>
      </div>
    `;

    messagesEl.scrollTop = messagesEl.scrollHeight;

    controlsEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:0.6rem; width:100%;">
        <button class="btn-primary" id="fresh-quiz-btn" style="width:100%; justify-content:center; padding:0.85rem;">
          ✨ Generate Fresh Questions →
        </button>
        <button class="btn-secondary" id="replay-db-quiz-btn" style="width:100%; justify-content:center; padding:0.75rem; font-size:0.85rem;">
          🔄 Replay Quiz (From Local DB)
        </button>
        <button class="btn-secondary" id="new-quiz-chat-btn" style="width:100%; justify-content:center; padding:0.75rem; font-size:0.85rem;">
          🌐 Choose Another Quiz Topic
        </button>
      </div>
    `;

    document.getElementById('fresh-quiz-btn').onclick = () => this.generateCustomQuizFromChat(true);
    document.getElementById('replay-db-quiz-btn').onclick = () => this.generateCustomQuizFromChat(false);
    document.getElementById('new-quiz-chat-btn').onclick = () => this.resetChat();
  }

  playChimeSound(isSuccess) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (isSuccess) {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else {
        osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (e) {}
  }
}

// Instantiate on DOM Load
window.addEventListener('DOMContentLoaded', () => {
  window.buzslangApp = new BuzSlangApp();
});
