# 福利找上門

> 讓資源主動找到需要的人，並陪他們完成申請。

城市通（TownPass）微服務：結合福利資格媒合與關懷服務，協助經濟弱勢者、獨居長者、身心障礙者、原住民、新住民等民眾，更容易取得補助與陪伴資源。從「得知資源」到「完成申請」，每一步都有人接住。

2026 臺北秋季程式設計節・城市通微服務大黑客松參賽作品（MVP）。

> ⚠️ 本服務提供的是**初步資格比對**與申辦協助，實際補助資格一律以主管機關審核為準。

## 功能

### 民眾端（在城市通 App 中開啟）

| 功能 | 說明 |
|---|---|
| 資格初步比對 | 回答 12 個白話問題（每題都能選「不確定」），系統依 14 項補助與服務的條件比對，分成「很可能符合」、「可能符合，待確認」、「目前不符合」，並逐條說明哪些條件符合、哪些還不確定 |
| 城市通資料帶入 | 透過 `userinfo` 自動帶入生日、行政區、里、是否設籍臺北市、原住民身分，以及聯絡電話 |
| 請人協助申請 | 勾選想申請的項目，選擇需要的協助（填表、到府收件、陪同申辦、到府說明、電話說明），經同意後送給區公所、社工與合作志工 |
| 進度追蹤 | 依「需求已收到 → 已安排人員協助 → 文件準備中 → 已送件、待審核」顯示進度。狀態改變時，透過城市通 `notify` 推播通知 |
| 文件清單 | 列出要準備的文件，本人或家屬可以勾選「已備妥」 |
| 附近的關懷據點 | 以開放資料「社區照顧關懷據點」，依定位列出最近的據點，可直接撥號 |
| 大字模式 | 一鍵放大文字與按鈕，方便長者閱讀 |

### 家屬協助

- 長輩產生 6 位數邀請碼（30 分鐘內有效、只能用一次），家屬在**自己的**城市通輸入後完成綁定。
- 長輩可以把推薦結果分享給家屬，或把某一項「轉交家屬協助」。
- 家屬可以查看長輩同意分享的申請進度、勾選已備妥的文件，或代長輩送出協助需求。
- 長輩與家屬任一方都可以隨時解除綁定。

### 服務管理介面（`/staff`，區公所、社工、志工使用）

| 功能 | 說明 |
|---|---|
| 個案列表 | 依狀態篩選，查看本行政區待協助的個案 |
| **順路雷達** | 把今天的訪視路線畫在開源地圖上，找出路線兩側 200／400／800 公尺內等待協助的民眾，標示「離路線多遠、在第幾站之間」。可以順路接案，或把個案插入今日路線 |
| 個案處理 | 接案、指派（區公所）、更新狀態並留下處理紀錄。民眾與家屬會即時看到進度並收到推播 |
| 據點代為建檔 | 給沒有智慧型手機或不會操作 App 的民眾。工作人員記錄同意方式後代為登錄，系統以同一套規則比對資格，後續以電話或訪視聯繫 |

### 依角色的權限與資料遮蔽

| 角色 | 可以看到 |
|---|---|
| 區公所 | 本區所有個案的完整資料，可以指派給同仁 |
| 社工 | 本區所有個案的完整資料，可以接案與更新狀態 |
| 志工 | 接案前只看到**需要哪種協助**與**大略位置**（約 300 公尺格點），看不到姓名全名、電話、地址、申請項目與敏感身分；接案後才看到聯絡資訊與文件清單，但仍看不到低收入戶、身障等身分標籤 |

## 隱私設計

- **資格資料只存在使用者的手機**（localStorage），比對也在手機上完成，不上傳伺服器。
- 只有在使用者「請人協助申請」並勾選同意時，才把申請項目、聯絡方式與位置送出；資格摘要標籤（例如「65 歲以上」「獨居」）可以另外選擇不分享。
- 位置可以選擇只提供行政區。志工端的座標一律在伺服器端模糊化，不會把精確位置送到志工的裝置。
- 據點代為建檔時，必須記錄同意方式（書面、口頭並有見證人、法定代理人）。

## 架構

```
城市通 App（Flutter）
  └─ WebView 開啟「福利找上門」
       ├─ flutterObject 雙向溝通：userinfo／location／notify／phone_call／open_link
       └─ Vue 3 微服務網頁（資格比對在手機上執行）
             │ REST API
             ▼
       Node.js + Express（同一個服務也提供前端靜態檔）
             └─ SQLite（Node 內建 node:sqlite）
```

| 目錄 | 內容 |
|---|---|
| `shared/` | 前後端共用：型別、資格比對引擎（`match.ts`）、14 項福利資源資料（`data/resources.ts`）、地理計算 |
| `server/` | API、權限與資料遮蔽（`privacy.ts`）、示範資料（`seed.ts`） |
| `web/` | Vue 3 前端：民眾端 `views/citizen`、服務管理介面 `views/staff`、城市通溝通 `lib/bridge.ts` |
| `scripts/` | 下載開放資料與地址轉座標的腳本 |
| `data/raw/` | 開放資料原始檔 |

