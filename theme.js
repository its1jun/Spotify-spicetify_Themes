// 재생 중인 곡의 아트워크를 가져와 블러 배경 div에 적용하는 스크립트.
(function BlurTheme() {
  'use strict';

  // ===== 1. 설정 (바꿀 일이 있으면 여기만 수정) =====
  const CONFIG = {
    layerId: 'blur-bg-layer', // 배경 div의 id (user.css와 같아야 함)
    imageVarName: '--blur-bg-image', // 이미지 주소를 넣을 CSS 변수 이름
    readyPollMs: 300, // Spicetify가 준비됐는지 확인하는 간격(ms)
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
  }

  waitAndStart();
})();
