# ペルソナチャットアプリ — セットアップ手順

LINEやInstagramのトーク履歴をもとに、特定の人物をAIで演じさせてチャットできるプライベートアプリです。

---

## 必要なもの

- Node.js 18以上
- Supabase アカウント（無料）
- Anthropic API キー
- Vercel アカウント（無料 / Cron使用のためPro推奨）

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

表示された `Public Key` と `Private Key` を控えておく。

### 3. 環境変数の設定

`.env.local.example` をコピーして `.env.local` を作成し、各値を埋める。

```bash
cp .env.local.example .env.local
```

| 変数名 | 説明 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseダッシュボードのProject URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseの anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabaseの service_role key |
| `ANTHROPIC_API_KEY` | Anthropicのapi key |
| `APP_PASSWORD` | アプリのログインパスワード（自由に設定） |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 手順2で生成した Public Key |
| `VAPID_PRIVATE_KEY` | 手順2で生成した Private Key |
| `VAPID_SUBJECT` | `mailto:your@email.com` 形式 |
| `NEXT_PUBLIC_APP_NAME` | 通知に表示されるアプリ名（例: トークアプリ） |
| `CRON_SECRET` | Cronジョブ認証用の任意の文字列 |

### 4. Supabase の設定

**① テーブル作成**  
Supabase ダッシュボード → SQL Editor → `supabase/migrations/001_initial.sql` の内容を貼り付けて実行。

**② Storageバケット作成**  
Supabase ダッシュボード → Storage → 以下2つのバケットを作成（Public設定）:
- `persona-images`
- `upload-sources`

**③ Realtime有効化**  
Supabase ダッシュボード → Database → Replication → `messages` テーブルのRealtimeをONにする。

### 5. ローカル動作確認

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く。`.env.local` の `APP_PASSWORD` でログイン。

### 6. Vercelへのデプロイ

```bash
git init
git add .
git commit -m "initial commit"
```

Vercel ダッシュボード → New Project → GitHubにpush → Import  
→ Environment Variables に `.env.local` の内容をすべて追加（`CRON_SECRET` も忘れずに）  
→ Deploy

### 7. iPhoneからの通知設定

1. SafariでデプロイされたURLを開く
2. 共有ボタン →「ホーム画面に追加」
3. ホーム画面のアイコンからアプリを開く（Standaloneモード）
4. チャット画面の「🔕 通知OFF」ボタンをタップ → 許可する
5. 以降、5〜30分のランダムな間隔でペルソナからメッセージが届き、通知センターに表示される

---

## 通知の仕組み

- Vercel Cronが5分ごとに `/api/push/send-scheduled` を呼び出す
- 各ペルソナの「最後に自発メッセージを送った時刻」と設定したインターバルを比較
- 時間が来ていたらClaudeがその人物らしいメッセージを生成し、プッシュ通知を送信
- 通知タイトルは「ペルソナの名前」（例: 「田中」）、本文がメッセージ内容

> **注意**: Web Pushは iOS 16.4以降 + Safari でのみ動作します。  
> ホーム画面に追加（PWAモード）で起動する必要があります。

---

## アイコン画像の追加

`public/` フォルダに以下を追加（PNG形式）:
- `icon-192.png` — 192×192px（ホーム画面アイコン + 通知アイコン）
- `icon-512.png` — 512×512px（スプラッシュ用）
- `badge-72.png` — 72×72px（通知バッジ用、モノクロ推奨）