## 快速開始

需要 Node.js 22.18 以上（使用內建的 TypeScript 執行與 `node:sqlite`）。

```bash
npm install
npm run dev
```

- 民眾端：<http://localhost:5173/>
- 服務管理介面：<http://localhost:5173/staff>（示範帳號 PIN 都是 `1234`）
- API：<http://localhost:8787/api/health>

在一般瀏覽器中沒有 `flutterObject`，會改用示範帳號與瀏覽器定位，方便開發。

其他指令：

```bash
npm test            # 資格比對引擎的單元測試
npm run typecheck   # 型別檢查
npm run build       # 建置前端到 dist/
npm start           # 正式模式：同一個 Node 服務提供前端與 API
```

### 在城市通 App 中測試

TownPass 端的修改（也在本隊的 TownPass fork 中）：

1. `assets/svg/icon_welfare_care.svg`：服務圖示
2. `lib/page/city_service/model/my_service_model.dart`：新增 `MyServiceItemId.welfareCare`
3. `lib/page/city_service/widget/pinned_service_widget_controller.dart`：預設釘選在「我的服務」
4. `lib/page/city_service/model/trending_service_model.dart`：加入「熱門」
5. `android/app/src/debug/`：只在 debug 版允許 WebView 以 HTTP 連到電腦上的開發伺服器
6. `assets/mock_data/account.json`：示範用的長者生日（1950/03/15）

服務網址預設是電腦上的開發伺服器：Android 模擬器連 `http://10.0.2.2:5173/`，iOS 模擬器連 `http://localhost:5173/`。部署後用 `--dart-define` 指定正式網址：

```bash
fvm flutter run --dart-define=WELFARE_CARE_URL=https://你的服務網址/
```

### 示範流程（約 2 分鐘）

1. 打開城市通 → 服務 → 福利找上門，生日與居住地已自動帶入。
2. 回答幾題，看到「很可能符合」的補助，勾選後「請人協助申請」，用手機定位並同意分享 → 收到推播。
3. 在電腦上以社工「林志明」登入 `/staff/radar`，順路雷達顯示這位民眾離今天的路線幾公尺 → 順路接案。
4. 手機上的進度變成「已安排人員協助」，並收到推播。
5. （家屬）在「家屬協助」產生邀請碼，切換成示範家屬「金小森」並輸入邀請碼，即可看到長輩的進度。

## 部署（Cloud Run）

前後端打包成同一個容器：

```bash
gcloud run deploy welfare-care --source . --region asia-east1
```

> SQLite 存在容器的暫存空間，執行個體重啟後資料會重設（重新載入示範資料）。正式上線應改用 Cloud SQL 等持久資料庫。

## 資料來源

### 開放資料

