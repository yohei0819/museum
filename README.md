# ⚔ 刀剣ミュージアム東京（架空サイト）

日本刀の美と歴史を体感する架空の博物館サイトです。  
フロントエンド技術のデモンストレーションを目的として制作しました。

## デモ

GitHub Pages:  
`https://yohei0819.github.io/museum/`

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| マークアップ | HTML5（セマンティック / WAI-ARIA） |
| スタイル | CSS3（カスタムプロパティ / Grid / Flexbox / メディアクエリ） |
| JavaScript | Vanilla JS（ES6+、IIFE パターン） |
| アニメーション | [GSAP 3](https://gsap.com/)（ScrollTrigger / ScrollToPlugin） |
| スライダー | [Swiper 11](https://swiperjs.com/) |
| アイコン | [Font Awesome 6](https://fontawesome.com/) |
| フォント | [Google Fonts](https://fonts.google.com/)（Noto Sans JP / Noto Serif JP） |
| デプロイ | GitHub Pages（GitHub Actions） |

## 主な機能

- **ヒーロースライダー** — Swiper.js によるフェードエフェクト付きフルスクリーンスライダー
- **ゴールドパーティクル** — Canvas API によるリアルタイム金粉エフェクト（IntersectionObserver で画面外自動停止）
- **スクロールアニメーション** — GSAP ScrollTrigger による要素のフェードイン・パララックス・文字分割演出
- **横スクロール展示** — デスクトップ時のみ展示セクションが横スクロールに変化
- **3D チルトカード** — マウス位置に応じた perspective ベースの立体傾斜エフェクト
- **マグネティックボタン** — ポインター追従によるインタラクティブなボタン演出
- **ストロークドロー** — SVG の stroke-dashoffset を利用したカード枠線の描画アニメーション
- **ギャラリーライトボックス** — モーダル表示・前後ナビ・フォーカストラップ対応の画像ビューワー
- **カウントアップ** — 数値がスクロールで可視になると 0 からアニメーションで増加
- **お問い合わせフォーム** — クライアントサイドバリデーション（デモ用・送信機能なし）
- **レスポンシブデザイン** — モバイル / タブレット / デスクトップの 3 段階対応
- **アクセシビリティ** — スキップリンク・ARIA 属性・キーボードナビゲーション・`prefers-reduced-motion` 対応

## ファイル構成

```
├── index.html          # メインHTML
├── css/
│   └── style.css       # スタイルシート
├── js/
│   └── main.js         # メインJavaScript
├── favicon.svg         # ファビコン
├── .github/
│   └── workflows/
│       └── deploy.yml  # GitHub Pages デプロイ用ワークフロー
└── README.md
```

## ローカルで確認する

ビルドツール不要の静的サイトです。任意の HTTP サーバーでルートを配信してください。

```bash
# 例: Python
python3 -m http.server 8000

# 例: Node.js (npx)
npx serve .
```

ブラウザで `http://localhost:8000` を開きます。

## アクセシビリティ・パフォーマンス上の配慮

- `prefers-reduced-motion: reduce` 設定時、全アニメーションを自動無効化
- スマートフォン（640px 以下）では CSS・JS 両面でアニメーションを無効化し安定表示を優先
- GSAP / Swiper の CDN 障害時でもメニュー・フォーム等の基本機能が動作するフォールバック設計
- Canvas パーティクルは IntersectionObserver で画面外時に自動停止
- `loading="lazy"` による画像の遅延読み込み
- スクロールイベントは `requestAnimationFrame` でスロットリング

## ライセンス

本リポジトリのコードは学習・ポートフォリオ目的で公開しています。  
画像素材は [Unsplash](https://unsplash.com/) のプレースホルダーを使用しています。

## 注意事項

- これは**架空の博物館サイト**です。実在する施設とは一切関係ありません。
- `noindex, nofollow` を設定しており、検索エンジンにインデックスされません。
