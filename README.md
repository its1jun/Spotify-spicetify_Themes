#Spicetify Theme
### 설치 방법
1. Uptodown 등에서 원하는 버전(예: 1.2.81.107) 설치
2. SpotX 설치
   ```
   iex "& { $(iwr -useb 'https://raw.githubusercontent.com/SpotX-Official/SpotX/refs/heads/main/run.ps1') } -new_theme"
   ```
4. Spotify 한 번 실행 후 로그인(60초 이상 기다렸다가 종료)
5. Spicetify 설치
   ```
   text
   ```
6. 테마 삽입
   ```위치
   %appdata%\spicetify\Themes\
   ```
8. 테마 적용
   ```
   spicetify config current_theme 현재_테마_이름
   spicetify config inject_theme_js 1
   spicetify apply
   ```

