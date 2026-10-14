# AI Coding Rules — MyBlurTheme (Spicetify)

## 1. Language

- Write all code comments in Korean.
- Write explanations to the user in Korean, using simple words. Briefly explain technical terms when needed.
- Keep variable names, function names, class names, file names, and identifiers in English.
- Preserve the existing naming conventions of the project.

## 2. Project Context

- The user is a non-developer doing vibe coding. Do not assume programming background.
- This is a Spicetify theme (`Themes/MyBlurTheme`) made of only three files: `color.ini` (colors), `user.css` (styles), `theme.js` (behavior). Do not create new files. If a new file seems necessary, ask the user first.
- Read `architecture.md` first and follow it. Its rules take priority over this file where they differ.
- Do not guess about code you have not seen. If a file is needed, ask the user to paste it.
- If a change makes `architecture.md` outdated, tell the user which line to update.

## 3. Comments

- Add one concise Korean comment above each function when it is useful. Describe the overall behavior and main responsibility.
- Add internal comments only for important information: value units, formats, ranges, expected inputs or outputs, dependencies, or usage requirements.
- Keep the function body focused on code.

## 4. Bug Fixing

- Investigate the underlying cause before modifying code. Trace the relevant data flow, state changes, function calls, and dependencies.
- Fix the root cause, not only the symptom. Do not hide or bypass the problem.
- Reuse existing variables, constants, functions, and configuration before creating new ones.
- Keep values that may change configurable (variables or constants), not hardcoded.
- If the cause cannot be determined from the code provided, say so and ask for the missing file or error message. Do not guess.

## 5. Code Modification

- Make the smallest change that fixes the root cause. Do not make a narrower patch that only masks the symptom.
- Preserve the existing project structure, variable names, function names, class names, naming conventions, coding style, and formatting.
- Modify only what the requested task requires. Keep unrelated code unchanged.
- If the proper fix requires a structural change (new abstraction, multiple files, renaming, restructuring), do not apply it immediately. First explain the reason and the scope in a few lines, and wait for the user's approval.

## 6. Theme Rules

### 6.1 Class names: css-map.json only

- Never use hashed class names (the random-looking keys in `css-map.json`, such as `n8Bz0c0v17whD3KfMdOk`). Not in `user.css`, not in `theme.js`.
- Use only the readable names (the values in `css-map.json`), written exactly as they appear. Example: `.main-nowPlayingBar-container`.
- If the element you need is not in `css-map.json`, do not guess a name. Tell the user and ask for the name or a copy of the relevant part of `css-map.json`.
- If existing code uses a class that is not in `css-map.json`, point it out to the user.
- Ids and classes created by `theme.js` itself (`#blur-bg-layer`, `#custom-wc`, `custom-wc-active`) are not Spotify classes, so they are allowed.

### 6.2 theme.js and user.css must match

These names must stay identical in both files. If one side changes, change the other in the same answer.

| Item | theme.js | user.css |
| --- | --- | --- |
| Background div id | `layerId` | `#blur-bg-layer` |
| Image variable | `imageVarName` | `var(--blur-bg-image)` |
| Window button id | `wrapId` | `#custom-wc` |
| Active class on `html` | `activeClass` | `html.custom-wc-active` |
| Button kind | `data-wc` | `button[data-wc="..."]` |

### 6.3 Priority rules

- Section 1 of `user.css` (global transparency) uses `*` with `!important`. Its priority is the lowest possible, so any class selector can override it.
- Because the global rules use `!important`, every override must also use `!important`. A rule without `!important` always loses.
- Elements created by `theme.js` (`#blur-bg-layer`, `#custom-wc`) keep the `html body #id` prefix. Do not remove it.
- For exception handling, keep the selector simple: one readable class name, `!important`. Add a longer selector only when a simple one is proven not to work.
- If an override does not apply, do not pile on selectors. Ask the user to check the element in the dev tools (`spicetify enable-devtools`).

### 6.4 How to write exception handling

- Exception handling means: turning transparency off for chosen elements. Add each one in section 5 of `user.css`, one block per target.
- Order of work: 1st playback controls, 2nd text, icons, images, then others as the user asks.
- The global rule sets `background`, `background-image`, `box-shadow`, `border-color`. To bring back only what is needed, set only that property (for example `background-color`) and leave the rest transparent.
- Put colors and sizes in `:root` variables (`--custom-...`) and use `var(--name)` in the block. Do not hardcode them.
- Add a short Korean comment above each block saying which element it brings back.

### 6.5 Spotify internal API caution

- `theme.js` depends on Spotify internals (`Spicetify.Player`, `Spicetify.Platform.NativeAPI`, `ControlMessageAPI`, `FocusMainWindowAPI`). They can change with any Spotify update.
- Do not guess how they work. If something breaks, ask the user for the console message (look for lines starting with `[custom-wc]`) or the current code.
- Keep each Spotify-specific call inside its small function (for example `getArtworkUrl()`, `findClient()`) so a fix stays in one place.
- Mark anything not verified as uncertain, as the existing code does.

### 6.6 Terms

Use these words consistently, in code comments and in explanations.

| Term | Meaning |
| --- | --- |
| 전역 투명 | Section 1 of `user.css`: removes backgrounds everywhere |
| 예외 처리 | Bringing back chosen elements from the global transparency (do not call it 복구 or 예외 복구) |
| 배경 레이어 | `#blur-bg-layer`, the blurred artwork behind everything |
| 커스텀 창 컨트롤 | `#custom-wc`, the web-made minimize/maximize/close buttons |

### 6.7 Design values

- Colors, sizes, spacing, durations: define in `:root` of `user.css` and use `var(--name)`.
- Variable names keep the existing prefixes: `--blur-bg-` and `--custom-wc-`.

## 7. Response Format

- Put the replacement code first. Keep each explanation to one line. Use one or two sentences only when explaining a bug cause.
- Always give complete units that can be pasted over the old ones, each with its file name and location.
- Provide only the parts that require modification.

**JS**: replace the whole function.

**File:** `theme.js`

**Replace:** `functionName()`

```js
// 함수 설명 주석
function functionName() {
  ...
}
```

**CSS**: replace the whole rule block (selector to closing brace). For a new exception, say "add under section 5".

**File:** `user.css`

**Replace:** `.selector`

```css
.selector {
  ...
}
```

- After the code, add one line on how to check that it works.

## 8. Workflow

1. Read `architecture.md` and understand the existing logic related to the request.
2. For a bug, identify the underlying cause first.
3. Check class names against `css-map.json` (Section 6.1).
4. Find existing patterns and reusable parts in the project.
5. Choose the smallest change that properly solves the problem. Ask for approval if it is structural (Section 5).
6. Check that `theme.js` and `user.css` still match (Section 6.2).
7. Provide each modified unit in full, with file name and location, following Section 7.
