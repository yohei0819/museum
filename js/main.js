/* ============================================
   刀剣ミュージアム東京 - メインJavaScript
   Vanilla JS / GSAP / Swiper.js
   ============================================
   リファクタリング:
   - jQuery依存を完全除去し、標準DOM APIに統一
   - IntersectionObserverでナビアクティブ状態を管理
   - スクロールハンドラをrequestAnimationFrameで最適化
   - イベント委任でリスナー数を削減
   - prefers-reduced-motion を考慮
   ============================================ */

;(function () {
  'use strict';

  /* ------------------------------------------
     外部ライブラリ依存チェック
     CDN障害時にメニュー・フォーム等の基本機能まで停止するのを防止
  ------------------------------------------ */
  const hasGSAP   = typeof gsap !== 'undefined'
                  && typeof ScrollTrigger !== 'undefined'
                  && typeof ScrollToPlugin !== 'undefined';
  const hasSwiper = typeof Swiper !== 'undefined';

  if (!hasGSAP) {
    console.warn('[main.js] GSAP が読み込まれていません。アニメーション機能は無効化されます。');
  }
  if (!hasSwiper) {
    console.warn('[main.js] Swiper が読み込まれていません。スライダー機能は無効化されます。');
  }

  /* ------------------------------------------
     GSAPプラグイン登録（最初に1回だけ実行）
  ------------------------------------------ */
  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
  }

  /* ------------------------------------------
     DOM要素のキャッシュ
  ------------------------------------------ */
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];

  const els = {
    header:         $('#header'),
    hamburger:      $('#hamburger'),
    mobileMenu:     $('#mobileMenu'),
    backToTop:      $('#backToTop'),
    loadingOverlay: $('#loadingOverlay'),
    scrollProgress: $('#scrollProgress'),
  };

  /** ヘッダーの高さ（リサイズ時に再計算 / 要素未取得時はCSS既定値80pxで代替） */
  let headerHeight = els.header?.offsetHeight ?? 80;

  /* ------------------------------------------
     スクロールロック管理
     モバイルメニュー・ライトボックス等の複数コンポーネントが
     body.no-scroll を競合なく使用するためのカウンターベース管理。
     lockScroll / unlockScroll を対に呼び出すことで、
     片方を閉じてももう一方がロック中ならスクロールは抑制され続ける。
  ------------------------------------------ */
  let scrollLockCount = 0;

  /** body のスクロールをロックする（参照カウント +1） */
  function lockScroll() {
    if (scrollLockCount === 0) {
      document.body.classList.add('no-scroll');
    }
    scrollLockCount++;
  }

  /** body のスクロールロックを解除する（参照カウント -1、0 になったら解除） */
  function unlockScroll() {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
      document.body.classList.remove('no-scroll');
    }
  }

  /* ------------------------------------------
     アクセシビリティ & デバイス判定
     ※ 全モジュールから参照されるため、ファイル先頭で宣言する。
  ------------------------------------------ */

  /** prefers-reduced-motion を考慮し、アニメーション無効時には初期化をスキップする */
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let prefersReducedMotion = reducedMotionQuery.matches;

  // OS設定の変更をリアルタイムに反映
  // ※ 初期化済みアニメーションには遡及しないが、新規トリガー判定で最新値を使用できる。
  reducedMotionQuery.addEventListener('change', (e) => {
    prefersReducedMotion = e.matches;
  });

  /** ホバー可能なポインター入力デバイスか判定（タッチ専用デバイスではfalse） */
  const hasHoverCapability = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /** Exhibition・Gallery カードの共通セレクタ（チルト / カーソル表示等で共用） */
  const CARD_TARGETS = '.exhibition__item, .gallery__item';

  /* ============================================
     1. ローディングオーバーレイ
     ============================================ */

  /**
   * ローディング完了時の処理
   * - オーバーレイを非表示にする
   * - GSAPスクロールアニメーションを初期化する
   * - 二重実行をフラグで防止
   */
  let isInitialized = false;

  function completeLoading() {
    if (isInitialized) return;
    isInitialized = true;

    if (els.loadingOverlay) {
      els.loadingOverlay.classList.add('is-hidden');
    }

    // GSAPが未検出の場合、非表示要素のみ表示してアニメーション初期化をスキップ
    if (!hasGSAP) {
      $$('.js-scroll-fade').forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      return;
    }

    initGSAPAnimations();
    initHeroParticles();
    initCountUp();
    initTextSplitAnimations();
    initRevealMasks();
    initHorizontalScroll();
    initParallaxLayers();
    initStrokeDraw();
  }

  // ページ読み込み完了後にローディングを非表示
  window.addEventListener('load', () => {
    setTimeout(completeLoading, 800);
  });

  // フォールバック: 3秒後に強制実行（loadイベント未発火対策）
  setTimeout(completeLoading, 3000);

  /* ============================================
     2. スクロールハンドラ（rAF で最適化）
     ============================================
     以下の処理を1つのハンドラにまとめて
     requestAnimationFrame でスロットリング:
       - ヘッダー背景の切り替え
       - トップへ戻るボタンの表示切り替え
       - スクロール進捗バーの更新 (Module 15)
  */
  /** スクロール処理の閾値 */
  const HEADER_SCROLL_THRESHOLD = 50;
  const BACK_TO_TOP_THRESHOLD = 500;

  let isScrolling = false;

  function handleScroll() {
    if (isScrolling) return;
    isScrolling = true;

    requestAnimationFrame(() => {
      const scrollTop = window.scrollY;

      // ヘッダー背景切り替え
      els.header?.classList.toggle('header--scrolled', scrollTop > HEADER_SCROLL_THRESHOLD);

      // トップへ戻るボタン表示切り替え
      els.backToTop?.classList.toggle('is-visible', scrollTop > BACK_TO_TOP_THRESHOLD);

      // スクロール進捗バー更新（reduced-motion時はCSSで非表示）
      if (els.scrollProgress && !prefersReducedMotion) {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        if (maxScroll > 0) {
          els.scrollProgress.style.width = `${(scrollTop / maxScroll) * 100}%`;
        }
      }

      isScrolling = false;
    });
  }

  window.addEventListener('scroll', handleScroll, { passive: true });

  // ページリロード時にスクロール途中であった場合に備え、初期状態を同期
  handleScroll();

  /* ============================================
     2b. ナビリンクのアクティブ状態（IntersectionObserver）
     ============================================
     スクロール位置計算の代わりにIntersectionObserverを使用。
     各セクションの可視状態を監視し、対応するナビリンクを切り替える。
  */
  /** ナビリンクのアクティブ切り替え対象（HTMLのセクション出現順 / CTAの contact は対象外） */
  const NAV_SECTION_IDS = ['about', 'topics', 'exhibition', 'access'];

  /** 現在の IntersectionObserver（ヘッダー高さ変更時に再生成するため保持） */
  let navObserver = null;

  /**
   * ナビリンクのアクティブ状態を監視する IntersectionObserver を生成する。
   * ヘッダー高さ変更時に rootMargin を最新化するため、再呼び出し可能にしている。
   */
  function initNavObserver() {
    if (navObserver) navObserver.disconnect();

    navObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const link = $(`.header__nav-link[href="#${entry.target.id}"]`);
        if (!link) return;

        link.classList.toggle('header__nav-link--active', entry.isIntersecting);
      });
    }, {
      root: null,
      rootMargin: `-${headerHeight}px 0px -40% 0px`,
      threshold: 0,
    });

    NAV_SECTION_IDS.forEach((id) => {
      const section = document.getElementById(id);
      if (section) navObserver.observe(section);
    });
  }

  initNavObserver();

  /* ============================================
     3. ハンバーガーメニュー
     ============================================ */

  /**
   * モバイルメニューを閉じる共通関数
   * トグル / リンククリック / Escキー の3箇所で使うため共通化
   */
  function closeMobileMenu() {
    if (!els.hamburger || !els.mobileMenu) return;
    els.hamburger.classList.remove('is-active');
    els.mobileMenu.classList.remove('is-open');
    unlockScroll();
    els.hamburger.setAttribute('aria-expanded', 'false');
    els.hamburger.setAttribute('aria-label', 'メニューを開く');
    els.mobileMenu.setAttribute('aria-hidden', 'true');
  }

  /** モバイルメニューを開く */
  function openMobileMenu() {
    if (!els.hamburger || !els.mobileMenu) return;
    els.hamburger.classList.add('is-active');
    els.mobileMenu.classList.add('is-open');
    lockScroll();
    els.hamburger.setAttribute('aria-expanded', 'true');
    els.hamburger.setAttribute('aria-label', 'メニューを閉じる');
    els.mobileMenu.setAttribute('aria-hidden', 'false');
  }

  // ハンバーガートグル
  els.hamburger?.addEventListener('click', () => {
    els.hamburger.classList.contains('is-active')
      ? closeMobileMenu()
      : openMobileMenu();
  });

  // モバイルメニューリンクをクリックしたら閉じる（イベント委任）
  els.mobileMenu?.addEventListener('click', (e) => {
    if (e.target.closest('.header__mobile-link')) {
      closeMobileMenu();
    }
  });

  // Escキーでメニューを閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.mobileMenu?.classList.contains('is-open')) {
      closeMobileMenu();
      els.hamburger?.focus(); // フォーカスをトリガー元に戻す（a11y）
    }
  });

  /* ------------------------------------------
     リサイズハンドラ（集約・デバウンス）
     ※ ResizeObserver(documentElement) はコンテンツ高さ変化でも発火するため
        ビューポート変化のみ検知する window resize + デバウンスを採用
     以下の処理を1つのハンドラに統合:
       - ヘッダー高さ再計算 + IntersectionObserver rootMargin 更新
       - パーティクルCanvas再初期化
       - ストロークドローSVG rx/ry 再計算
  ------------------------------------------ */
  /** リサイズ時のコールバック登録リスト */
  const resizeCallbacks = [];
  let resizeTimer = null;

  /**
   * リサイズ時に実行するコールバックを登録する
   * @param {Function} callback
   */
  function onResize(callback) {
    resizeCallbacks.push(callback);
  }

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeCallbacks.forEach((cb) => cb());
    }, 200);
  });

  // ヘッダー高さ再計算 + IntersectionObserver rootMargin 更新
  onResize(() => {
    if (!els.header) return;
    const newHeight = els.header.offsetHeight;
    if (newHeight !== headerHeight) {
      headerHeight = newHeight;
      initNavObserver();
    }
  });

  // PC幅に切り替わったらモバイルメニューを自動で閉じる（matchMedia）
  window.matchMedia('(min-width: 1025px)').addEventListener('change', (e) => {
    if (e.matches && els.mobileMenu?.classList.contains('is-open')) {
      closeMobileMenu();
    }
  });

  /* ============================================
     4. 日付表示の更新
     ============================================ */
  /** ヒーロー日付要素のキャッシュ（DOM再取得を回避） */
  const heroYearEl = $('#heroYear');
  const heroDateEl = $('#heroDate');

  function updateDateDisplay() {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day   = String(now.getDate()).padStart(2, '0');

    if (heroYearEl) heroYearEl.textContent = year;
    if (heroDateEl) heroDateEl.textContent = `${month}.${day}`;
  }

  updateDateDisplay();

  /* ============================================
     5. ヒーロースライダー（Swiper.js）
     ============================================ */
  if (hasSwiper) {
    new Swiper('.hero__slider', {
      loop: true,
      speed: 1200,
      effect: 'fade',
      fadeEffect: { crossFade: true },
      autoplay: {
        delay: 6000,
        disableOnInteraction: false,
        pauseOnMouseEnter: true,
      },
      navigation: {
        nextEl: '.hero__nav-next',
        prevEl: '.hero__nav-prev',
      },
      pagination: {
        el: '.hero__pagination',
        clickable: true,
      },
      keyboard: { enabled: true },
      a11y: {
        prevSlideMessage: '前のスライドへ',
        nextSlideMessage: '次のスライドへ',
        paginationBulletMessage: 'スライド {{index}} へ移動',
      },
    });
  }

  /* ============================================
     6. トピックスカルーセル（Swiper.js）
     ============================================ */
  if (hasSwiper) {
    new Swiper('.topics__slider', {
      loop: false,
      speed: 600,
      spaceBetween: 20,
      slidesPerView: 1.2,
      breakpoints: {
        640:  { slidesPerView: 2.2, spaceBetween: 16 },
        1024: { slidesPerView: 3.2, spaceBetween: 20 },
      },
      navigation: {
        nextEl: '.topics__nav--next',
        prevEl: '.topics__nav--prev',
      },
      pagination: {
        el: '.topics__pagination',
        clickable: true,
      },
      keyboard: { enabled: true },
      a11y: {
        prevSlideMessage: '前のカードへ',
        nextSlideMessage: '次のカードへ',
      },
    });
  }

  /* ============================================
     7. GSAP + ScrollTrigger アニメーション
     ============================================ */

  /**
   * GSAPスクロールアニメーションの一括初期化
   * ローディング完了後に1度だけ呼び出される
   */
  function initGSAPAnimations() {
    if (prefersReducedMotion) {
      // アニメーション無効時: 非表示要素を即座に表示
      $$('.js-scroll-fade').forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      return;
    }

    // --- セクション見出しのアニメーション ---
    // ※ section-heading__ja は文字分割アニメーション(Module 16)が担当
    $$('.section-heading').forEach((heading) => {
      const enEl   = $('.section-heading__en', heading);
      const lineEl = $('.section-heading__line', heading);

      // 子要素が見つからない場合はスキップ（防御的チェック）
      if (!enEl || !lineEl) return;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: heading,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
      });

      tl.fromTo(enEl,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
      )
      .fromTo(lineEl,
        { scaleX: 0 },
        { scaleX: 1, duration: 0.8, ease: 'power2.out' },
        '-=0.1'
      );
    });

    // --- js-scroll-fade 要素のフェードイン ---
    $$('.js-scroll-fade').forEach((el) => {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          toggleActions: 'play none none none',
        },
      });
    });

    // --- グループ要素のスタッガー表示 ---
    animateStagger('.notice',        '.notice__item',  { duration: 0.5, stagger: 0.1  });
    animateStagger('.gallery__grid', '.gallery__item', { duration: 0.6, stagger: 0.12 });
    // ※ exhibition__item は Module 17 clip-path リビールが入場演出を担当。
    //   opacity/y スタッガーとの競合（クリップ開放後も opacity:0 のまま）を避け除外。

    // --- ヒーロー画像のパララックス ---
    $$('.hero__slide-image').forEach((img) => {
      gsap.to(img, {
        yPercent: 10,
        ease: 'none',
        scrollTrigger: {
          trigger: '.hero',
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });
    });

    // --- Aboutセクション画像のパララックス ---
    const aboutImg = $('.about__image img');
    if (aboutImg) {
      gsap.fromTo(aboutImg,
        { y: 40 },
        {
          y: 0,
          duration: 1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.about__content',
            start: 'top 80%',
            toggleActions: 'play none none none',
          },
          // 完了後に inline transform をクリアし、CSS hover (scale) を復帰させる
          onComplete: () => gsap.set(aboutImg, { clearProps: 'transform' }),
        }
      );
    }

    // --- フッターのフェードイン ---
    const footerSitemap = $('.footer__sitemap');
    if (footerSitemap) {
      gsap.fromTo(footerSitemap,
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.footer',
            start: 'top 90%',
            toggleActions: 'play none none none',
          },
        }
      );
    }
  }

  /**
   * スタッガーアニメーションの共通ヘルパー
   * 同じパターンのアニメーションをDRYに記述するためのユーティリティ
   *
   * @param {string} triggerSelector - ScrollTrigger のトリガー要素
   * @param {string} targetSelector  - アニメーション対象の要素群
   * @param {Object} options         - { duration, stagger } 等のオプション
   */
  function animateStagger(triggerSelector, targetSelector, options) {
    const targets = $$(targetSelector);
    if (!targets.length) return;

    gsap.fromTo(targets,
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: options.duration || 0.6,
        stagger: options.stagger || 0.1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: triggerSelector,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
      }
    );
  }

  /* ============================================
     8. トップへ戻るボタン
     ============================================ */
  if (els.backToTop) {
    els.backToTop.addEventListener('click', () => {
      if (hasGSAP) {
        gsap.to(window, {
          scrollTo: { y: 0, autoKill: false },
          duration: 1,
          ease: 'power2.inOut',
        });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  /* ============================================
     9. スムーズスクロール（ナビリンク / イベント委任）
     ============================================ */
  document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a[href^="#"]');
    if (!anchor) return;

    const targetId = anchor.getAttribute('href');

    // href="#" のみの場合はデフォルト動作を防止
    if (targetId === '#') {
      e.preventDefault();
      return;
    }

    const target = document.querySelector(targetId);
    if (!target) return;

    e.preventDefault();

    // getBoundingClientRect を使用: offsetTop は offsetParent 基準のため
    // 祖先に position:relative 等があると不正確になる
    const scrollTarget = target.getBoundingClientRect().top + window.scrollY - headerHeight;

    if (hasGSAP) {
      gsap.to(window, {
        scrollTo: { y: scrollTarget, autoKill: false },
        duration: 0.8,
        ease: 'power2.inOut',
      });
    } else {
      window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    }
  });

  /* ============================================
     10. お問い合わせフォーム（バリデーション）
     ============================================ */
  const contactForm = $('.contact__form');

  if (contactForm) {
    /** 送信処理中フラグ（キーボードEnterによる連打を防止） */
    let isSubmitting = false;

    // フォーム入力要素のキャッシュ（submit毎のDOM再取得を回避）
    const nameInput    = $('#contact-name');
    const emailInput   = $('#contact-email');
    const messageInput = $('#contact-message');
    const submitBtn    = $('.contact__submit', contactForm);

    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      const name    = nameInput.value.trim();
      const email   = emailInput.value.trim();
      const message = messageInput.value.trim();
      let isValid   = true;

      // 前回のエラー表示をクリア
      $$('.contact__error', contactForm).forEach((el) => el.remove());
      $$('.is-error', contactForm).forEach((el) => el.classList.remove('is-error'));

      // --- バリデーション ---
      if (!name) {
        showFieldError(nameInput, 'お名前を入力してください。');
        isValid = false;
      }

      if (!email) {
        showFieldError(emailInput, 'メールアドレスを入力してください。');
        isValid = false;
      } else if (!isValidEmail(email)) {
        showFieldError(emailInput, '正しいメールアドレスを入力してください。');
        isValid = false;
      }

      if (!message) {
        showFieldError(messageInput, 'お問い合わせ内容を入力してください。');
        isValid = false;
      }

      if (!isValid) {
        // 最初のエラーフィールドにフォーカスを移動（a11y）
        contactForm.querySelector('.is-error')?.focus();
        return;
      }

      isSubmitting = true;

      // --- 送信成功のデモ表示 ---
      // スクリーンリーダーにも状態変化を通知
      submitBtn.setAttribute('aria-live', 'polite');
      submitBtn.textContent = '送信しました ✓';
      submitBtn.classList.add('contact__submit--success');

      if (hasGSAP) {
        gsap.from(submitBtn, {
          scale: 0.95,
          duration: 0.3,
          ease: 'back.out(2)',
        });
      }

      // 3秒後にフォームをリセット
      setTimeout(() => {
        contactForm.reset();
        submitBtn.removeAttribute('aria-live');
        submitBtn.innerHTML = '送信する <i class="fa-solid fa-paper-plane"></i>';
        submitBtn.classList.remove('contact__submit--success');
        isSubmitting = false;
      }, 3000);
    });
  }

  /**
   * フォームフィールドにエラーメッセージを表示する
   * @param {HTMLElement} input   - 入力要素
   * @param {string}      message - エラーメッセージ
   */
  function showFieldError(input, message) {
    const error = document.createElement('p');
    error.className = 'contact__error';
    error.setAttribute('role', 'alert');
    error.textContent = message;

    input.after(error);
    input.classList.add('is-error');

    // フォーカス時にエラー表示をクリア（{ once: true } で自動解除）
    input.addEventListener('focus', () => {
      error.remove();
      input.classList.remove('is-error');
    }, { once: true });
  }

  /**
   * メールアドレスの簡易バリデーション
   * @param {string} email - 検証するメールアドレス
   * @returns {boolean} 有効なら true
   */
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /* ============================================
     11. ゴールドパーティクル演出（ヒーロー Canvas）
     ============================================
     金粉・火花が漂うCanvasアニメーション。
     prefers-reduced-motion を考慮しスキップ可能。
  */
  function initHeroParticles() {
    if (prefersReducedMotion) return;

    const canvas = $('#heroParticles');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];
    let animId = null;

    /** パーティクル数を画面幅に応じて算出 */
    function calcParticleCount() {
      return Math.min(Math.floor(window.innerWidth / 15), 80);
    }

    let particleCount = calcParticleCount();

    /** ゴールド系カラーパレット */
    const COLORS = [
      'rgba(197, 165, 90, 0.8)',
      'rgba(212, 186, 122, 0.6)',
      'rgba(158, 131, 62, 0.7)',
      'rgba(255, 215, 0, 0.5)',
      'rgba(218, 165, 32, 0.6)',
    ];

    function resizeCanvas() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    /** 個々のパーティクルを生成 */
    function createParticle() {
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2.5 + 0.5,
        speedX: (Math.random() - 0.5) * 0.4,
        speedY: -Math.random() * 0.3 - 0.1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        opacity: Math.random() * 0.5 + 0.3,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
      };
    }

    function initParticles() {
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push(createParticle());
      }
    }

    function drawParticle(p) {
      const flickerOpacity = p.opacity * (0.6 + 0.4 * Math.sin(p.twinkle));
      ctx.globalAlpha = flickerOpacity;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();

      // グロー効果
      if (p.size > 1.5) {
        ctx.globalAlpha = flickerOpacity * 0.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ヒーローが画面外のとき rAF を停止しパフォーマンスを節約
    let isHeroVisible = true;

    function animate() {
      // ヒーローが画面外ならループを停止
      if (!isHeroVisible) { animId = null; return; }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.twinkle += p.twinkleSpeed;

        // 画面外に出たら反対側から再出現
        if (p.y < -10) {
          p.y = canvas.height + 10;
          p.x = Math.random() * canvas.width;
        }
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;

        drawParticle(p);
      });

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(animate);
    }

    resizeCanvas();
    initParticles();
    animate();

    const heroSection = document.getElementById('hero');
    if (heroSection && 'IntersectionObserver' in window) {
      new IntersectionObserver(
        ([entry]) => {
          const wasVisible = isHeroVisible;
          isHeroVisible = entry.isIntersecting;
          // 非表示→表示に変わったらループ再開
          if (!wasVisible && isHeroVisible) animate();
        },
        { threshold: 0 }
      ).observe(heroSection);
    }

    // リサイズ対応（集約ハンドラ経由: 旧ループ停止 → Canvas再計算 → パーティクル数再算出 → 再開）
    onResize(() => {
      if (animId) cancelAnimationFrame(animId);
      resizeCanvas();
      particleCount = calcParticleCount();
      initParticles();
      if (isHeroVisible) animate();
    });
  }

  // 12. カスタムカーソル — 削除済み

  /* ============================================
     13. カウントアップアニメーション
     ============================================
     data-count-target 属性の数値まで、
     スクロールで可視になったとき 0 からカウントアップ。
  */
  function initCountUp() {
    if (prefersReducedMotion) {
      // アニメーション無効時: 即座にターゲット値を表示
      $$('[data-count-target]').forEach((el) => {
        el.textContent = Number(el.dataset.countTarget).toLocaleString();
      });
      return;
    }

    const countEls = $$('[data-count-target]');
    if (!countEls.length) return;

    countEls.forEach((el) => {
      const target = parseInt(el.dataset.countTarget, 10);
      if (isNaN(target)) return;

      const obj = { value: 0 };

      ScrollTrigger.create({
        trigger: el,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          gsap.to(obj, {
            value: target,
            duration: 2,
            ease: 'power2.out',
            onUpdate: () => {
              el.textContent = Math.floor(obj.value).toLocaleString();
            },
          });
        },
      });
    });
  }

  // ※ initCountUp は completeLoading 内で呼び出し、
  //   GSAP 初期化後に実行されることを保証する

  /* ============================================
     14. ギャラリーライトボックス
     ============================================
     ギャラリー画像クリックでモーダル表示。
     前後ナビ・Escキー・オーバーレイクリックで閉じる。
  */
  function initLightbox() {
    const lightbox      = $('#lightbox');
    const lightboxImg   = $('#lightboxImage');
    const lightboxCap   = $('#lightboxCaption');
    const lightboxClose   = $('#lightboxClose');
    const lightboxPrev    = $('#lightboxPrev');
    const lightboxNext    = $('#lightboxNext');
    const lightboxCounter = $('#lightboxCounter');

    if (!lightbox || !lightboxImg || !lightboxCap || !lightboxClose || !lightboxPrev || !lightboxNext) return;

    const galleryItems = $$('.gallery__item');
    if (!galleryItems.length) return;

    let currentIndex = 0;

    /**
     * ギャラリー画像のサムネイルURLを高解像度URLに変換する
     * Unsplash 形式の ?w=600&h=400 クエリパラメータを置換
     * @param {string} thumbUrl - サムネイル画像のURL
     * @returns {string} 高解像度画像のURL
     */
    function toFullSizeUrl(thumbUrl) {
      return thumbUrl
        .replace(/([?&])w=\d+/, '$1w=1200')
        .replace(/([?&])h=\d+/, '$1h=800');
    }

    /** ギャラリーアイテムのデータを取得 */
    function getItemData(item) {
      const img = $('img', item);
      const captionH3 = $('.gallery__item-caption h3', item);
      const captionP  = $('.gallery__item-caption p', item);
      const caption = captionH3 ? captionH3.textContent : '';
      const desc    = captionP  ? captionP.textContent  : '';
      return {
        src: img ? toFullSizeUrl(img.src) : '',
        alt: img ? img.alt : '',
        caption,
        desc,
        fullCaption: caption + (desc ? ' — ' + desc : ''),
      };
    }

    /** カウンター表示を更新 */
    function updateCounter() {
      if (lightboxCounter) {
        lightboxCounter.textContent = `${currentIndex + 1} / ${galleryItems.length}`;
      }
    }

    /** ライトボックスを開く */
    function openLightbox(index) {
      currentIndex = index;
      const data = getItemData(galleryItems[currentIndex]);

      lightboxImg.src = data.src;
      lightboxImg.alt = data.alt;
      lightboxCap.textContent = data.fullCaption;
      updateCounter();

      lightbox.classList.add('is-open');
      lightbox.setAttribute('aria-hidden', 'false');
      lockScroll();

      // フォーカス管理
      lightboxClose.focus();
    }

    /** ライトボックスを閉じる */
    function closeLightbox() {
      // 進行中の画像遷移トゥイーンをキャンセルし、再オープン時の表示崩れを防止
      if (hasGSAP) {
        gsap.killTweensOf(lightboxImg);
        gsap.set(lightboxImg, { clearProps: 'opacity,scale' });
      } else {
        lightboxImg.style.opacity = '';
        lightboxImg.style.transform = '';
      }

      lightbox.classList.remove('is-open');
      lightbox.setAttribute('aria-hidden', 'true');
      unlockScroll();

      // 元のギャラリーアイテムにフォーカスを戻す
      galleryItems[currentIndex]?.focus();
    }

    /** 前の画像 */
    function showPrev() {
      currentIndex = (currentIndex - 1 + galleryItems.length) % galleryItems.length;
      updateLightboxContent();
    }

    /** 次の画像 */
    function showNext() {
      currentIndex = (currentIndex + 1) % galleryItems.length;
      updateLightboxContent();
    }

    /** 画像をフェードインする共通ヘルパー */
    function fadeInLightboxImage() {
      if (hasGSAP) {
        gsap.to(lightboxImg, {
          opacity: 1,
          scale: 1,
          duration: 0.3,
          ease: 'power2.out',
        });
      } else {
        lightboxImg.style.opacity = '1';
        lightboxImg.style.transform = 'scale(1)';
      }
    }

    /** ライトボックスのコンテンツを更新 */
    function updateLightboxContent() {
      const data = getItemData(galleryItems[currentIndex]);

      if (!hasGSAP) {
        // GSAP無し: 即座に画像を切り替える
        lightboxImg.src = data.src;
        lightboxImg.alt = data.alt;
        lightboxCap.textContent = data.fullCaption;
        updateCounter();
        return;
      }

      // 連打時に前のトゥイーンが中途半端に残るのを防止
      gsap.killTweensOf(lightboxImg);

      gsap.to(lightboxImg, {
        opacity: 0,
        scale: 0.95,
        duration: 0.2,
        onComplete: () => {
          lightboxImg.alt = data.alt;
          lightboxCap.textContent = data.fullCaption;
          updateCounter();

          // 前回のナビゲーションで残った孤立リスナーを除去してから再登録
          lightboxImg.removeEventListener('load',  fadeInLightboxImage);
          lightboxImg.removeEventListener('error', fadeInLightboxImage);
          // 画像の読み込み完了を待ってフェードイン（キャッシュ済みでも load は非同期発火）
          lightboxImg.addEventListener('load',  fadeInLightboxImage, { once: true });
          lightboxImg.addEventListener('error', fadeInLightboxImage, { once: true });
          lightboxImg.src = data.src;

          // キャッシュ済み画像（同一src再設定等）は load イベントが発火しないため
          // complete フラグを確認して手動でフェードインする
          if (lightboxImg.complete) {
            lightboxImg.removeEventListener('load',  fadeInLightboxImage);
            lightboxImg.removeEventListener('error', fadeInLightboxImage);
            fadeInLightboxImage();
          }
        },
      });
    }

    // --- イベントリスナー ---

    // ギャラリーアイテムクリック
    galleryItems.forEach((item, i) => {
      item.setAttribute('tabindex', '0');
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `${$('.gallery__item-caption h3', item)?.textContent || ''} を拡大表示`);

      item.addEventListener('click', () => openLightbox(i));
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openLightbox(i);
        }
      });
    });

    // 閉じるボタン
    lightboxClose.addEventListener('click', closeLightbox);

    // オーバーレイクリックで閉じる
    $('.lightbox__overlay', lightbox)?.addEventListener('click', closeLightbox);

    // 前後ナビ
    lightboxPrev.addEventListener('click', showPrev);
    lightboxNext.addEventListener('click', showNext);

    // キーボードナビ
    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('is-open')) return;

      switch (e.key) {
        case 'Escape':
          closeLightbox();
          break;
        case 'ArrowLeft':
          showPrev();
          break;
        case 'ArrowRight':
          showNext();
          break;
      }
    });

    // フォーカストラップ（Tab キーをダイアログ内に閉じ込める）
    lightbox.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;

      const focusableEls = $$('button:not([disabled])', lightbox);
      if (!focusableEls.length) return;

      const firstEl = focusableEls[0];
      const lastEl  = focusableEls[focusableEls.length - 1];

      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    });
  }

  initLightbox();

  // 15. スクロール進捗バー — handleScroll (Module 2) に統合済み

  /* ============================================
     16. 文字分割アニメーション (Character Split)
     ============================================
     ヒーローのスライドタイトル・セクション見出しの日本語テキストを
     1文字ずつ分割し、スタッガーでフェードイン + 上昇アニメーション。
     SplitText プラグイン不使用・自力実装で技術力を示す。
  */
  function splitTextIntoChars(el) {
    const text = el.textContent;

    // スクリーンリーダー向けに元テキストを保持
    el.setAttribute('aria-label', text);
    el.textContent = '';
    el.classList.add('char-split');

    const fragment = document.createDocumentFragment();

    [...text].forEach((char) => {
      if (char === '\n') return;
      const span = document.createElement('span');
      span.className = 'char-split__char';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = char === ' ' ? '\u00a0' : char;
      fragment.appendChild(span);
    });

    el.appendChild(fragment);
    return $$('.char-split__char', el);
  }

  function initTextSplitAnimations() {
    if (prefersReducedMotion) return;

    // --- セクション見出し（日本語）の文字分割アニメーション ---
    $$('.section-heading__ja').forEach((el) => {
      const chars = splitTextIntoChars(el);
      if (!chars.length) return;

      gsap.fromTo(chars,
        { opacity: 0, y: 30, rotateX: -80 },
        {
          opacity: 1,
          y: 0,
          rotateX: 0,
          stagger: 0.03,
          duration: 0.6,
          ease: 'back.out(1.5)',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            toggleActions: 'play none none none',
          },
        }
      );
    });
  }

  /* ============================================
     17. 画像マスクリビール (Clip-Path Reveal)
     ============================================
     About画像・Exhibition画像がスクロールで
     clip-path: inset() を使い「幕が開く」ように出現。
     GSAP toggleActions で再生を制御。
  */
  function initRevealMasks() {
    if (prefersReducedMotion) return;

    // About画像
    const aboutImage = $('.about__image');
    if (aboutImage) {
      gsap.fromTo(aboutImage,
        { clipPath: 'inset(0 100% 0 0)' },
        {
          clipPath: 'inset(0 0% 0 0)',
          duration: 1.2,
          ease: 'power3.inOut',
          scrollTrigger: {
            trigger: aboutImage,
            start: 'top 80%',
            toggleActions: 'play none none none',
          },
        }
      );
    }

    // Exhibition アイテム
    // ※ デスクトップ (1025px+) では横スクロール (Module 21) が pin する為、
    //    縦方向 ScrollTrigger が全アイテムで同時発火してしまう。
    //    モバイル／タブレットのみで clip-path reveal を適用する。
    const revealMM = gsap.matchMedia();
    revealMM.add('(max-width: 1024px)', () => {
      $$('.exhibition__item').forEach((item, i) => {
        // 偶数は左から、奇数は右から
        const fromLeft = i % 2 === 0;
        const fromClip = fromLeft
          ? 'inset(0 100% 0 0)'
          : 'inset(0 0 0 100%)';

        gsap.fromTo(item,
          { clipPath: fromClip },
          {
            clipPath: 'inset(0 0% 0 0%)',
            duration: 0.9,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: item,
              start: 'top 85%',
              toggleActions: 'play none none none',
            },
          }
        );
      });
    });
  }

  /* ============================================
     18. マグネティックボタン
     ============================================
     data-magnetic 属性を持つ要素が、マウスが近づくと
     吸い寄せられるように微妙に追従する。
     マウスが離れると元の位置にスナップバック。
  */
  function initMagneticButtons() {
    if (prefersReducedMotion) return;
    if (!hasHoverCapability) return;

    /** マグネティック効果の強度 */
    const STRENGTH_DEFAULT = 0.3;
    const STRENGTH_CIRCLE  = 0.4;

    /**
     * マグネティック効果のイベントリスナーを要素群に一括登録
     * @param {Element[]} elements - 対象要素の配列
     * @param {number} strength - 追従の強度 (0〜1)
     */
    function attachMagnetic(elements, strength) {
      elements.forEach((el) => {
        el.addEventListener('mousemove', (e) => {
          const rect = el.getBoundingClientRect();
          const deltaX = (e.clientX - (rect.left + rect.width / 2)) * strength;
          const deltaY = (e.clientY - (rect.top + rect.height / 2)) * strength;

          gsap.to(el, { x: deltaX, y: deltaY, duration: 0.3, ease: 'power2.out' });
        });

        el.addEventListener('mouseleave', () => {
          gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
        });
      });
    }

    // data-magnetic 属性を持つ要素
    const magneticEls = $$('[data-magnetic]');
    if (magneticEls.length) attachMagnetic(magneticEls, STRENGTH_DEFAULT);

    // 戻るボタン・SNSリンク等の丸ボタン
    const circleButtons = $$('.back-to-top, .footer__social-link, .hero__info-icon');
    if (circleButtons.length) attachMagnetic(circleButtons, STRENGTH_CIRCLE);
  }

  initMagneticButtons();

  /* ============================================
     19. 3Dチルトカード (Perspective Tilt)
     ============================================
     Exhibition・Gallery のカードがマウス位置に応じて
     perspective + rotateX/Y で立体的に傾く。
  */
  function initTiltCards() {
    if (prefersReducedMotion) return;
    if (!hasHoverCapability) return;

    const tiltTargets = $$(CARD_TARGETS);
    if (!tiltTargets.length) return;

    /** チルトの最大角度（度） */
    const MAX_TILT = 8;
    /** グロー効果の強度 */
    const GLOW_INTENSITY = 0.15;

    tiltTargets.forEach((el) => {
      // CSSクラスで transform-style / will-change を管理
      el.classList.add('js-tilt');

      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();

        // -0.5 〜 0.5 の範囲に正規化
        const normalX = (e.clientX - rect.left) / rect.width - 0.5;
        const normalY = (e.clientY - rect.top) / rect.height - 0.5;

        gsap.to(el, {
          rotateX: -normalY * MAX_TILT,
          rotateY: normalX * MAX_TILT,
          transformPerspective: 800,
          duration: 0.4,
          ease: 'power2.out',
        });

        // 光沢効果（CSS変数経由で::afterのグロー位置を更新）
        el.style.setProperty('--glow-x', `${(normalX + 0.5) * 100}%`);
        el.style.setProperty('--glow-y', `${(normalY + 0.5) * 100}%`);
        el.style.setProperty('--glow-opacity', GLOW_INTENSITY);
      });

      el.addEventListener('mouseleave', () => {
        gsap.to(el, {
          rotateX: 0,
          rotateY: 0,
          duration: 0.6,
          ease: 'power2.out',
        });
        el.style.setProperty('--glow-opacity', '0');
      });
    });
  }

  initTiltCards();

  // 20. カーソル文字変化 — 削除済み

  /* ============================================
     21. 横スクロール展示 (Horizontal Scroll)
     ============================================
     デスクトップのみ: 縦スクロールを横方向のカード移動に変換。
     GSAP matchMedia でレスポンシブ対応。
     モバイル/タブレットでは通常Gridレイアウトにフォールバック。
  */
  function initHorizontalScroll() {
    if (prefersReducedMotion) return;

    const section = document.getElementById('exhibition');
    const grid = $('.exhibition__grid');
    if (!section || !grid) return;

    const mm = gsap.matchMedia();

    mm.add('(min-width: 1025px)', () => {
      grid.classList.add('is-horizontal');

      // スクロール量の計算（grid全体幅 − ビューポート幅）
      const getScrollAmount = () => grid.scrollWidth - window.innerWidth;

      const tween = gsap.to(grid, {
        x: () => -getScrollAmount(),
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => `+=${getScrollAmount()}`,
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      });

      // matchMedia のクリーンアップ
      return () => {
        grid.classList.remove('is-horizontal');
        grid.style.transform = '';
        tween.kill();
      };
    });
  }

  /* ============================================
     22. Aboutパララックス深度 (Multi-Layer Parallax)
     ============================================
     Aboutセクションのテキストと画像が異なる速度で
     スクロールし、Z深度の空間表現を実現。
     scrub で滑らかに連動。
  */
  function initParallaxLayers() {
    if (prefersReducedMotion) return;

    const aboutContent = $('.about__content');
    if (!aboutContent) return;

    // パララックス有効クラス付与（CSS側で will-change を管理）
    aboutContent.classList.add('has-parallax');

    /** 共通 ScrollTrigger 設定（aboutContent 全域で scrub 連動） */
    const sharedTrigger = {
      trigger: aboutContent,
      start: 'top bottom',
      end: 'bottom top',
      scrub: true,
    };

    /** [対象要素, シフト量(px)] — 正値で下方向・絶対値が大きいほど奥の層 */
    const layers = [
      ['.about__text',  40],   // 手前層（速い）
      ['.about__image', -60],  // 奥層（遅い）
    ];

    layers.forEach(([selector, shift]) => {
      const el = $(selector, aboutContent);
      if (!el) return;

      gsap.fromTo(el,
        { y: -shift },
        { y: shift, ease: 'none', scrollTrigger: { ...sharedTrigger } }
      );
    });
  }

  /* ============================================
     23. トピックスカード ストロークドロー
     ============================================
     各トピックスカードにSVG枠線をオーバーレイし、
     スクロールで可視になったときに線が描かれる効果。
     stroke-dashoffset を GSAP で制御。
  */
  function initStrokeDraw() {
    if (prefersReducedMotion) return;

    const cards = $$('.topics__card-link');
    if (!cards.length) return;

    /** SVG 名前空間 */
    const NS = 'http://www.w3.org/2000/svg';

    /** CSS border-radius と一致させる固定値 (px) */
    const CSS_RADIUS = 8;

    /** ストローク幅 (px) */
    const STROKE_WIDTH = 2;

    /**
     * カードの実ピクセル寸法に合わせて rect 属性を更新する。
     * viewBox を使わず SVG 座標 = CSS ピクセル のため、
     * 角丸やストローク幅が歪まない。
     */
    function updateRect(card, rect) {
      const { width, height } = card.getBoundingClientRect();
      if (width === 0 || height === 0) return;

      // ストロークの半分だけ内側にオフセットし、枝線がカード境界に収まるようにする
      const offset = STROKE_WIDTH / 2;
      rect.setAttribute('x', offset);
      rect.setAttribute('y', offset);
      rect.setAttribute('width', width - STROKE_WIDTH);
      rect.setAttribute('height', height - STROKE_WIDTH);
      rect.setAttribute('rx', CSS_RADIUS);
      rect.setAttribute('ry', CSS_RADIUS);
    }

    /** 生成した rect 要素を保持（リサイズ時に再計算するため） */
    const cardRectPairs = [];

    cards.forEach((card) => {
      // SVG オーバーレイを生成
      // viewBox なし — SVG座標系がCSSピクセルと1:1対応し、歪みが発生しない
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'topics__card-stroke');
      svg.setAttribute('aria-hidden', 'true');

      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('pathLength', '1');
      rect.setAttribute('stroke-dasharray', '1');
      rect.setAttribute('stroke-dashoffset', '1');

      // 初回寸法設定
      updateRect(card, rect);

      svg.appendChild(rect);
      card.appendChild(svg);
      cardRectPairs.push({ card, rect });

      // スクロールで線が描かれる（カードが十分見えてから発火）
      gsap.to(rect, {
        attr: { 'stroke-dashoffset': 0 },
        duration: 1.2,
        delay: 0.3,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: card,
          start: 'top 70%',
          toggleActions: 'play none none none',
        },
      });
    });

    // リサイズ時にカード寸法が変わっても rect を追従させる（集約ハンドラ経由）
    onResize(() => {
      cardRectPairs.forEach(({ card, rect }) => updateRect(card, rect));
    });
  }

})();
