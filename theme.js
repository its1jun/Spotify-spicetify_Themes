// ============================================================
// theme.js — Spotify(Spicetify) 투명 테마 스크립트
//
// user.css와 이름으로 연결되는 항목 (한쪽만 바꾸면 깨짐)
//   #custom-loading-screen, .custom-loading-logo, .fade-out, --custom-loading-image
//   #blur-bg-layer, --blur-bg-image, --text-bright-accent
//   #custom-wc, html.custom-wc-active
//   #custom-header-clone, .is-on, --custom-mask-cut
//   --custom-mask-strength
//
// 구성
//   0. 공용 헬퍼
//   1. 로딩 화면
//   2. 시작할 때 홈으로 이동
//   3. 배경 이미지 + 강조색
//   4. 커스텀 창 컨트롤
//   5. 고정 헤더 복사본
//   6. 탑바 제목 투명도 → 마스크 세기
// ============================================================
(function () {
  'use strict';

  // ------------------------------------------------------------
  // 0. 공용 헬퍼
  // ------------------------------------------------------------

  /**
   * test()가 참 같은 값을 돌려줄 때까지 intervalMs마다 확인한다. (첫 확인은 즉시)
   * 성공하면 그 값으로, timeoutMs가 지나면 null로 resolve된다. 생략하면 무한 대기.
   */
  function waitFor(test, intervalMs, timeoutMs = Infinity) {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        let result = null;
        try {
          result = test();
        } catch (e) {
          // 아직 준비되지 않음 (Spicetify 객체가 없는 등) → 다음 확인으로
        }
        if (result) return resolve(result);
        if (Date.now() - started > timeoutMs) return resolve(null);
        setTimeout(check, intervalMs);
      };
      check();
    });
  }

  // ------------------------------------------------------------
  // 1. 로딩 화면
  //    앱이 뜨는 동안 로고 화면으로 덮고, 메인 UI가 준비되면 페이드아웃한다.
  // ------------------------------------------------------------
  (function LoadingScreen() {
    const CONFIG = {
      screenId: 'custom-loading-screen',
      logoClass: 'custom-loading-logo',
      fadeClass: 'fade-out',
      imageVar: '--custom-loading-image',
      uiReadyPollMs: 100,
      hideDelayMs: 500, // UI가 준비된 뒤 이 시간만큼 더 보여 주고 숨김
      timeoutMs: 10000, // UI가 끝내 준비되지 않아도 이 시간이 지나면 숨김
      removeFallbackMs: 1000, // 페이드가 끝났어야 할 시간(0.5s)보다 넉넉히 길게
      contentSelector: [
        '.main-trackList-trackList',
        '.main-card-card',
        '.main-entityHeader-container',
        '.main-home-homeHeader',
        '.main-gridContainer-gridContainer',
      ].join(', '),
    };

    function hide() {
      const screen = document.getElementById(CONFIG.screenId);
      if (!screen || screen.classList.contains(CONFIG.fadeClass)) return;

      // 시작 상태(opacity 1)를 먼저 확정해야 CSS 전환이 건너뛰어지지 않는다
      void screen.offsetWidth;
      screen.classList.add(CONFIG.fadeClass);

      const remove = () => screen.remove();
      screen.addEventListener('transitionend', remove, { once: true });
      setTimeout(remove, CONFIG.removeFallbackMs); // transitionend가 안 오는 경우의 안전망
    }

    // 다른 곳(콘솔, 다른 스크립트)에서도 직접 숨길 수 있게 공개
    window.hideLoadingScreen = hide;

    function isUiReady() {
      const mainView = document.querySelector('.Root__main-view');
      const navBar = document.querySelector('.Root__nav-bar');
      const hasContent = document.querySelector(CONFIG.contentSelector);
      return mainView && navBar && mainView.clientHeight > 100 && hasContent;
    }

    // CSS 변수에 들어 있는 url("...")에서 주소만 꺼낸다
    function readLogoUrl() {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(CONFIG.imageVar).trim();
      return raw.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    }

    function create() {
      if (document.getElementById(CONFIG.screenId)) return;

      const screen = document.createElement('div');
      screen.id = CONFIG.screenId;

      const logo = document.createElement('img');
      logo.className = CONFIG.logoClass;
      logo.src = readLogoUrl();

      screen.appendChild(logo);
      document.body.appendChild(screen);

      waitFor(isUiReady, CONFIG.uiReadyPollMs, CONFIG.timeoutMs).then((ready) => {
        if (ready) setTimeout(hide, CONFIG.hideDelayMs);
        else hide();
      });
    }

    function whenBodyReady(callback) {
      if (document.body) return callback();
      const observer = new MutationObserver(() => {
        if (!document.body) return;
        observer.disconnect();
        callback();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    whenBodyReady(create);
  })();

  // ------------------------------------------------------------
  // 2. 시작할 때 홈으로 이동 (앱 시작 시 한 번만)
  //    replace를 써서 뒤로가기 기록에 이전 페이지가 남지 않게 한다.
  // ------------------------------------------------------------
  (function AlwaysStartAtHome() {
    const CONFIG = { homePath: '/', pollMs: 100, timeoutMs: 15000 };

    function getHistory() {
      const history = window.Spicetify && Spicetify.Platform && Spicetify.Platform.History;
      return history && history.location && typeof history.replace === 'function' ? history : null;
    }

    waitFor(getHistory, CONFIG.pollMs, CONFIG.timeoutMs).then((history) => {
      if (history && history.location.pathname !== CONFIG.homePath) {
        history.replace(CONFIG.homePath);
      }
    });
  })();

  // ------------------------------------------------------------
  // 3. 배경 이미지 + 강조색
  //    재생 중인 곡의 아트워크를 (a) 블러 배경 이미지로, (b) 대표색 추출용으로 쓴다.
  //    같은 URL에서 둘 다 처리하므로 곡이 바뀔 때 한 번만 실행된다.
  // ------------------------------------------------------------
  (function ArtworkTheme() {
    const CONFIG = {
      layerId: 'blur-bg-layer',
      imageVar: '--blur-bg-image',
      accentVar: '--text-bright-accent',
      defaultAccent: '#1ed760',
      imageBaseUrl: 'https://i.scdn.co/image/',
      readyPollMs: 300,
      artworkRetryMs: 30000, // 시작 직후 곡 정보가 늦게 올 때 아트워크를 기다리는 최대 시간

      // 대표색 추출
      sampleSize: 64, // 이 크기로 줄여서 샘플링
      brightnessMin: 40, // 너무 어둡거나 밝은 픽셀은 평균에서 제외
      brightnessMax: 220,
      lowSaturation: 0.3, // 이보다 채도가 낮으면 밝기를 키워서 칙칙함을 줄임
      lowSaturationBoost: 1.4,
    };

    let currentUrl = null; // 마지막으로 적용한 아트워크 URL (null = 아직 적용 전)

    // ---- 아트워크 URL ----

    // 메타데이터 후보를 순서대로 훑어 첫 번째 유효한 이미지 URL을 돌려준다
    function getArtworkUrl() {
      const data = Spicetify.Player.data;
      if (!data) return '';
      const item = data.item || data.track;
      if (!item) return '';

      const candidates = [
        item.metadata,
        item.album && item.album.images && item.album.images[0],
        item.images && item.images[0],
      ];

      for (const meta of candidates) {
        if (!meta) continue;
        const raw = meta.image_xlarge_url || meta.image_large_url || meta.image_url || meta.url || '';
        if (!raw) continue;
        if (raw.indexOf('spotify:image:') === 0) {
          return CONFIG.imageBaseUrl + raw.replace('spotify:image:', '');
        }
        if (/^https?:\/\//.test(raw)) return raw;
      }
      return '';
    }

    // ---- 배경 ----

    function ensureLayer() {
      if (document.getElementById(CONFIG.layerId)) return;
      const layer = document.createElement('div');
      layer.id = CONFIG.layerId;
      document.body.appendChild(layer);
    }

    function setBackground(url) {
      const root = document.documentElement;
      if (url) root.style.setProperty(CONFIG.imageVar, 'url("' + url + '")');
      else root.style.removeProperty(CONFIG.imageVar);
    }

    // ---- 강조색 ----

    function rgbToHex(r, g, b) {
      return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    }

    // 이미지의 (너무 어둡거나 밝지 않은) 픽셀 평균색. 쓸 픽셀이 없으면 null
    function averageColor(img) {
      const size = CONFIG.sampleSize;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 128) continue;
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (brightness < CONFIG.brightnessMin || brightness > CONFIG.brightnessMax) continue;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }
      if (count === 0) return null;

      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      if (saturation < CONFIG.lowSaturation) {
        const boost = (v) => Math.min(255, Math.round(v * CONFIG.lowSaturationBoost));
        r = boost(r);
        g = boost(g);
        b = boost(b);
      }
      return rgbToHex(r, g, b);
    }

    // 실패(CORS, 디코딩 오류 등)하면 null
    function extractAccent(url) {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            resolve(averageColor(img));
          } catch (e) {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }

    async function applyAccent(url) {
      const color = await extractAccent(url);
      if (url !== currentUrl) return; // 추출하는 사이 곡이 바뀌었으면 결과를 버린다
      document.documentElement.style.setProperty(CONFIG.accentVar, color || CONFIG.defaultAccent);
    }

    // ---- 갱신 ----

    function update() {
      const url = getArtworkUrl();
      if (url === currentUrl) return;
      currentUrl = url;
      setBackground(url);
      if (url) applyAccent(url); // 아트워크가 없으면 강조색은 이전 값을 유지
    }

    function isPlayerReady() {
      return window.Spicetify && Spicetify.Player && Spicetify.Player.addEventListener && document.body;
    }

    waitFor(isPlayerReady, CONFIG.readyPollMs).then(() => {
      ensureLayer();
      update();
      Spicetify.Player.addEventListener('songchange', update);
      Spicetify.Player.addEventListener('onplaypause', update);

      // 시작 직후에는 곡 정보가 늦게 올 수 있어, 아트워크가 잡힐 때까지 기다렸다가 한 번 더 갱신
      waitFor(getArtworkUrl, CONFIG.readyPollMs, CONFIG.artworkRetryMs).then(update);
    });
  })();

  // ------------------------------------------------------------
  // 4. 커스텀 창 컨트롤
  //    기본 창 버튼을 숨기고 #custom-wc(최소화/최대화/닫기)를 대신 보여 준다.
  // ------------------------------------------------------------
  (function WindowControls() {
    const CONFIG = {
      wrapId: 'custom-wc',
      activeClass: 'custom-wc-active',
      pollMs: 300,
      timeoutMs: 30000,
      titlebarHeight: 1,
      reapplyDelayMs: 300, // resize/focus 뒤 기본 창 버튼을 다시 숨기기까지의 지연
    };
    const STATE = { NORMAL: 1, MAXIMIZED: 2, MINIMIZED: 3 };

    const ICONS = {
      minimize: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M0 5.5h10" stroke="currentColor" fill="none"/></svg>',
      maximize: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" fill="none"/></svg>',
      restore: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2.5 2.5v-2h7v7h-2M0.5 2.5h7v7h-7z" stroke="currentColor" fill="none"/></svg>',
      close: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" fill="none"/></svg>',
    };

    let client = null; // 창 상태 클라이언트 (최소화/최대화/닫기)
    let nativeApi = null;
    let titlebar = null;
    let maxButton = null;

    function findClient() {
      const api = Spicetify.Platform.FocusMainWindowAPI;
      if (!api) return null;
      if (api._windowStateClient && typeof api._windowStateClient.setWindowState === 'function') {
        return api._windowStateClient;
      }
      for (const key of Object.keys(api)) {
        const v = api[key];
        if (v && typeof v.setWindowState === 'function') return v;
      }
      return null;
    }

    async function refreshMaxIcon() {
      if (!maxButton || typeof client.getWindowState !== 'function') return;
      try {
        const isMax = (await client.getWindowState({})).state === STATE.MAXIMIZED;
        maxButton.innerHTML = isMax ? ICONS.restore : ICONS.maximize;
        maxButton.title = isMax ? 'Restore' : 'Maximize';
      } catch (e) {
        // 상태를 못 읽으면 아이콘은 그대로 둔다
      }
    }

    async function runAction(kind) {
      try {
        if (kind === 'minimize') {
          await client.setWindowState({ state: STATE.MINIMIZED });
        } else if (kind === 'close') {
          if (typeof client.closeWindow === 'function') await client.closeWindow({});
          else window.close();
        } else {
          const current = (await client.getWindowState({})).state;
          await client.setWindowState({ state: current === STATE.MAXIMIZED ? STATE.NORMAL : STATE.MAXIMIZED });
          refreshMaxIcon();
        }
      } catch (e) {
        if (kind === 'close') window.close();
      }
    }

    function makeButton(kind, label, icon) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.wc = kind;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.innerHTML = icon;
      button.addEventListener('click', (ev) => {
        ev.stopPropagation();
        runAction(kind);
      });
      return button;
    }

    function buildButtons() {
      if (document.getElementById(CONFIG.wrapId)) return;
      const wrap = document.createElement('div');
      wrap.id = CONFIG.wrapId;
      maxButton = makeButton('maximize', 'Maximize', ICONS.maximize);
      wrap.appendChild(makeButton('minimize', 'Minimize', ICONS.minimize));
      wrap.appendChild(maxButton);
      wrap.appendChild(makeButton('close', 'Close', ICONS.close));
      document.body.appendChild(wrap);
      refreshMaxIcon();
    }

    function removeButtons() {
      const wrap = document.getElementById(CONFIG.wrapId);
      if (wrap) wrap.remove();
      document.documentElement.classList.remove(CONFIG.activeClass);
    }

    async function activate() {
      nativeApi = Spicetify.Platform.NativeAPI;
      client = findClient();
      if (!nativeApi || typeof nativeApi.setWindowButtonsVisibility !== 'function') throw new Error('native api missing');
      if (!client || typeof client.setWindowState !== 'function') throw new Error('window state client missing');
      titlebar = Spicetify.Platform.ControlMessageAPI;
      if (!titlebar || typeof titlebar.setTitlebarHeight !== 'function') throw new Error('titlebar service missing');

      buildButtons();
      try {
        await nativeApi.setWindowButtonsVisibility(false);
        // 스포티파이가 타이틀바 높이를 되돌리지 못하게 고정
        const original = titlebar.setTitlebarHeight.bind(titlebar);
        await original(CONFIG.titlebarHeight);
        titlebar.setTitlebarHeight = () => original(CONFIG.titlebarHeight);
      } catch (e) {
        // 실패하면 기본 창 버튼을 되살리고 커스텀 버튼은 제거
        try { await nativeApi.setWindowButtonsVisibility(true); } catch (e2) { /* 무시 */ }
        removeButtons();
        throw e;
      }
      document.documentElement.classList.add(CONFIG.activeClass);

      // 창 크기가 바뀌거나 포커스를 받으면 기본 창 버튼이 다시 나타날 수 있어 매번 다시 숨긴다
      let timer = null;
      const reapply = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          nativeApi.setWindowButtonsVisibility(false).catch(() => {});
          refreshMaxIcon();
        }, CONFIG.reapplyDelayMs);
      };
      window.addEventListener('resize', reapply);
      window.addEventListener('focus', reapply);
    }

    const isNativeReady = () => window.Spicetify && Spicetify.Platform && Spicetify.Platform.NativeAPI && document.body;

    waitFor(isNativeReady, CONFIG.pollMs, CONFIG.timeoutMs).then((ready) => {
      if (!ready) return;
      activate().catch((e) => console.warn('[theme] 커스텀 창 컨트롤을 켜지 못했습니다:', e));
    });
  })();

  // ------------------------------------------------------------
  // 5. 고정 헤더 복사본
  //    트랙리스트 헤더가 상단에 붙는(sticky) 동안 그 복사본(#custom-header-clone)을 띄우고,
  //    마스크가 가릴 높이(--custom-mask-cut)를 CSS에 알려 준다.
  //    (헤더 밑으로 지나가는 곡 목록이 비치지 않게 하기 위함)
  // ------------------------------------------------------------
  (function StickyHeaderClone() {
    const CONFIG = {
      cloneId: 'custom-header-clone',
      onClass: 'is-on',
      maskVar: '--custom-mask-cut',
      pollMs: 500, // 스크롤/리사이즈 이벤트를 놓쳤을 때를 위한 안전망
      selectors: {
        header: '.main-trackList-trackListHeader',
        main: '.Root__main-view',
        scrollNode: '.main-view-container__scroll-node',
        viewport: '[data-overlayscrollbars-viewport]',
      },
    };

    let header = null; // 원본 헤더
    let clone = null; // 복사본
    let mutationObserver = null;
    let resizeObserver = null;
    let queued = false;

    function hide() {
      if (clone) clone.classList.remove(CONFIG.onClass);
      document.documentElement.style.removeProperty(CONFIG.maskVar);
    }

    // 헤더가 스크롤 영역 상단에 실제로 붙어 있는가
    function isStuck() {
      const viewport = header.closest(CONFIG.selectors.viewport) || document.querySelector(CONFIG.selectors.scrollNode);
      if (!viewport) return false;
      const stickyTop = parseFloat(getComputedStyle(header).top) || 0;
      const diff = header.getBoundingClientRect().top - (viewport.getBoundingClientRect().top + stickyTop);
      return Math.abs(diff) <= 1;
    }

    function rebuildClone() {
      const main = document.querySelector(CONFIG.selectors.main);
      const grid = header && header.parentElement;
      if (!main || !grid) return;

      if (!clone) {
        clone = document.createElement('div');
        clone.id = CONFIG.cloneId;
        clone.setAttribute('aria-hidden', 'true');
        clone.inert = true;
      }
      clone.className = grid.className;
      clone.setAttribute('style', grid.getAttribute('style') || '');

      const copy = header.cloneNode(true);
      copy.style.setProperty('position', 'static', 'important');
      copy.style.setProperty('top', 'auto', 'important');
      clone.replaceChildren(copy);

      if (clone.parentElement !== main) main.appendChild(clone);
    }

    // 복사본을 원본 헤더 위치에 맞추고 마스크 높이를 갱신. 붙어 있지 않으면 숨김
    function place() {
      const main = document.querySelector(CONFIG.selectors.main);
      const scrollNode = document.querySelector(CONFIG.selectors.scrollNode);
      if (!header || !clone || !clone.isConnected || !main || !scrollNode || !isStuck()) {
        hide();
        return;
      }
      const h = header.getBoundingClientRect();
      const m = main.getBoundingClientRect();
      clone.style.left = (h.left - m.left) + 'px';
      clone.style.top = (h.top - m.top) + 'px';
      clone.style.width = h.width + 'px';
      clone.style.height = h.height + 'px';
      document.documentElement.style.setProperty(CONFIG.maskVar, (h.bottom - scrollNode.getBoundingClientRect().top) + 'px');
      clone.classList.add(CONFIG.onClass);
    }

    // 새 원본 헤더에 관찰자를 다시 연결
    function bind(found) {
      if (mutationObserver) mutationObserver.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      header = found;
      if (!header) {
        hide();
        return;
      }
      rebuildClone();

      mutationObserver = new MutationObserver(() => {
        rebuildClone();
        place();
      });
      mutationObserver.observe(header, { subtree: true, childList: true, attributes: true, characterData: true });
      if (header.parentElement) {
        mutationObserver.observe(header.parentElement, { attributes: true, attributeFilter: ['style', 'class'] });
      }

      resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(header);
    }

    function sync() {
      queued = false;
      const found = document.querySelector(CONFIG.selectors.header);
      if (found !== header) bind(found);
      else if (header && (!clone || !clone.isConnected)) rebuildClone();
      place();
    }

    // 한 프레임에 한 번만 sync 하도록 모은다
    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(sync);
    }

    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    setInterval(schedule, CONFIG.pollMs);
    schedule();
  })();

  // ------------------------------------------------------------
  // 6. 탑바 제목 투명도 → 마스크 세기
  //    탑바 제목이 스크롤에 따라 나타나는 정도(opacity)를 --custom-mask-strength 로 복사한다.
  //    (CSS 쪽에서 마스크 농도와 액션 바 투명도가 이 값을 따라간다)
  // ------------------------------------------------------------
  (function MaskSync() {
    const CONFIG = {
      // 주의: e-10860-text 는 스포티파이가 만드는 해시형 클래스라 업데이트 때 바뀔 수 있음
      titleSelector: '.main-topBar-container .e-10860-text.encore-text-title-small',
      strengthVar: '--custom-mask-strength',
    };

    let lastValue = -1;

    function tick() {
      const title = document.querySelector(CONFIG.titleSelector);
      if (title) {
        const value = Math.round(parseFloat(getComputedStyle(title).opacity) * 100) / 100;
        if (value !== lastValue) {
          lastValue = value;
          document.documentElement.style.setProperty(CONFIG.strengthVar, String(value));
        }
      }
      requestAnimationFrame(tick);
    }

    tick();
  })();

  // ------------------------------------------------------------
  // 7. 가사 줄 상태 표시 + 현재 줄 위치 맞춤
  //    (1) 가사 줄의 클래스가 바뀌는 순간 지난/현재/다음 줄에 data-lyric-state 속성을 붙인다.
  //        클래스 이름(해시)은 쓰지 않고, 상태 클래스 덩어리가 지난 → 현재 → 다음 순서로
  //        위에서 아래로 이어지는 구조를 보고 역할을 알아낸다. (user.css 9번에서 이 속성으로 꾸밈)
  //    (2) 현재 줄이 바뀌면 그 줄이 스크롤 영역의 정해진 높이에 오도록 scrollTop을 직접 움직인다.
  //        (처음엔 빠르게, 갈수록 천천히). 사용자가 직접 스크롤하면 잠시 멈춘다.
  // ------------------------------------------------------------
  (function LyricsState() {
    const CONFIG = {
      attrName: 'data-lyric-state',
      findMinGapMs: 250, // 가사 목록을 다시 찾는 최소 간격 (찾기는 무거워서 너무 자주 하지 않음)
      minLines: 8, // 이보다 줄이 적은 요소는 가사 목록으로 보지 않음
      baseShare: 0.8, // 줄 중 이 비율 이상이 공유하는 클래스를 공통 클래스로 봄
      maxLearnedRoles: 200, // 기억해 둔 클래스가 이 개수를 넘으면 비우고 다시 배움

      alignEnabled: true, // false면 위치 맞춤을 끔
      alignDurationMs: 600, // 현재 줄로 이동하는 시간 (클수록 느림)
      alignPosition: 0.5, // 현재 줄 중심이 스크롤 영역 높이의 이 비율 위치에 오게 함 (0 = 맨 위, 0.5 = 가운데)
      userScrollPauseMs: 3000, // 사용자가 직접 스크롤한 뒤 자동 이동을 멈추는 시간
    };

    const learnedRoles = {}; // 3덩어리로 확정된 "클래스 → 역할" 기억
    let cachedList = null;
    let cachedBase = null;
    let listObserver = null; // 가사 목록 안의 변화를 지켜보는 관찰자
    let queued = false;
    let findTimer = null;
    let lastFindAt = 0;

    let scroller = null; // 가사 목록을 담은 스크롤 영역
    let alignFrame = 0; // 진행 중인 이동 애니메이션 번호 (0 = 없음)
    let lastCurrent = null; // 마지막으로 위치를 맞춘 현재 줄
    let pausedUntil = 0; // 이 시각(ms)까지는 자동 이동을 하지 않음

    // main 안에서 줄이 가장 많고 대부분 같은 클래스를 공유하는 요소를 가사 목록으로 판단한다
    function findLyricsList() {
      let best = null;
      document.querySelectorAll('main div').forEach((el) => {
        // 자식 수를 먼저 확인해서, 대부분의 div는 배열을 만들지 않고 바로 건너뜀
        if (el.childElementCount < CONFIG.minLines) return;
        if (best && el.childElementCount <= best.list.childElementCount) return;
        const kids = [...el.children];
        const freq = {};
        kids.forEach((kid) => kid.classList.forEach((cls) => { freq[cls] = (freq[cls] || 0) + 1; }));
        const base = Object.keys(freq).find((cls) => freq[cls] >= kids.length * CONFIG.baseShare);
        if (!base) return;
        best = { list: el, base };
      });
      return best;
    }

    // 줄들을 상태 클래스 덩어리로 묶고, 덩어리 순서로 지난/현재/다음 역할을 정한다 (못 정하면 roles = null)
    function resolveRoles(lines, base) {
      const classIdx = {};
      lines.forEach((line, i) => line.classList.forEach((cls) => {
        if (cls !== base) (classIdx[cls] = classIdx[cls] || []).push(i);
      }));
      // 한 덩어리로 이어진 클래스만 상태 클래스로 본다 (빈 줄 표시처럼 흩어진 클래스는 제외)
      const stateClasses = new Set(Object.keys(classIdx).filter((cls) => {
        const idx = classIdx[cls];
        return idx[idx.length - 1] - idx[0] + 1 === idx.length;
      }));
      const keys = lines.map((line) => {
        // 줄이 가진 상태 클래스 중 가장 많은 줄에 쓰인 것을 고른다
        let pick = '';
        line.classList.forEach((cls) => {
          if (!stateClasses.has(cls)) return;
          if (!pick || classIdx[cls].length > classIdx[pick].length) pick = cls;
        });
        return pick;
      });
      const runs = [];
      keys.forEach((key, i) => {
        if (!key) return;
        const last = runs[runs.length - 1];
        if (last && last.key === key) last.end = i;
        else runs.push({ key, start: i, end: i });
      });

      const nextRole = { past: 'current', current: 'upcoming' };
      const prevRole = { current: 'past', upcoming: 'current' };
      const len = runs.map((run) => run.end - run.start + 1);
      let roles = null;
      if (runs.length === 3) {
        roles = ['past', 'current', 'upcoming'];
        // 곡마다 새 클래스가 쌓이지 않도록 너무 많아지면 비운다
        if (Object.keys(learnedRoles).length > CONFIG.maxLearnedRoles) {
          Object.keys(learnedRoles).forEach((key) => delete learnedRoles[key]);
        }
        runs.forEach((run, i) => { learnedRoles[run.key] = roles[i]; });
      } else if (runs.length === 2) {
        const known = runs.map((run) => learnedRoles[run.key]);
        if (known[0] && nextRole[known[0]]) roles = [known[0], nextRole[known[0]]];
        else if (known[1] && prevRole[known[1]]) roles = [prevRole[known[1]], known[1]];
        else if (len[0] === 1) roles = ['current', 'upcoming']; // 노래 시작 쪽
        else if (len[1] === 1) roles = ['past', 'current']; // 노래 끝 쪽
      } else if (runs.length === 1 && learnedRoles[runs[0].key]) {
        roles = [learnedRoles[runs[0].key]];
      }
      return { runs, roles };
    }

    // 진행 중인 이동 애니메이션을 멈춘다
    function cancelAlign() {
      if (alignFrame) cancelAnimationFrame(alignFrame);
      alignFrame = 0;
    }

    // 사용자가 휠/터치로 직접 스크롤하면 자동 이동을 잠시 멈춘다
    function onUserScroll() {
      pausedUntil = performance.now() + CONFIG.userScrollPauseMs;
      cancelAlign();
    }

    // 가사 목록에서 위로 올라가며 실제로 스크롤되는 요소를 찾는다 (없으면 null)
    function findScroller(list) {
      for (let el = list; el && el !== document.body; el = el.parentElement) {
        const overflowY = getComputedStyle(el).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el;
      }
      return null;
    }

    // 스크롤 영역에 사용자 스크롤 감지를 붙이고 기본 부드러운 스크롤은 꺼 둔다 (직접 움직이는 것과 겹치지 않게)
    function bindScroller(el) {
      unbindScroller();
      scroller = el;
      if (!scroller) return;
      scroller.style.setProperty('scroll-behavior', 'auto', 'important');
      scroller.addEventListener('wheel', onUserScroll, { passive: true });
      scroller.addEventListener('touchmove', onUserScroll, { passive: true });
    }

    function unbindScroller() {
      cancelAlign();
      if (!scroller) return;
      scroller.removeEventListener('wheel', onUserScroll);
      scroller.removeEventListener('touchmove', onUserScroll);
      scroller = null;
    }

    // 현재 줄이 스크롤 영역의 정해진 높이에 오도록 이동한다 (instant가 참이면 애니메이션 없이 바로)
    function alignTo(line, instant) {
      if (!CONFIG.alignEnabled || performance.now() < pausedUntil) return;
      if (!scroller || !scroller.isConnected) bindScroller(findScroller(cachedList));
      if (!scroller) return;
      cancelAlign();

      const box = scroller.getBoundingClientRect();
      const rect = line.getBoundingClientRect();
      const from = scroller.scrollTop;
      const max = scroller.scrollHeight - scroller.clientHeight;
      const wanted = from + (rect.top + rect.height / 2) - (box.top + box.height * CONFIG.alignPosition);
      const to = Math.max(0, Math.min(max, wanted));
      if (Math.abs(to - from) < 1) return;
      if (instant) {
        scroller.scrollTop = to;
        return;
      }

      const start = performance.now();
      const step = (now) => {
        const t = Math.max(0, Math.min(1, (now - start) / CONFIG.alignDurationMs));
        scroller.scrollTop = from + (to - from) * (1 - Math.pow(1 - t, 3)); // ease-out: 처음엔 빠르게, 갈수록 천천히
        alignFrame = t < 1 ? requestAnimationFrame(step) : 0;
      };
      alignFrame = requestAnimationFrame(step);
    }

    // 가사 목록 안의 변화(클래스 변경, 줄 교체)를 지켜보기 시작한다
    function watchList(list) {
      if (listObserver) listObserver.disconnect();
      listObserver = new MutationObserver(schedule);
      listObserver.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    // 현재 가사 목록을 잊고 관찰을 멈춘다 (다음 변화 때 다시 찾음)
    function forgetList() {
      cachedList = null;
      lastCurrent = null;
      unbindScroller();
      if (listObserver) {
        listObserver.disconnect();
        listObserver = null;
      }
    }

    // 목록을 확인하고 줄마다 속성을 맞춘다 (값이 같으면 건드리지 않음). 현재 줄이 바뀌면 위치도 맞춘다
    function apply() {
      let isFresh = false; // 방금 가사 목록을 찾았는지 (처음 열 때는 애니메이션 없이 바로 이동)
      if (!cachedList || !cachedList.isConnected) {
        forgetList();
        const wait = CONFIG.findMinGapMs - (performance.now() - lastFindAt);
        if (wait > 0) {
          // 방금 찾았으면 간격이 지난 뒤 한 번 더 시도
          if (!findTimer) findTimer = setTimeout(() => { findTimer = null; schedule(); }, wait);
          return;
        }
        lastFindAt = performance.now();
        const found = findLyricsList();
        if (!found) return;
        cachedList = found.list;
        cachedBase = found.base;
        watchList(cachedList);
        isFresh = true;
      }
      const lines = [...cachedList.children].filter((el) => el.classList.contains(cachedBase));
      const { runs, roles } = resolveRoles(lines, cachedBase);
      if (!roles) {
        forgetList(); // 가사 목록이 아니거나 판단 불가 → 다음 변화 때 다시 찾음
        return;
      }
      let current = null;
      runs.forEach((run, i) => {
        if (roles[i] === 'current') current = lines[run.start];
        for (let n = run.start; n <= run.end; n++) {
          if (lines[n].getAttribute(CONFIG.attrName) !== roles[i]) lines[n].setAttribute(CONFIG.attrName, roles[i]);
        }
      });
      if (current && current !== lastCurrent) {
        lastCurrent = current;
        alignTo(current, isFresh);
      }
    }

    // 한 프레임에 한 번만 apply 하도록 모은다
    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        apply();
      });
    }

    // 가사 목록이 없거나 떨어져 나갔을 때만 화면 변화를 보고 다시 찾는다
    waitFor(() => document.body, 100).then(() => {
      // body 전체를 감시하는 대신, 1초마다 가볍게 체크
      setInterval(() => {
        if (cachedList && cachedList.isConnected) return;
        schedule();
      }, 1000);
      schedule();
    });
  })();
  // ------------------------------------------------------------
  // 8. 재생 중 이미지(아티스트 사진) 복구
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // 8. 우측 '지금 재생 중' 패널의 숨겨진 배경 이미지(아티스트 사진) 복구
  // ------------------------------------------------------------
  (function RestoreNowPlayingImages() {
    function restoreImages() {
      const panel = document.querySelector('aside[aria-label="Now playing view"]');
      if (!panel) return;

      panel.querySelectorAll('[style*="url("]').forEach((el) => {
        const match = (el.getAttribute('style') || '').match(/url\(["']?([^"')]+)["']?\)/);
        if (match && match[1]) {
          el.style.setProperty('background-image', `url("${match[1]}")`, 'important');
          el.style.setProperty('background-size', 'cover', 'important');
          el.style.setProperty('background-position', 'center', 'important');
        }
      });

      panel.querySelectorAll('img[src^="spotify:image:"]').forEach((img) => {
        const hash = img.src.replace('spotify:image:', '');
        img.src = `https://i.scdn.co/image/${hash}`;
        img.style.setProperty('opacity', '1', 'important');
        img.style.setProperty('display', 'block', 'important');
      });
    }

    // 1. 곡이 바뀔 때마다 실행 (이벤트 기반 - 리소스 적음)
    if (window.Spicetify && Spicetify.Player) {
      Spicetify.Player.addEventListener('songchange', restoreImages);
    }

    // 2. 무거운 body 감시 옵저버 대신, 1초 단위 폴링(안전망)으로 변경
    setInterval(restoreImages, 1000);
    
    // 3. 초기 실행
    waitFor(() => document.querySelector('aside[aria-label="Now playing view"]'), 500).then(restoreImages);
  })();
  // ------------------------------------------------------------
  // 9. 미니 플레이어(PiP) 버튼 교체 및 커스텀 패널 띄우기
  // ------------------------------------------------------------
  (function CustomPipButton() {
    if (document.pictureInPictureEnabled) {
      document.exitPictureInPicture = () => Promise.resolve();
    }

    const PIP_WIDTH = 200;
    const PIP_HEIGHT = 80;

    function replacePipButton() {
      const pipBtn = document.querySelector('button[data-testid="pip-toggle-button"]');
      if (!pipBtn || pipBtn.dataset.customPip === 'true') return;

      const newBtn = pipBtn.cloneNode(true);
      newBtn.dataset.customPip = 'true'; 
      
      newBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        if (window.customPipWindow && !window.customPipWindow.closed) {
          window.customPipWindow.close();
          return;
        }

        if (!('documentPictureInPicture' in window)) {
          return alert("Document PiP is not supported in this environment.");
        }

        try {
          const pipWindow = await documentPictureInPicture.requestWindow({
            width: PIP_WIDTH,
            height: PIP_HEIGHT
          });
          window.customPipWindow = pipWindow;

          // user.css에서 custom-pip 및 pip-btn 관련 스타일 추출하여 주입
          const pipStyle = pipWindow.document.createElement('style');
          let cssText = `body { margin: 0; padding: 0; overflow: hidden; background: transparent; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }\n`;
          [...document.styleSheets].forEach(sheet => {
            try {
              [...sheet.cssRules].forEach(rule => {
                if (rule.selectorText && (rule.selectorText.includes('custom-pip') || rule.selectorText.includes('pip-btn'))) {
                  cssText += rule.cssText + '\n';
                }
              });
            } catch (err) {}
          });
          pipStyle.textContent = cssText;
          pipWindow.document.head.appendChild(pipStyle);

          // SVG 아이콘 정의
          const ICONS = {
            prev: `<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`,
            next: `<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`,
            play: `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`,
            pause: `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
            close: `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`
          };

          // HTML 뼈대 생성
          pipWindow.document.body.innerHTML = `
            <div id="custom-pip-panel">
              <div class="custom-pip-bg"></div>
              <div class="custom-pip-overlay"></div>
              <div class="custom-pip-ui">
                <div class="custom-pip-title"></div>
                <div class="custom-pip-artist"></div>
              </div>
              <div class="custom-pip-controls">
                <button class="pip-btn" id="pip-btn-prev">${ICONS.prev}</button>
                <button class="pip-btn" id="pip-btn-play">${ICONS.pause}</button>
                <button class="pip-btn" id="pip-btn-next">${ICONS.next}</button>
              </div>
              <button class="pip-btn custom-pip-close" id="pip-btn-close">${ICONS.close}</button>
            </div>
          `;

          const panel = pipWindow.document.getElementById('custom-pip-panel');
          const bgLayer = pipWindow.document.querySelector('.custom-pip-bg');
          const titleEl = pipWindow.document.querySelector('.custom-pip-title');
          const artistEl = pipWindow.document.querySelector('.custom-pip-artist');

          // 정보 업데이트
          const updateTrackInfo = () => {
            const data = Spicetify.Player.data;
            if (!data || !data.item) return;
            
            let artworkUrl = data.item.metadata.image_xlarge_url || data.item.metadata.image_url;
            if (artworkUrl && artworkUrl.startsWith('spotify:image:')) {
              artworkUrl = 'https://i.scdn.co/image/' + artworkUrl.replace('spotify:image:', '');
            }
            bgLayer.style.setProperty('background-image', `url("${artworkUrl}")`, 'important');
            titleEl.innerText = data.item.name || 'Unknown Track';
            artistEl.innerText = data.item.artists ? data.item.artists.map(a => a.name).join(', ') : 'Unknown Artist';
            
            const isPlaying = Spicetify.Player.isPlaying();
            pipWindow.document.getElementById('pip-btn-play').innerHTML = isPlaying ? ICONS.pause : ICONS.play;
          };

          updateTrackInfo();
          Spicetify.Player.addEventListener('songchange', updateTrackInfo);
          Spicetify.Player.addEventListener('onplaypause', updateTrackInfo);

          // 버튼 이벤트
          pipWindow.document.getElementById('pip-btn-close').addEventListener('click', (ev) => { ev.stopPropagation(); pipWindow.close(); });
          pipWindow.document.getElementById('pip-btn-prev').addEventListener('click', (ev) => { ev.stopPropagation(); Spicetify.Player.back(); });
          pipWindow.document.getElementById('pip-btn-play').addEventListener('click', (ev) => { ev.stopPropagation(); Spicetify.Player.togglePlay(); });
          pipWindow.document.getElementById('pip-btn-next').addEventListener('click', (ev) => { ev.stopPropagation(); Spicetify.Player.next(); });

          // 드래그 이동 로직
          let isDragging = false, startX, startY, startWinX, startWinY;
          panel.addEventListener('mousedown', (ev) => {
            if (ev.target.closest('.pip-btn')) return;
            isDragging = true;
            panel.style.cursor = 'grabbing';
            startX = ev.screenX; startY = ev.screenY;
            startWinX = pipWindow.screenX; startWinY = pipWindow.screenY;
          });
          pipWindow.document.addEventListener('mousemove', (ev) => {
            if (isDragging) pipWindow.moveTo(startWinX + (ev.screenX - startX), startWinY + (ev.screenY - startY));
          });
          pipWindow.document.addEventListener('mouseup', () => {
            isDragging = false;
            panel.style.cursor = 'grab';
          });

          // 창 닫힐 때 이벤트 정리
          pipWindow.addEventListener('pagehide', () => {
            Spicetify.Player.removeEventListener('songchange', updateTrackInfo);
            Spicetify.Player.removeEventListener('onplaypause', updateTrackInfo);
            window.customPipWindow = null;
          });

        } catch (err) {
          console.error("Failed to create PiP window:", err);
        }
      });

      pipBtn.replaceWith(newBtn);
    }

    setInterval(replacePipButton, 1000);
  })();
})();
