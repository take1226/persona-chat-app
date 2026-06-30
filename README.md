# ペルソナチャットアプリ — セットアップ手順

LINEやInstagramのトーク履歴をもとに、特定の人物をAIで演じさせてチャットできるプライベートアプリです。

**技術スタック**: Next.js / Firebase Firestore / Gemini API / Vercel Blob / Web Push

---

## 必要なもの

- Node.js 18以上
- Firebase プロジェクト（Spark無料枠で可）
- Gemini API キー（[Google AI Studio](https://aistudio.google.com/apikey) で無料取得）
- Vercel アカウント（Hobby無料枠で可）

---

## セットアップ手順

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. VAPID キーの生成（プッシュ通知用）

```bash
npx web-push generate-vapid-keys
```

### 3. 環境変数の設定

```bash
cp .env.local.example .env.local
```

| 変数名 | 説明 |
|--------|------|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase Console → プロジェクト設定 → アプリ → Firebase SDK の設定 |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Console → プロジェクト設定 → サービスアカウント → 新しい秘密鍵を生成 → JSON を1行に |
| `GEMINI_API_KEY` | Google AI Studio で取得したキー |
| `BLOB_READ_WRITE_TOKEN` | Vercel ダッシュボード → Storage → Blob で取得 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 手順2で生成した Public Key |
| `VAPID_PRIVATE_KEY` | 手順2で生成した Private Key |
| `VAPID_SUBJECT` | `mailto:your@email.com` 形式 |
| `NEXT_PUBLIC_APP_NAME` | 通知に表示されるアプリ名（例: ペルソナトーク） |
| `APP_PASSWORD` | アプリのログインパスワード（自由に設定） |
| `CRON_SECRET` | Cronジョブ認証用の任意の文字列（GitHub Actions Secrets にも設定） |

### 4. Firebase の設定

**① Firestore 有効化**  
Firebase Console → Firestore Database → データベースを作成（本番モード）

**② Firestore Rules デプロイ**
```bash
firebase deploy --only firestore:rules
```

**③ Firebase Storage 有効化**（アバター・アップロード画像保存用）  
Firebase Console → Storage → 開始する → `storage.rules` をデプロイ

Firestoreのコレクション（`personas`, `push_subscriptions`）はアプリ初回起動時に自動生成されます。

### 5. ローカル動作確認

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く。

### 6. Vercelへのデプロイ

Vercel ダッシュボード → New Project → GitHub Import  
→ Environment Variables に `.env.local` の全変数を追加  
→ Deploy

### 7. 自発メッセージのCron設定（GitHub Actions）

Vercel Hobby は Cron が1日2回（UTC 0時・11時 = JST 9時・20時）のフェイルセーフとして機能しますが、
より高頻度の自発メッセージには GitHub Actions を使います。

1. GitHubリポジトリの Settings → Secrets → Actions に `CRON_SECRET` と `APP_URL`（デプロイ先URL）を追加
2. `.github/workflows/proactive-cron.yml` をpushするとGitHub Actionsが15分ごとに発火します

### 8. iPhoneからの通知設定

1. SafariでデプロイされたURLを開く
2. 共有ボタン →「ホーム画面に追加」
3. ホーム画面のアイコンからアプリを開く（Standaloneモード）
4. チャット画面の「🔕」ボタンをタップ → 通知を許可する

> **注意**: Web Pushは iOS 16.4以降 + Safari でのみ動作します。

---

## 自発メッセージの仕組み

- GitHub Actions が15分ごとに `/api/push/send-scheduled` を呼び出す
- 最終やりとりから12時間以上経過 + JST深夜帯(0〜7時)以外 + 乱数ゲート を通過した場合のみ送信
- ペルソナの記憶（進行中の話題 `ongoing`）を参照して自然なメッセージを生成
- ペルソナを削除すると会話・画像・アップロード元データがすべて完全削除されます

---

## セキュリティ注意

- `.env.local` と `.claude/settings.json` は `.gitignore` に追加し、**絶対にコミットしない**
- Firestore はクライアントからの直接書き込みを禁止（APIルート経由のみ）
- Vercel Blob の公開URLは推測可能なため、機微な画像は保存しない
- `CRON_SECRET` は推測困難な十分な長さのランダム文字列を使用すること

---

## アイコン画像の追加

`public/` フォルダに以下を追加（PNG形式）:
- `icon-192.png` — 192×192px
- `icon-512.png` — 512×512px
- `badge-72.png` — 72×72px（モノクロ推奨）
