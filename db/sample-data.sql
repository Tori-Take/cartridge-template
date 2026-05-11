-- ============================================================
-- Studio 動作確認用のサンプルデータ
--
-- このファイルは Studio の in-memory PGlite モード（Vercel デプロイ版）
-- または fresh start 時にのみ自動投入される。
-- ローカル開発でも初回 only。
--
-- organization_id は Studio Sandbox 組織の固定 UUID:
--   '11111111-1111-1111-1111-111111111111'
-- ============================================================

INSERT INTO my_items (id, organization_id, name, description, status, created_by) VALUES
  (
    '00000001-0001-0001-0001-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'サンプル項目 A',
    '初期データの例です。',
    'active',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  (
    '00000001-0001-0001-0001-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'サンプル項目 B',
    '2 つめの項目。',
    'active',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  )
ON CONFLICT (id) DO NOTHING;
