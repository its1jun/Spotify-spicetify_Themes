# MyBlurTheme 구조

재생 중인 곡의 앨범 아트를 블러 처리해 배경으로 깔고, 나머지 UI는 전부 투명하게 만드는 Spicetify 테마입니다. 네이티브 창 버튼 대신 웹으로 만든 창 버튼을 사용합니다.

## 파일 구성

```
Themes/MyBlurTheme/
├─ color.ini   색상 변수 정의
├─ user.css    스타일 (전역 투명, 배경 레이어, 창 버튼, 예외 처리)
└─ theme.js    동작 (배경 이미지 주입, 창 버튼 생성)
```

## 파일별 역할

### color.ini
- `--spice-*` 색상 변수의 값만 정의합니다. 값은 `#` 없는 6자리 hex입니다.
- 현재 배경 계열(main, sidebar, player, card 등)은 모두 `000000`입니다.

### user.css
순서대로 다음 섹션이 있습니다.

| 섹션 | 내용 |
| --- | --- |
| 1. 전역 투명 | `*`, `::before`, `::after`의 background, background-image, box-shadow, border-color를 `!important`로 지움 |
| 2. 변수 | 블러 세기, 어둡기, 폴백 색, 창 버튼 크기·위치·색 등 조정값 |
| 3. 배경 레이어 | `#blur-bg-layer`에 이미지, 블러, 밝기 적용 |
| 4. 커스텀 창 컨트롤 | `#custom-wc` 버튼 그룹 스타일, 전체화면에서는 숨김 |
| 5. 예외 처리 | 전역 투명에서 되살릴 요소를 하나씩 추가할 자리 (현재 비어 있음) |

### theme.js
두 개의 독립된 즉시 실행 함수로 이루어져 있습니다.

- **BlurTheme**: 배경용 `div#blur-bg-layer`를 만들고, 현재 곡의 아트워크 주소를 CSS 변수 `--blur-bg-image`에 넣습니다. `songchange`, `onplaypause` 이벤트에서 갱신하고, 앱 시작 직후에는 주소가 잡힐 때까지 최대 30초간 반복 확인합니다.
- **WindowControls**: 네이티브 창 버튼을 숨기고 최소화/최대화/닫기 버튼(`div#custom-wc`)을 만듭니다. 필요한 Spotify 내부 서비스가 없거나 실패하면 변경을 되돌립니다.

## theme.js와 user.css의 연결 지점

이름이 서로 일치해야 동작합니다. 한쪽을 바꾸면 다른 쪽도 같이 바꿔야 합니다.

| 항목 | theme.js | user.css |
| --- | --- | --- |
| 배경 div id | `layerId: 'blur-bg-layer'` | `#blur-bg-layer` |
| 이미지 변수 | `imageVarName: '--blur-bg-image'` | `var(--blur-bg-image)` |
| 창 버튼 id | `wrapId: 'custom-wc'` | `#custom-wc` |
| 활성 클래스 | `activeClass: 'custom-wc-active'` (`html`에 붙음) | `html.custom-wc-active #custom-wc` |
| 버튼 종류 | `data-wc="minimize/maximize/close"` | `button[data-wc="close"]` |

## 동작 흐름

1. Spotify가 로드되면 user.css의 전역 투명 규칙이 모든 요소의 배경을 지웁니다.
2. theme.js가 `#blur-bg-layer`를 만들고, 곡 정보가 잡히면 `--blur-bg-image`를 설정합니다.
3. 배경 레이어는 `z-index: -1`로 전체 뒤에 깔려 블러된 앨범 아트로 보입니다.
4. 창 버튼 준비가 끝나면 `html`에 `custom-wc-active`가 붙고 `#custom-wc`가 표시됩니다.

## 우선순위 규칙

- 전역 투명 규칙은 `*`라서 우선순위가 가장 낮습니다.
- 살려야 하는 요소(`#blur-bg-layer`, `#custom-wc`)는 `html body #id`로 우선순위를 높이고 `!important`를 붙입니다.
- 예외 처리를 추가할 때도 같은 방식으로, 전역 규칙이 `!important`이므로 예외에도 `!important`가 필요합니다.

## 알려진 사항

- **예외 처리 미작성**: 전역 투명 때문에 재생 버튼 아이콘 등이 안 보입니다. 5번 섹션에 하나씩 추가할 예정입니다.
- **폴백 배경색 미적용**: `html { background-color: var(--blur-bg-fallback-color); }`에 `!important`가 없어 전역 규칙에 눌립니다. 곡 정보가 없을 때 검정 바탕이 안 깔립니다.
- **무의미한 선택자**: `html.custom-wc-active html body #custom-wc`는 어떤 요소에도 맞지 않습니다. 바로 아래 줄이 실제로 동작합니다.
- **확인 필요**: `.spotify__container--is-desktop.fullscreen` 클래스가 현재 Spotify 버전에 있는지, 창 상태 값(`STATE`)이 맞는지는 코드에 "확인 필요"로 표시되어 있습니다.
- **Spotify 내부 API 의존**: `Spicetify.Player.data`, `Platform.NativeAPI`, `ControlMessageAPI`, `FocusMainWindowAPI`는 Spotify 업데이트로 바뀔 수 있습니다. 배경이 안 나오면 theme.js의 `getArtworkUrl()`, 창 버튼이 안 나오면 콘솔의 `[custom-wc]` 경고를 확인합니다.
