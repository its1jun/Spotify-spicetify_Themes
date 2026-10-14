// 재생 중인 곡의 아트워크를 가져와 블러 배경 div에 적용하는 스크립트.
(function BlurTheme() {
  'use strict';

  // ===== 1. 설정 (바꿀 일이 있으면 여기만 수정) =====
  const CONFIG = {
    layerId: 'blur-bg-layer', // 배경 div의 id (user.css와 같아야 함)
    imageVarName: '--blur-bg-image', // 이미지 주소를 넣을 CSS 변수 이름
    readyPollMs: 300, // Spicetify가 준비됐는지 확인하는 간격(ms)
    initialRetryMs: 30000, // 앱 시작 직후 곡 정보가 잡힐 때까지 다시 확인하는 최대 시간(ms)
    imageBaseUrl: 'https://i.scdn.co/image/', // spotify:image:ID 를 https 주소로 바꿀 때 쓰는 앞부분
  };

  // ===== 2. Spotify 내부 API 호출부 (업데이트로 깨지면 이 함수만 고친다) =====
  // 현재 곡의 아트워크 https 주소를 돌려준다. 못 찾으면 빈 문자열.
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

  // ===== 3. 배경 div 만들기 =====
  function ensureLayer() {
    if (document.getElementById(CONFIG.layerId)) return;
    const layer = document.createElement('div');
    layer.id = CONFIG.layerId;
    document.body.appendChild(layer);
  }

  // ===== 4. 배경 갱신 =====
  // 주소가 비면 변수를 지워 기본 바탕색으로 돌아간다.
  function updateBackground() {
    const root = document.documentElement;
    const url = getArtworkUrl();
    if (url) {
      root.style.setProperty(CONFIG.imageVarName, 'url("' + url + '")');
    } else {
      root.style.removeProperty(CONFIG.imageVarName);
    }
  }

  // ===== 시작 =====
  // 곡이 재생 중이 아니어도 배경 div는 먼저 만들고, 이미지는 곡이 바뀔 때 갱신한다.
  function waitAndStart() {
    if (!(window.Spicetify && Spicetify.Player && Spicetify.Player.addEventListener && document.body)) {
      setTimeout(waitAndStart, CONFIG.readyPollMs);
      return;
    }
    ensureLayer();
    updateBackground();
    Spicetify.Player.addEventListener('songchange', updateBackground);
    Spicetify.Player.addEventListener('onplaypause', updateBackground);

    // 앱을 켠 직후에는 곡 정보(Player.data)가 아직 비어 있고 songchange도 안 뜰 수 있다.
    // 아트워크 주소가 잡힐 때까지 짧게 반복해서 확인한다.
    const started = Date.now();
    const retry = setInterval(() => {
      if (getArtworkUrl()) {
        updateBackground();
        clearInterval(retry);
      } else if (Date.now() - started > CONFIG.initialRetryMs) {
        clearInterval(retry);
      }
    }, CONFIG.readyPollMs);
  }

  waitAndStart();
})();


