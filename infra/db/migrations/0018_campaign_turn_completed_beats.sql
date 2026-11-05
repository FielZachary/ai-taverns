alter table campaign_turn_summaries
  add column if not exists completed_beats jsonb not null default '[]'::jsonb;

comment on column campaign_turn_summaries.completed_beats
  is 'Bounded player-visible beats completed by a resolved turn, used only to prevent immediate narrator repetition.';
