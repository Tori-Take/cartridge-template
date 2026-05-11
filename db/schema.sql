-- ============================================================
-- カートリッジのテーブル定義（単一ソース）
--
-- このファイルは:
--   - Studio ローカル: PGlite に起動時に自動適用
--   - Studio デプロイ版: studio スキーマへ migration として適用
--   - AppHarbor 本番: public スキーマへ migration として適用
--
-- 必須ルール:
--   1. 全テーブルに organization_id を持たせる（マルチテナント境界）
--   2. RLS ポリシーで organization_id を auth.jwt() と照合する
--   3. CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS で冪等に書く
--   4. update_updated_at() トリガで updated_at を自動更新
-- ============================================================

-- サンプルテーブル: my_items（自由に書き換えてください）
CREATE TABLE IF NOT EXISTS my_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'archived')),
  created_by      UUID        REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 検索用インデックス
CREATE INDEX IF NOT EXISTS idx_my_items_org_created
  ON my_items(organization_id, created_at DESC);

-- 更新時刻自動更新トリガ
DROP TRIGGER IF EXISTS set_updated_at ON my_items;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON my_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS（本番のみ有効。Studio は service_role でアクセスするため無効化されている）
-- ============================================================
ALTER TABLE my_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON my_items;
CREATE POLICY "org_isolation" ON my_items
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
