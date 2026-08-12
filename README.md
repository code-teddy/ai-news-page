# AI 新聞自動更新頁

這個項目依照 Dot.ai L3 Track 2 架構製作：由 Node.js script 取得及整理資料，寫入本機 JSON，再由一個靜態 HTML 頁面顯示。GitHub Actions 可以每六小時更新資料，並將頁面部署到 GitHub Pages。

## 架構

```text
Algolia HN Search API
        ↓
scripts/fetch-news.mjs
        ↓
data/news.json
        ↓
news.html
        ↓
GitHub Pages
```

項目不使用 npm package、CDN、網上字體、API key 或外部 UI library。執行 fetch script 需要 Node.js 18 或以上。

## 資料來源

新聞原始資料來自 Hacker News，搜尋介面由 [Algolia HN Search API](https://hn.algolia.com/api) 提供。Algolia API 是第三方提供的 HN 搜尋 API，不稱為 Hacker News 官方 API。

API 公開文件列出的限制是每個 IP 每小時 10,000 次 request。本項目的 schedule 每六小時執行一次，即一般情況每日約四次，遠低於該限制。

## 版權界線

這是一個導航站，不是轉載站。每條新聞只保存及顯示：

- 標題
- 原文連結
- 出處網域
- 發佈日期／相對時間
- Hacker News points

項目不保存或顯示全文、摘要、節錄、文章開頭、AI 生成描述或翻譯。讀者需要閱讀內容時，應使用標題連結返回原網站。

## 手動更新資料

在項目資料夾執行：

```powershell
node scripts/fetch-news.mjs
```

Script 會取得最近七日最多 100 條候選 stories，按 `objectID` 及正規化 URL 去重，再保存最多 20 條到 `data/news.json`。

寫檔採用同一資料夾內的 temporary file 再 rename。API、格式或寫檔失敗時會以 exit code 1 結束，而且不會清空或覆蓋上一份正常 JSON。

## 本機預覽

不要直接以 `file://` double-click 打開 `news.html`，因為瀏覽器通常不容許本機頁面 fetch 另一個本機檔案。

在項目資料夾啟動靜態 server：

```powershell
python -m http.server 8000
```

然後打開：

```text
http://127.0.0.1:8000/news.html
```

## 離線樣本

`fixtures/news-sample.json` 是建立項目時的 `data/news.json` byte-for-byte 快照。斷網示範時，可以暫時將 HTML 的 fetch 路徑指向該 fixture，或者先備份現有資料，再將 fixture 複製到 `data/news.json`。測試完成後要還原正式路徑。

## GitHub Actions 與 Pages

Workflow 位於 `.github/workflows/update-news.yml`，包含：

- `workflow_dispatch` 手動執行按鈕
- 每六小時一次的 cron schedule
- 只在 `data/news.json` 有變時 commit
- GitHub Pages artifact 及獨立 deploy job

Push 到 GitHub 後，進入 repository 的 **Settings → Pages → Build and deployment → Source**，選擇 **GitHub Actions**。

第一次驗證：

1. 將整個項目 push 到 repository 的預設 branch。
2. 打開 repository 的 **Actions** 頁。
3. 左邊選擇 **Update and deploy AI news**。
4. 按 **Run workflow**。
5. 確認 `update-news` 和 `deploy` 兩個 jobs 都是綠色。
6. 返回 repository，確認 `data/news.json` 如有改變會出現由 `github-actions[bot]` 建立的新 commit。
7. 打開公開 GitHub Pages URL，確認頁面的更新時間是最新一輪資料。

本機可以驗證 script、JSON、HTML、響應式版面及 workflow 結構；真正的 schedule、bot push 權限和 Pages 部署必須 push 上 GitHub 後才能驗證。在未完成上面七步前，不應稱為已通過部署測試。

## 常見問題

- `fetch failed`：先確認網絡能連接 `hn.algolia.com`。
- 頁面白畫面／讀取失敗：使用本機 HTTP server，不要用 `file://`。
- Actions 看不到 workflow：確認 YAML 位於 `.github/workflows/` 並已 push 到預設 branch。
- `403` 或 permission denied：先檢查 branch protection 或組織的 Actions policy；workflow 已明確要求 `contents: write`。
- Deploy job 表示 Pages 未啟用：到 Settings → Pages 將 Source 設為 GitHub Actions。

## 檔案

- `scripts/fetch-news.mjs`：取得、篩選、去重及原子寫入資料。
- `data/news.json`：頁面目前讀取的資料。
- `news.html`：單檔 HTML/CSS/JavaScript 介面。
- `fixtures/news-sample.json`：離線樣本。
- `.github/workflows/update-news.yml`：更新、commit 及部署流程。