| 資料集 | 提供機關 | 使用方式 | 授權 |
|---|---|---|---|
| [臺北市銀髮族服務_社區照顧關懷據點](https://data.gov.tw/dataset/121285) | 臺北市政府社會局（臺北市資料大平臺） | 附近的陪伴資源、順路雷達地圖圖層 | 政府資料開放授權條款－第 1 版 |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | OpenStreetMap 貢獻者 | 地圖圖磚；以 Nominatim 將據點地址轉為座標（離線執行一次並快取，442/510 筆精確到門牌） | ODbL |

### 福利資格（核心資料）

14 項補助與服務的資格條件，依下列官方頁面整理（查核日期 2026-11-07，金額與門檻以 115 年度公告為準）。依「政府網站資料開放宣告」，政府網站資料可在註明出處下使用。

| 項目 | 類別 | 主管機關 | 來源 |
|---|---|---|---|
| 低收入戶資格申請 | 福利身分 | 臺北市政府社會局 | [臺北市政府社會局－低收入戶生活補助申請說明](https://dosw.gov.taipei/cp.aspx?n=E6D700BD37E78592) |
| 中低收入戶資格申請 | 福利身分 | 臺北市政府社會局 | [臺北市政府社會局－中低收入戶服務申請說明](https://dosw.gov.taipei/cp.aspx?n=B75CE261826F1C11) |
| 中低收入老人生活津貼 | 津貼補助 | 臺北市政府社會局 | [臺北市政府社會局－中低收入老人生活津貼申請說明](https://dosw.gov.taipei/cp.aspx?n=FCF3DAE98DDA289F) |
| 老人健保自付額補助 | 健康醫療 | 臺北市政府社會局 | [臺北市政府社會局－老人健保補助申請說明](https://dosw.gov.taipei/cp.aspx?n=22B00B4927757FFE) |
| 身心障礙者生活補助 | 津貼補助 | 臺北市政府社會局 | [臺北市政府社會局－身心障礙者生活補助申請說明](https://dosw.gov.taipei/cp.aspx?n=C764A5808F9A3B08) |
| 身心障礙者輔具費用補助 | 健康醫療 | 臺北市政府社會局 | [臺北市政府社會局－身心障礙者輔具費用補助申請說明](https://dosw.gov.taipei/cp.aspx?n=49304F9B0793FFEF) |
| 臺北市急難救助 | 急難救助 | 臺北市政府社會局 | [臺北市政府社會局－急難救助申請說明](https://dosw.gov.taipei/cp.aspx?n=0BF751F1B9F07AA1) |
| 急難紓困方案（原馬上關懷） | 急難救助 | 衛生福利部／臺北市政府社會局 | [臺北市政府社會局－急難紓困方案申請說明](https://dosw.gov.taipei/cp.aspx?n=7011FE50261D43B5) |
| 長期照顧服務（長照 2.0） | 照顧服務 | 衛生福利部／臺北市長期照顧管理中心 | [衛福部長照專區（1966）－申請長照服務](https://1966.gov.tw/LTC/cp-6533-70777-207.html) |
| 失能者營養餐飲服務（送餐到家） | 照顧服務 | 臺北市政府社會局 | [臺北市政府社會局－失能者營養餐飲服務](https://dosw.gov.taipei/cp.aspx?n=8AC319BAED528FB5) |
| 獨居長者緊急救援系統 | 照顧服務 | 臺北市政府社會局 | [臺北市政府社會局－獨居老人服務內容](https://dosw.gov.taipei/cp.aspx?n=E15926774D45D8A6) |
| 社區照顧關懷據點 | 陪伴關懷 | 臺北市政府社會局 | [臺北市資料大平臺－臺北市銀髮族服務_社區照顧關懷據點](https://data.gov.tw/dataset/121285) |
| 國民年金原住民給付 | 津貼補助 | 勞動部勞工保險局 | [勞動部勞工保險局－原住民給付請領資格及給付金額](https://www.bli.gov.tw/0014344.html) |
| 新住民家庭服務中心 | 諮詢服務 | 臺北市政府社會局 | [臺北市政府社會局－常見問答：臺北市新住民有哪些福利服務？](https://dosw.gov.taipei/News_Content.aspx?n=91F35523B74F69AC&sms=87415A8B9CE81B16&s=B9A3D433D1D8F969) |

### 模擬資料

- 服務人員帳號、今日訪視路線，以及 8 筆示範個案（`server/seed.ts`）的姓名、電話與地址皆為虛構。
- 城市通的測試帳號（金大森）為 TownPass 內建的假資料。

## AI 使用聲明

**執行階段：不使用任何 AI 推論。** 資格比對是可解釋的規則引擎（`shared/match.ts`），在使用者手機上執行，每一條判斷都能追溯到官方條文。

**開發階段**使用雲端 AI 工具（Claude Code）協助：

- 閱讀上表的官方申請說明，整理成可比對的條件結構（`shared/data/resources.ts`）。整理結果由開發者逐項對照原頁面核對，無法自動判斷的條件（例如財產門檻、評估結果）一律標為「需由承辦單位確認」。
- 撰寫程式、除錯與撰寫文件。

## 第三方套件

| 套件 | 用途 | 授權 |
|---|---|---|
| [Vue](https://github.com/vuejs/core) | 前端框架 | MIT |
| [Vue Router](https://github.com/vuejs/router) | 前端路由 | MIT |
| [Leaflet](https://github.com/Leaflet/Leaflet) | 開源地圖 | BSD-2-Clause |
| [Express](https://github.com/expressjs/express) | API 伺服器 | MIT |
| [Vite](https://github.com/vitejs/vite)、[@vitejs/plugin-vue](https://github.com/vitejs/vite-plugin-vue) | 開發與建置（僅開發用） | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | 型別（僅開發用） | Apache-2.0 |
| [vue-tsc](https://github.com/vuejs/language-tools) | 型別檢查（僅開發用） | MIT |
| [concurrently](https://github.com/open-cli-tools/concurrently) | 開發時同時啟動前後端（僅開發用） | MIT |

資料庫使用 Node.js 內建的 `node:sqlite`，不需要額外套件。

## 已知限制與下一步

- **身分驗證**：MVP 以城市通 `userinfo` 的 id 識別民眾（`X-Citizen-Id`）。正式上線應改由城市通簽發、後端可驗證的權杖。服務人員帳號目前是示範用的 PIN，應改接市府帳號系統。
- **資格資料維護**：門檻每年調整，下一步是建立後台讓社會局承辦人更新條件，並保留修訂紀錄。
- **推播**：目前在使用者開著服務頁面時，透過 `notify` 推播。正式版應由後端透過 App 推播通道（例如 FCM）通知。
- **裝置端 AI（第二階段）**：以自訂 Handler 在手機上執行開源小模型，用白話解釋補助規定；推論完全在裝置端進行，符合競賽規範。
- **路線**：順路雷達目前以直線距離估算，之後可以接開源路徑規劃（例如 OSRM 自架）計算實際繞路時間。

## 授權

本專案以 [GNU Affero General Public License v3.0](LICENSE) 授權。
