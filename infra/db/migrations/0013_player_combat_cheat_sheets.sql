alter table players
  add column if not exists combat_cheat_sheet text,
  add column if not exists combat_cheat_sheet_updated_at timestamptz,
  add column if not exists combat_cheat_sheet_source_hash text;