// ===== 커스텀 창 컨트롤 (최소화/최대화/닫기) =====
// 네이티브 창 버튼을 숨기고 웹으로 만든 버튼을 넣는다.
// 필요한 서비스가 하나라도 없거나 실패하면 아무것도 바꾸지 않는다.
(function WindowControls() {
  'use strict';

  const WC = {
    pollMs: 300, // 서비스가 준비됐는지 확인하는 간격
    timeoutMs: 30000, // 이 시간이 지나도 준비 안 되면 포기
    titlebarHeight: 1, // 네이티브 창 컨트롤 영역 높이 (클릭 영역을 없애려고 최소로)
    activeClass: 'custom-wc-active',
    wrapId: 'custom-wc',
  };
  // 창 상태 값: 1 일반, 2 최대화, 3 최소화 (Uncertain: 현재 버전에서 맞는지 확인 필요)
  const STATE = { NORMAL: 1, MAXIMIZED: 2, MINIMIZED: 3 };

  const ICONS = {
    minimize: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M0 5.5h10" stroke="currentColor" fill="none"/></svg>',
    maximize: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" fill="none"/></svg>',
    restore: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2.5 2.5v-2h7v7h-2M0.5 2.5h7v7h-7z" stroke="currentColor" fill="none"/></svg>',
    close: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" fill="none"/></svg>',
  };

  let client = null; // 창 상태 서비스 (setWindowState / getWindowState / closeWindow)
  let nativeApi = null; // 네이티브 버튼 표시 서비스
  let titlebar = null; // 네이티브 창 컨트롤 영역 높이 서비스 (ControlMessageAPI)
  let maxButton = null;

  // FocusMainWindowAPI 안에서 setWindowState를 가진 객체를 찾는다
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

  async function runAction(kind) {
    try {
      if (kind === 'minimize') {
        await client.setWindowState({ state: STATE.MINIMIZED });
      } else if (kind === 'close') {
        if (typeof client.closeWindow === 'function') await client.closeWindow({});
        else window.close();
      } else {
        const cur = (await client.getWindowState({})).state;
        await client.setWindowState({ state: cur === STATE.MAXIMIZED ? STATE.NORMAL : STATE.MAXIMIZED });
        refreshMaxIcon();
      }
    } catch (e) {
      console.warn('[custom-wc]', kind, e);
      if (kind === 'close') window.close();
    }
  }

  // 최대화 상태에 맞춰 가운데 버튼 아이콘을 바꾼다
  async function refreshMaxIcon() {
    if (!maxButton || typeof client.getWindowState !== 'function') return;
    try {
      const isMax = (await client.getWindowState({})).state === STATE.MAXIMIZED;
      maxButton.innerHTML = isMax ? ICONS.restore : ICONS.maximize;
      maxButton.title = isMax ? 'Restore' : 'Maximize';
    } catch (e) {
      /* 상태를 못 읽으면 아이콘은 그대로 둔다 */
    }
  }

  function makeButton(kind, label, icon) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.wc = kind;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = icon;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      runAction(kind);
    });
    return b;
  }

  function buildButtons() {
    if (document.getElementById(WC.wrapId)) return;
    const wrap = document.createElement('div');
    wrap.id = WC.wrapId;
    maxButton = makeButton('maximize', 'Maximize', ICONS.maximize);
    wrap.appendChild(makeButton('minimize', 'Minimize', ICONS.minimize));
    wrap.appendChild(maxButton);
    wrap.appendChild(makeButton('close', 'Close', ICONS.close));
    document.body.appendChild(wrap);
    refreshMaxIcon();
  }

  function removeButtons() {
    const wrap = document.getElementById(WC.wrapId);
    if (wrap) wrap.remove();
    document.documentElement.classList.remove(WC.activeClass);
  }

  async function activate() {
    nativeApi = Spicetify.Platform.NativeAPI;
    client = findClient();
    if (!nativeApi || typeof nativeApi.setWindowButtonsVisibility !== 'function') throw new Error('native api missing');
    if (!client || typeof client.setWindowState !== 'function') throw new Error('window state client missing');
    titlebar = Spicetify.Platform.ControlMessageAPI;
    if (!titlebar || typeof titlebar.setTitlebarHeight !== 'function') throw new Error('titlebar service missing');

    // 웹 버튼을 먼저 만들고, 네이티브 버튼 숨기기나 영역 줄이기가 실패하면 모두 되돌린다
    buildButtons();
    try {
      await nativeApi.setWindowButtonsVisibility(false);
      // 숨기기만 하면 보이지 않는 네이티브 버튼 자리가 클릭되므로, 그 영역 높이를 최소로 줄인다
      const original = titlebar.setTitlebarHeight.bind(titlebar);
      await original(WC.titlebarHeight);
      // 앱이 확대/축소 때마다 높이를 다시 정할 수 있어서, 그 호출도 최소 높이로 고정한다
      titlebar.setTitlebarHeight = () => original(WC.titlebarHeight);
    } catch (e) {
      try { await nativeApi.setWindowButtonsVisibility(true); } catch (e2) { /* 무시 */ }
      removeButtons();
      throw e;
    }
    document.documentElement.classList.add(WC.activeClass);

    // 창 크기/포커스가 바뀌면 네이티브 버튼이 다시 나타날 수 있어서 다시 숨긴다
    let timer = null;
    const reapply = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        nativeApi.setWindowButtonsVisibility(false).catch(() => {});
        refreshMaxIcon();
      }, 300);
    };
    window.addEventListener('resize', reapply);
    window.addEventListener('focus', reapply);
  }

  function waitAndActivate() {
    const started = Date.now();
    const timer = setInterval(() => {
      const ready = window.Spicetify && Spicetify.Platform && Spicetify.Platform.NativeAPI && document.body;
      if (ready) {
        clearInterval(timer);
        activate().catch((e) => console.warn('[custom-wc] disabled:', e));
      } else if (Date.now() - started > WC.timeoutMs) {
        clearInterval(timer);
        console.warn('[custom-wc] services not ready');
      }
    }, WC.pollMs);
  }

  waitAndActivate();
})();
