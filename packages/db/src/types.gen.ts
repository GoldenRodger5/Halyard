/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with:  DATABASE_URL=postgres://... pnpm db:types
 * Source: scripts/gen-types.ts, reading information_schema of the migrated schema.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];


export interface AdminUsersRow {
  user_id: string;
  email: string | null;
  created_at: string;
}

export interface AdminUsersInsert {
  user_id: string;
  email?: string | null;
  created_at?: string;
}

export interface AdminUsersUpdate {
  user_id?: string;
  email?: string | null;
  created_at?: string;
}

export interface AssetsRow {
  id: string;
  product_id: string | null;
  kind: 'screenshot' | 'logo' | 'broll' | 'font' | 'photo' | 'generated' | 'capture' | 'audio' | 'video';
  storage_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  bytes: number | null;
  tags: string[];
  caption: string | null;
  source: string | null;
  usable_for: string[];
  public_url: string | null;
  created_at: string;
}

export interface AssetsInsert {
  id?: string;
  product_id?: string | null;
  kind: 'screenshot' | 'logo' | 'broll' | 'font' | 'photo' | 'generated' | 'capture' | 'audio' | 'video';
  storage_path: string;
  mime_type: string;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  bytes?: number | null;
  tags?: string[];
  caption?: string | null;
  source?: string | null;
  usable_for?: string[];
  public_url?: string | null;
  created_at?: string;
}

export interface AssetsUpdate {
  id?: string;
  product_id?: string | null;
  kind?: 'screenshot' | 'logo' | 'broll' | 'font' | 'photo' | 'generated' | 'capture' | 'audio' | 'video';
  storage_path?: string;
  mime_type?: string;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  bytes?: number | null;
  tags?: string[];
  caption?: string | null;
  source?: string | null;
  usable_for?: string[];
  public_url?: string | null;
  created_at?: string;
}

export interface AttributionRow {
  id: string;
  content_item_id: string;
  collected_at: string;
  sessions: number | null;
  signups: number | null;
  activated_users: number | null;
  adaptations: number | null;
  saves: number | null;
  cook_starts: number | null;
  paid_conversions: number | null;
}

export interface AttributionInsert {
  id?: string;
  content_item_id: string;
  collected_at?: string;
  sessions?: number | null;
  signups?: number | null;
  activated_users?: number | null;
  adaptations?: number | null;
  saves?: number | null;
  cook_starts?: number | null;
  paid_conversions?: number | null;
}

export interface AttributionUpdate {
  id?: string;
  content_item_id?: string;
  collected_at?: string;
  sessions?: number | null;
  signups?: number | null;
  activated_users?: number | null;
  adaptations?: number | null;
  saves?: number | null;
  cook_starts?: number | null;
  paid_conversions?: number | null;
}

export interface AuditLogRow {
  id: string;
  actor: 'human' | 'system' | 'worker';
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  detail: Json;
  created_at: string;
}

export interface AuditLogInsert {
  id?: string;
  actor: 'human' | 'system' | 'worker';
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  detail?: Json;
  created_at?: string;
}

export interface AuditLogUpdate {
  id?: string;
  actor?: 'human' | 'system' | 'worker';
  action?: string;
  entity_type?: string | null;
  entity_id?: string | null;
  detail?: Json;
  created_at?: string;
}

export interface BrandVoicesRow {
  id: string;
  product_id: string;
  persona: 'founder' | 'brand';
  display_name: string;
  description: string;
  do_rules: string[];
  dont_rules: string[];
  examples: Json;
  anti_examples: Json;
  mix_targets: Json;
  created_at: string;
  updated_at: string;
}

export interface BrandVoicesInsert {
  id?: string;
  product_id: string;
  persona: 'founder' | 'brand';
  display_name: string;
  description?: string;
  do_rules?: string[];
  dont_rules?: string[];
  examples?: Json;
  anti_examples?: Json;
  mix_targets?: Json;
  created_at?: string;
  updated_at?: string;
}

export interface BrandVoicesUpdate {
  id?: string;
  product_id?: string;
  persona?: 'founder' | 'brand';
  display_name?: string;
  description?: string;
  do_rules?: string[];
  dont_rules?: string[];
  examples?: Json;
  anti_examples?: Json;
  mix_targets?: Json;
  created_at?: string;
  updated_at?: string;
}

export interface CalibrationReviewsRow {
  id: string;
  product_id: string;
  content_item_id: string;
  verdict: 'approved' | 'rejected' | 'edited';
  reason: string | null;
  edited_body: string | null;
  reviewed_at: string;
}

export interface CalibrationReviewsInsert {
  id?: string;
  product_id: string;
  content_item_id: string;
  verdict: 'approved' | 'rejected' | 'edited';
  reason?: string | null;
  edited_body?: string | null;
  reviewed_at?: string;
}

export interface CalibrationReviewsUpdate {
  id?: string;
  product_id?: string;
  content_item_id?: string;
  verdict?: 'approved' | 'rejected' | 'edited';
  reason?: string | null;
  edited_body?: string | null;
  reviewed_at?: string;
}

export interface CommentRepliesRow {
  id: string;
  comment_id: string;
  body: string;
  sent_by: string;
  was_ai_drafted: boolean;
  was_edited: boolean;
  platform_reply_id: string | null;
  sent_at: string;
  latency_seconds: number | null;
}

export interface CommentRepliesInsert {
  id?: string;
  comment_id: string;
  body: string;
  sent_by?: string;
  was_ai_drafted?: boolean;
  was_edited?: boolean;
  platform_reply_id?: string | null;
  sent_at?: string;
  latency_seconds?: number | null;
}

export interface CommentRepliesUpdate {
  id?: string;
  comment_id?: string;
  body?: string;
  sent_by?: string;
  was_ai_drafted?: boolean;
  was_edited?: boolean;
  platform_reply_id?: string | null;
  sent_at?: string;
  latency_seconds?: number | null;
}

export interface CommentsRow {
  id: string;
  publication_id: string;
  platform_comment_id: string;
  author_handle: string | null;
  author_display_name: string | null;
  body: string;
  posted_at: string | null;
  is_support_question: boolean;
  sentiment: string | null;
  suggested_reply: string | null;
  reply_status: 'pending' | 'replied' | 'ignored' | 'routed';
  replied_at: string | null;
  first_seen_at: string;
}

export interface CommentsInsert {
  id?: string;
  publication_id: string;
  platform_comment_id: string;
  author_handle?: string | null;
  author_display_name?: string | null;
  body: string;
  posted_at?: string | null;
  is_support_question?: boolean;
  sentiment?: string | null;
  suggested_reply?: string | null;
  reply_status?: 'pending' | 'replied' | 'ignored' | 'routed';
  replied_at?: string | null;
  first_seen_at?: string;
}

export interface CommentsUpdate {
  id?: string;
  publication_id?: string;
  platform_comment_id?: string;
  author_handle?: string | null;
  author_display_name?: string | null;
  body?: string;
  posted_at?: string | null;
  is_support_question?: boolean;
  sentiment?: string | null;
  suggested_reply?: string | null;
  reply_status?: 'pending' | 'replied' | 'ignored' | 'routed';
  replied_at?: string | null;
  first_seen_at?: string;
}

export interface ComposeSessionsRow {
  id: string;
  product_id: string;
  title: string | null;
  messages: Json;
  resulting_content_item_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ComposeSessionsInsert {
  id?: string;
  product_id: string;
  title?: string | null;
  messages?: Json;
  resulting_content_item_ids?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface ComposeSessionsUpdate {
  id?: string;
  product_id?: string;
  title?: string | null;
  messages?: Json;
  resulting_content_item_ids?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface ContentItemsRow {
  id: string;
  product_id: string;
  idea_id: string | null;
  account_id: string;
  platform: string;
  persona: 'founder' | 'brand';
  format: 'text' | 'image' | 'carousel' | 'video' | 'story' | 'pin';
  category: string;
  body: string;
  title: string | null;
  alt_text: string | null;
  hashtags: string[];
  link_url: string | null;
  final_link_url: string | null;
  product_artifact: Json | null;
  render_ids: string[];
  vo_script: string | null;
  vo_asset_id: string | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'publishing' | 'published' | 'awaiting_manual_publish' | 'failed' | 'rejected' | 'archived' | 'expired';
  scheduled_at: string | null;
  published_at: string | null;
  slot_id: string | null;
  reschedule_count: number;
  edited_by_human: boolean;
  original_body: string | null;
  regen_notes: string[];
  reject_reason: string | null;
  approved_at: string | null;
  generation_meta: Json;
  ai_components: string[];
  disclosure_text: string | null;
  requires_ai_label: boolean | null;
  qc_results: Json;
  claims: Json;
  audio_mode: 'founder_cloned' | 'founder_recorded' | 'text_only';
  series_id: string | null;
  sequence_number: number | null;
  eligible_for_repost_at: string | null;
  reposted_from_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentItemsInsert {
  id?: string;
  product_id: string;
  idea_id?: string | null;
  account_id: string;
  platform: string;
  persona: 'founder' | 'brand';
  format: 'text' | 'image' | 'carousel' | 'video' | 'story' | 'pin';
  category: string;
  body?: string;
  title?: string | null;
  alt_text?: string | null;
  hashtags?: string[];
  link_url?: string | null;
  final_link_url?: string | null;
  product_artifact?: Json | null;
  render_ids?: string[];
  vo_script?: string | null;
  vo_asset_id?: string | null;
  status?: 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'publishing' | 'published' | 'awaiting_manual_publish' | 'failed' | 'rejected' | 'archived' | 'expired';
  scheduled_at?: string | null;
  published_at?: string | null;
  slot_id?: string | null;
  reschedule_count?: number;
  edited_by_human?: boolean;
  original_body?: string | null;
  regen_notes?: string[];
  reject_reason?: string | null;
  approved_at?: string | null;
  generation_meta?: Json;
  ai_components?: string[];
  disclosure_text?: string | null;
  qc_results?: Json;
  claims?: Json;
  audio_mode?: 'founder_cloned' | 'founder_recorded' | 'text_only';
  series_id?: string | null;
  sequence_number?: number | null;
  eligible_for_repost_at?: string | null;
  reposted_from_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ContentItemsUpdate {
  id?: string;
  product_id?: string;
  idea_id?: string | null;
  account_id?: string;
  platform?: string;
  persona?: 'founder' | 'brand';
  format?: 'text' | 'image' | 'carousel' | 'video' | 'story' | 'pin';
  category?: string;
  body?: string;
  title?: string | null;
  alt_text?: string | null;
  hashtags?: string[];
  link_url?: string | null;
  final_link_url?: string | null;
  product_artifact?: Json | null;
  render_ids?: string[];
  vo_script?: string | null;
  vo_asset_id?: string | null;
  status?: 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'publishing' | 'published' | 'awaiting_manual_publish' | 'failed' | 'rejected' | 'archived' | 'expired';
  scheduled_at?: string | null;
  published_at?: string | null;
  slot_id?: string | null;
  reschedule_count?: number;
  edited_by_human?: boolean;
  original_body?: string | null;
  regen_notes?: string[];
  reject_reason?: string | null;
  approved_at?: string | null;
  generation_meta?: Json;
  ai_components?: string[];
  disclosure_text?: string | null;
  qc_results?: Json;
  claims?: Json;
  audio_mode?: 'founder_cloned' | 'founder_recorded' | 'text_only';
  series_id?: string | null;
  sequence_number?: number | null;
  eligible_for_repost_at?: string | null;
  reposted_from_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface HooksRow {
  id: string;
  product_id: string | null;
  pattern: string;
  platform: string | null;
  category: string | null;
  source: 'seeded' | 'calibration' | 'approved_post' | 'manual';
  uses: number;
  avg_stop_rate: number | null;
  avg_score: number | null;
  active: boolean;
  created_at: string;
}

export interface HooksInsert {
  id?: string;
  product_id?: string | null;
  pattern: string;
  platform?: string | null;
  category?: string | null;
  source?: 'seeded' | 'calibration' | 'approved_post' | 'manual';
  uses?: number;
  avg_stop_rate?: number | null;
  avg_score?: number | null;
  active?: boolean;
  created_at?: string;
}

export interface HooksUpdate {
  id?: string;
  product_id?: string | null;
  pattern?: string;
  platform?: string | null;
  category?: string | null;
  source?: 'seeded' | 'calibration' | 'approved_post' | 'manual';
  uses?: number;
  avg_stop_rate?: number | null;
  avg_score?: number | null;
  active?: boolean;
  created_at?: string;
}

export interface IdeasRow {
  id: string;
  product_id: string;
  title: string;
  angle: string;
  category: 'transformation' | 'education' | 'community' | 'product' | 'founder_insight';
  rationale: string | null;
  source_signals: string[];
  series_id: string | null;
  score: number;
  score_breakdown: Json;
  embedding: Json | null;
  status: 'proposed' | 'selected' | 'used' | 'rejected' | 'expired' | 'snoozed';
  reject_reason: string | null;
  snoozed_until: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface IdeasInsert {
  id?: string;
  product_id: string;
  title: string;
  angle: string;
  category: 'transformation' | 'education' | 'community' | 'product' | 'founder_insight';
  rationale?: string | null;
  source_signals?: string[];
  series_id?: string | null;
  score?: number;
  score_breakdown?: Json;
  embedding?: Json | null;
  status?: 'proposed' | 'selected' | 'used' | 'rejected' | 'expired' | 'snoozed';
  reject_reason?: string | null;
  snoozed_until?: string | null;
  expires_at?: string | null;
  created_at?: string;
}

export interface IdeasUpdate {
  id?: string;
  product_id?: string;
  title?: string;
  angle?: string;
  category?: 'transformation' | 'education' | 'community' | 'product' | 'founder_insight';
  rationale?: string | null;
  source_signals?: string[];
  series_id?: string | null;
  score?: number;
  score_breakdown?: Json;
  embedding?: Json | null;
  status?: 'proposed' | 'selected' | 'used' | 'rejected' | 'expired' | 'snoozed';
  reject_reason?: string | null;
  snoozed_until?: string | null;
  expires_at?: string | null;
  created_at?: string;
}

export interface JobsRow {
  id: string;
  kind: 'generate' | 'render' | 'tts' | 'capture' | 'publish' | 'collect_metrics' | 'collect_signals' | 'collect_comments' | 'collect_attribution' | 'refresh_tokens' | 'score_performance' | 'digest_email' | 'reconcile_schedule';
  payload: Json;
  status: 'queued' | 'running' | 'done' | 'failed' | 'dead';
  priority: number;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  dedupe_key: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface JobsInsert {
  id?: string;
  kind: 'generate' | 'render' | 'tts' | 'capture' | 'publish' | 'collect_metrics' | 'collect_signals' | 'collect_comments' | 'collect_attribution' | 'refresh_tokens' | 'score_performance' | 'digest_email' | 'reconcile_schedule';
  payload?: Json;
  status?: 'queued' | 'running' | 'done' | 'failed' | 'dead';
  priority?: number;
  attempts?: number;
  max_attempts?: number;
  run_after?: string;
  locked_at?: string | null;
  locked_by?: string | null;
  last_error?: string | null;
  dedupe_key?: string | null;
  finished_at?: string | null;
  created_at?: string;
}

export interface JobsUpdate {
  id?: string;
  kind?: 'generate' | 'render' | 'tts' | 'capture' | 'publish' | 'collect_metrics' | 'collect_signals' | 'collect_comments' | 'collect_attribution' | 'refresh_tokens' | 'score_performance' | 'digest_email' | 'reconcile_schedule';
  payload?: Json;
  status?: 'queued' | 'running' | 'done' | 'failed' | 'dead';
  priority?: number;
  attempts?: number;
  max_attempts?: number;
  run_after?: string;
  locked_at?: string | null;
  locked_by?: string | null;
  last_error?: string | null;
  dedupe_key?: string | null;
  finished_at?: string | null;
  created_at?: string;
}

export interface NotificationsRow {
  id: string;
  kind: 'auth_failure' | 'duplicate_publish_abort' | 'queue_depth' | 'worker_missing' | 'render_failure' | 'digest' | 'connector_down';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationsInsert {
  id?: string;
  kind: 'auth_failure' | 'duplicate_publish_abort' | 'queue_depth' | 'worker_missing' | 'render_failure' | 'digest' | 'connector_down';
  severity?: 'info' | 'warning' | 'critical';
  title: string;
  body?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  sent_at?: string | null;
  read_at?: string | null;
  created_at?: string;
}

export interface NotificationsUpdate {
  id?: string;
  kind?: 'auth_failure' | 'duplicate_publish_abort' | 'queue_depth' | 'worker_missing' | 'render_failure' | 'digest' | 'connector_down';
  severity?: 'info' | 'warning' | 'critical';
  title?: string;
  body?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  sent_at?: string | null;
  read_at?: string | null;
  created_at?: string;
}

export interface OnboardingStateRow {
  product_id: string;
  step_ingest_done: boolean;
  step_voice_done: boolean;
  step_calibration_done: boolean;
  step_templates_done: boolean;
  step_accounts_done: boolean;
  calibration_batch_id: string | null;
  calibration_reviewed: number;
  calibration_target: number;
  voice_answers: Json;
  completed_at: string | null;
  updated_at: string;
}

export interface OnboardingStateInsert {
  product_id: string;
  step_ingest_done?: boolean;
  step_voice_done?: boolean;
  step_calibration_done?: boolean;
  step_templates_done?: boolean;
  step_accounts_done?: boolean;
  calibration_batch_id?: string | null;
  calibration_reviewed?: number;
  calibration_target?: number;
  voice_answers?: Json;
  completed_at?: string | null;
  updated_at?: string;
}

export interface OnboardingStateUpdate {
  product_id?: string;
  step_ingest_done?: boolean;
  step_voice_done?: boolean;
  step_calibration_done?: boolean;
  step_templates_done?: boolean;
  step_accounts_done?: boolean;
  calibration_batch_id?: string | null;
  calibration_reviewed?: number;
  calibration_target?: number;
  voice_answers?: Json;
  completed_at?: string | null;
  updated_at?: string;
}

export interface PerformanceScoresRow {
  content_item_id: string;
  score: number;
  reach_score: number | null;
  engagement_score: number | null;
  conversion_score: number | null;
  low_confidence: boolean;
  computed_at: string;
  notes: string | null;
}

export interface PerformanceScoresInsert {
  content_item_id: string;
  score: number;
  reach_score?: number | null;
  engagement_score?: number | null;
  conversion_score?: number | null;
  low_confidence?: boolean;
  computed_at?: string;
  notes?: string | null;
}

export interface PerformanceScoresUpdate {
  content_item_id?: string;
  score?: number;
  reach_score?: number | null;
  engagement_score?: number | null;
  conversion_score?: number | null;
  low_confidence?: boolean;
  computed_at?: string;
  notes?: string | null;
}

export interface PostMetricsRow {
  id: string;
  publication_id: string;
  collected_at: string;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  video_views: number | null;
  watch_time_seconds: number | null;
  profile_visits: number | null;
  link_clicks: number | null;
  follows: number | null;
  raw: Json | null;
  purge_after: string | null;
}

export interface PostMetricsInsert {
  id?: string;
  publication_id: string;
  collected_at?: string;
  impressions?: number | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  video_views?: number | null;
  watch_time_seconds?: number | null;
  profile_visits?: number | null;
  link_clicks?: number | null;
  follows?: number | null;
  raw?: Json | null;
  purge_after?: string | null;
}

export interface PostMetricsUpdate {
  id?: string;
  publication_id?: string;
  collected_at?: string;
  impressions?: number | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  video_views?: number | null;
  watch_time_seconds?: number | null;
  profile_visits?: number | null;
  link_clicks?: number | null;
  follows?: number | null;
  raw?: Json | null;
  purge_after?: string | null;
}

export interface ProductsRow {
  id: string;
  name: string;
  tagline: string | null;
  website_url: string | null;
  app_store_url: string | null;
  status: 'active' | 'paused' | 'archived';
  brief_markdown: string | null;
  brief_summary: string | null;
  brief_updated_at: string | null;
  connector_type: 'mcp' | 'rest' | 'none';
  connector_config: Json;
  brand_tokens: Json;
  content_rules: Json;
  audience_timezone: string;
  operator_timezone: string;
  created_at: string;
  updated_at: string;
}

export interface ProductsInsert {
  id: string;
  name: string;
  tagline?: string | null;
  website_url?: string | null;
  app_store_url?: string | null;
  status?: 'active' | 'paused' | 'archived';
  brief_markdown?: string | null;
  brief_summary?: string | null;
  brief_updated_at?: string | null;
  connector_type?: 'mcp' | 'rest' | 'none';
  connector_config?: Json;
  brand_tokens?: Json;
  content_rules?: Json;
  audience_timezone?: string;
  operator_timezone?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProductsUpdate {
  id?: string;
  name?: string;
  tagline?: string | null;
  website_url?: string | null;
  app_store_url?: string | null;
  status?: 'active' | 'paused' | 'archived';
  brief_markdown?: string | null;
  brief_summary?: string | null;
  brief_updated_at?: string | null;
  connector_type?: 'mcp' | 'rest' | 'none';
  connector_config?: Json;
  brand_tokens?: Json;
  content_rules?: Json;
  audience_timezone?: string;
  operator_timezone?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PublicationsRow {
  id: string;
  content_item_id: string;
  account_id: string;
  platform: string;
  platform_post_id: string | null;
  permalink: string | null;
  publish_mode: 'direct' | 'draft';
  manual_publish_url: string | null;
  published_at: string | null;
  error: string | null;
  raw_response: Json | null;
  needs_reconciliation: boolean;
  link_reply_post_id: string | null;
  created_at: string;
}

export interface PublicationsInsert {
  id?: string;
  content_item_id: string;
  account_id: string;
  platform: string;
  platform_post_id?: string | null;
  permalink?: string | null;
  publish_mode: 'direct' | 'draft';
  manual_publish_url?: string | null;
  published_at?: string | null;
  error?: string | null;
  raw_response?: Json | null;
  needs_reconciliation?: boolean;
  link_reply_post_id?: string | null;
  created_at?: string;
}

export interface PublicationsUpdate {
  id?: string;
  content_item_id?: string;
  account_id?: string;
  platform?: string;
  platform_post_id?: string | null;
  permalink?: string | null;
  publish_mode?: 'direct' | 'draft';
  manual_publish_url?: string | null;
  published_at?: string | null;
  error?: string | null;
  raw_response?: Json | null;
  needs_reconciliation?: boolean;
  link_reply_post_id?: string | null;
  created_at?: string;
}

export interface ReferencesSwipeRow {
  id: string;
  product_id: string | null;
  url: string | null;
  platform: string | null;
  screenshot_asset_id: string | null;
  transcript: string | null;
  why_it_works: string;
  tags: string[];
  created_at: string;
}

export interface ReferencesSwipeInsert {
  id?: string;
  product_id?: string | null;
  url?: string | null;
  platform?: string | null;
  screenshot_asset_id?: string | null;
  transcript?: string | null;
  why_it_works: string;
  tags?: string[];
  created_at?: string;
}

export interface ReferencesSwipeUpdate {
  id?: string;
  product_id?: string | null;
  url?: string | null;
  platform?: string | null;
  screenshot_asset_id?: string | null;
  transcript?: string | null;
  why_it_works?: string;
  tags?: string[];
  created_at?: string;
}

export interface RendersRow {
  id: string;
  content_item_id: string | null;
  template_id: string;
  renderer: 'satori' | 'remotion' | 'playwright';
  input_props: Json;
  output_asset_id: string | null;
  slide_index: number;
  quality: 'preview' | 'final';
  status: 'queued' | 'rendering' | 'done' | 'failed';
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface RendersInsert {
  id?: string;
  content_item_id?: string | null;
  template_id: string;
  renderer: 'satori' | 'remotion' | 'playwright';
  input_props: Json;
  output_asset_id?: string | null;
  slide_index?: number;
  quality?: 'preview' | 'final';
  status?: 'queued' | 'rendering' | 'done' | 'failed';
  error?: string | null;
  duration_ms?: number | null;
  created_at?: string;
}

export interface RendersUpdate {
  id?: string;
  content_item_id?: string | null;
  template_id?: string;
  renderer?: 'satori' | 'remotion' | 'playwright';
  input_props?: Json;
  output_asset_id?: string | null;
  slide_index?: number;
  quality?: 'preview' | 'final';
  status?: 'queued' | 'rendering' | 'done' | 'failed';
  error?: string | null;
  duration_ms?: number | null;
  created_at?: string;
}

export interface SeriesRow {
  id: string;
  product_id: string;
  name: string;
  description: string | null;
  template_id: string | null;
  cadence: string | null;
  next_sequence: number;
  active: boolean;
  created_at: string;
}

export interface SeriesInsert {
  id?: string;
  product_id: string;
  name: string;
  description?: string | null;
  template_id?: string | null;
  cadence?: string | null;
  next_sequence?: number;
  active?: boolean;
  created_at?: string;
}

export interface SeriesUpdate {
  id?: string;
  product_id?: string;
  name?: string;
  description?: string | null;
  template_id?: string | null;
  cadence?: string | null;
  next_sequence?: number;
  active?: boolean;
  created_at?: string;
}

export interface SettingsRow {
  id: boolean;
  publishing_enabled: boolean;
  publishing_disabled_reason: string | null;
  generation_enabled: boolean;
  alert_email: string | null;
  daily_digest_enabled: boolean;
  learning_min_posts_per_category: number;
  updated_at: string;
}

export interface SettingsInsert {
  id?: boolean;
  publishing_enabled?: boolean;
  publishing_disabled_reason?: string | null;
  generation_enabled?: boolean;
  alert_email?: string | null;
  daily_digest_enabled?: boolean;
  learning_min_posts_per_category?: number;
  updated_at?: string;
}

export interface SettingsUpdate {
  id?: boolean;
  publishing_enabled?: boolean;
  publishing_disabled_reason?: string | null;
  generation_enabled?: boolean;
  alert_email?: string | null;
  daily_digest_enabled?: boolean;
  learning_min_posts_per_category?: number;
  updated_at?: string;
}

export interface SignalsRow {
  id: string;
  product_id: string;
  source: 'product_activity' | 'changelog' | 'editorial' | 'seasonal' | 'trend' | 'performance' | 'submission';
  raw: Json;
  summary: string;
  relevance: number | null;
  consumed_at: string | null;
  created_at: string;
}

export interface SignalsInsert {
  id?: string;
  product_id: string;
  source: 'product_activity' | 'changelog' | 'editorial' | 'seasonal' | 'trend' | 'performance' | 'submission';
  raw?: Json;
  summary: string;
  relevance?: number | null;
  consumed_at?: string | null;
  created_at?: string;
}

export interface SignalsUpdate {
  id?: string;
  product_id?: string;
  source?: 'product_activity' | 'changelog' | 'editorial' | 'seasonal' | 'trend' | 'performance' | 'submission';
  raw?: Json;
  summary?: string;
  relevance?: number | null;
  consumed_at?: string | null;
  created_at?: string;
}

export interface SlotsRow {
  id: string;
  product_id: string;
  platform: string;
  name: 'morning' | 'midday' | 'evening' | 'late';
  window_start: string;
  window_end: string;
  weekdays: number[];
  avg_score: number | null;
  enabled: boolean;
  created_at: string;
}

export interface SlotsInsert {
  id?: string;
  product_id: string;
  platform: string;
  name: 'morning' | 'midday' | 'evening' | 'late';
  window_start: string;
  window_end: string;
  weekdays?: number[];
  avg_score?: number | null;
  enabled?: boolean;
  created_at?: string;
}

export interface SlotsUpdate {
  id?: string;
  product_id?: string;
  platform?: string;
  name?: 'morning' | 'midday' | 'evening' | 'late';
  window_start?: string;
  window_end?: string;
  weekdays?: number[];
  avg_score?: number | null;
  enabled?: boolean;
  created_at?: string;
}

export interface SocialAccountsRow {
  id: string;
  product_id: string;
  platform: 'x' | 'instagram' | 'tiktok' | 'pinterest' | 'youtube' | 'threads';
  persona: 'founder' | 'brand';
  handle: string;
  platform_user_id: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  scopes: string[];
  capability_state: 'pending_auth' | 'draft_only' | 'live' | 'error' | 'disabled';
  capability_detail: string | null;
  supported_formats: string[];
  rate_limit_config: Json;
  link_strategy: 'in_body' | 'first_reply' | 'bio_only' | 'pin_destination' | 'description';
  bio_link_url: string | null;
  last_verified_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialAccountsInsert {
  id?: string;
  product_id: string;
  platform: 'x' | 'instagram' | 'tiktok' | 'pinterest' | 'youtube' | 'threads';
  persona: 'founder' | 'brand';
  handle: string;
  platform_user_id?: string | null;
  access_token_enc?: string | null;
  refresh_token_enc?: string | null;
  token_expires_at?: string | null;
  scopes?: string[];
  capability_state?: 'pending_auth' | 'draft_only' | 'live' | 'error' | 'disabled';
  capability_detail?: string | null;
  supported_formats?: string[];
  rate_limit_config?: Json;
  link_strategy?: 'in_body' | 'first_reply' | 'bio_only' | 'pin_destination' | 'description';
  bio_link_url?: string | null;
  last_verified_at?: string | null;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SocialAccountsUpdate {
  id?: string;
  product_id?: string;
  platform?: 'x' | 'instagram' | 'tiktok' | 'pinterest' | 'youtube' | 'threads';
  persona?: 'founder' | 'brand';
  handle?: string;
  platform_user_id?: string | null;
  access_token_enc?: string | null;
  refresh_token_enc?: string | null;
  token_expires_at?: string | null;
  scopes?: string[];
  capability_state?: 'pending_auth' | 'draft_only' | 'live' | 'error' | 'disabled';
  capability_detail?: string | null;
  supported_formats?: string[];
  rate_limit_config?: Json;
  link_strategy?: 'in_body' | 'first_reply' | 'bio_only' | 'pin_destination' | 'description';
  bio_link_url?: string | null;
  last_verified_at?: string | null;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SubmissionsRow {
  id: string;
  product_id: string;
  source_platform: string | null;
  source_handle: string | null;
  source_comment_id: string | null;
  content: string;
  received_at: string;
  status: 'new' | 'selected' | 'fulfilled' | 'declined';
  resulting_content_item_id: string | null;
}

export interface SubmissionsInsert {
  id?: string;
  product_id: string;
  source_platform?: string | null;
  source_handle?: string | null;
  source_comment_id?: string | null;
  content: string;
  received_at?: string;
  status?: 'new' | 'selected' | 'fulfilled' | 'declined';
  resulting_content_item_id?: string | null;
}

export interface SubmissionsUpdate {
  id?: string;
  product_id?: string;
  source_platform?: string | null;
  source_handle?: string | null;
  source_comment_id?: string | null;
  content?: string;
  received_at?: string;
  status?: 'new' | 'selected' | 'fulfilled' | 'declined';
  resulting_content_item_id?: string | null;
}

export interface TemplatesRow {
  id: string;
  product_id: string | null;
  renderer: 'satori' | 'remotion' | 'playwright';
  format: string;
  aspect_ratio: string;
  props_schema: Json;
  description: string | null;
  preview_asset_id: string | null;
  enabled: boolean;
  disabled_reason: string | null;
  created_at: string;
}

export interface TemplatesInsert {
  id: string;
  product_id?: string | null;
  renderer: 'satori' | 'remotion' | 'playwright';
  format: string;
  aspect_ratio: string;
  props_schema?: Json;
  description?: string | null;
  preview_asset_id?: string | null;
  enabled?: boolean;
  disabled_reason?: string | null;
  created_at?: string;
}

export interface TemplatesUpdate {
  id?: string;
  product_id?: string | null;
  renderer?: 'satori' | 'remotion' | 'playwright';
  format?: string;
  aspect_ratio?: string;
  props_schema?: Json;
  description?: string | null;
  preview_asset_id?: string | null;
  enabled?: boolean;
  disabled_reason?: string | null;
  created_at?: string;
}

export interface VoiceLexiconRow {
  id: string;
  product_id: string | null;
  term: string;
  phonetic: string;
  notes: string | null;
  hit_count: number;
  created_at: string;
}

export interface VoiceLexiconInsert {
  id?: string;
  product_id?: string | null;
  term: string;
  phonetic: string;
  notes?: string | null;
  hit_count?: number;
  created_at?: string;
}

export interface VoiceLexiconUpdate {
  id?: string;
  product_id?: string | null;
  term?: string;
  phonetic?: string;
  notes?: string | null;
  hit_count?: number;
  created_at?: string;
}

export interface WorkerHeartbeatsRow {
  worker_id: string;
  last_seen_at: string;
  version: string | null;
  detail: Json;
}

export interface WorkerHeartbeatsInsert {
  worker_id: string;
  last_seen_at?: string;
  version?: string | null;
  detail?: Json;
}

export interface WorkerHeartbeatsUpdate {
  worker_id?: string;
  last_seen_at?: string;
  version?: string | null;
  detail?: Json;
}

export interface Database {
  public: {
    Tables: {
    admin_users: { Row: AdminUsersRow; Insert: AdminUsersInsert; Update: AdminUsersUpdate; Relationships: [] };
    assets: { Row: AssetsRow; Insert: AssetsInsert; Update: AssetsUpdate; Relationships: [] };
    attribution: { Row: AttributionRow; Insert: AttributionInsert; Update: AttributionUpdate; Relationships: [] };
    audit_log: { Row: AuditLogRow; Insert: AuditLogInsert; Update: AuditLogUpdate; Relationships: [] };
    brand_voices: { Row: BrandVoicesRow; Insert: BrandVoicesInsert; Update: BrandVoicesUpdate; Relationships: [] };
    calibration_reviews: { Row: CalibrationReviewsRow; Insert: CalibrationReviewsInsert; Update: CalibrationReviewsUpdate; Relationships: [] };
    comment_replies: { Row: CommentRepliesRow; Insert: CommentRepliesInsert; Update: CommentRepliesUpdate; Relationships: [] };
    comments: { Row: CommentsRow; Insert: CommentsInsert; Update: CommentsUpdate; Relationships: [] };
    compose_sessions: { Row: ComposeSessionsRow; Insert: ComposeSessionsInsert; Update: ComposeSessionsUpdate; Relationships: [] };
    content_items: { Row: ContentItemsRow; Insert: ContentItemsInsert; Update: ContentItemsUpdate; Relationships: [] };
    hooks: { Row: HooksRow; Insert: HooksInsert; Update: HooksUpdate; Relationships: [] };
    ideas: { Row: IdeasRow; Insert: IdeasInsert; Update: IdeasUpdate; Relationships: [] };
    jobs: { Row: JobsRow; Insert: JobsInsert; Update: JobsUpdate; Relationships: [] };
    notifications: { Row: NotificationsRow; Insert: NotificationsInsert; Update: NotificationsUpdate; Relationships: [] };
    onboarding_state: { Row: OnboardingStateRow; Insert: OnboardingStateInsert; Update: OnboardingStateUpdate; Relationships: [] };
    performance_scores: { Row: PerformanceScoresRow; Insert: PerformanceScoresInsert; Update: PerformanceScoresUpdate; Relationships: [] };
    post_metrics: { Row: PostMetricsRow; Insert: PostMetricsInsert; Update: PostMetricsUpdate; Relationships: [] };
    products: { Row: ProductsRow; Insert: ProductsInsert; Update: ProductsUpdate; Relationships: [] };
    publications: { Row: PublicationsRow; Insert: PublicationsInsert; Update: PublicationsUpdate; Relationships: [] };
    references_swipe: { Row: ReferencesSwipeRow; Insert: ReferencesSwipeInsert; Update: ReferencesSwipeUpdate; Relationships: [] };
    renders: { Row: RendersRow; Insert: RendersInsert; Update: RendersUpdate; Relationships: [] };
    series: { Row: SeriesRow; Insert: SeriesInsert; Update: SeriesUpdate; Relationships: [] };
    settings: { Row: SettingsRow; Insert: SettingsInsert; Update: SettingsUpdate; Relationships: [] };
    signals: { Row: SignalsRow; Insert: SignalsInsert; Update: SignalsUpdate; Relationships: [] };
    slots: { Row: SlotsRow; Insert: SlotsInsert; Update: SlotsUpdate; Relationships: [] };
    social_accounts: { Row: SocialAccountsRow; Insert: SocialAccountsInsert; Update: SocialAccountsUpdate; Relationships: [] };
    submissions: { Row: SubmissionsRow; Insert: SubmissionsInsert; Update: SubmissionsUpdate; Relationships: [] };
    templates: { Row: TemplatesRow; Insert: TemplatesInsert; Update: TemplatesUpdate; Relationships: [] };
    voice_lexicon: { Row: VoiceLexiconRow; Insert: VoiceLexiconInsert; Update: VoiceLexiconUpdate; Relationships: [] };
    worker_heartbeats: { Row: WorkerHeartbeatsRow; Insert: WorkerHeartbeatsInsert; Update: WorkerHeartbeatsUpdate; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      claim_next_job: { Args: { p_worker_id: string; p_kinds?: string[] }; Returns: JobsRow[] };
      reap_stale_jobs: { Args: { p_timeout?: string }; Returns: number };
      content_mix_actual: {
        Args: { p_product_id: string; p_persona: string; p_days?: number };
        Returns: Array<{ category: string; published: number; share: number }>;
      };
      product_content_share: {
        Args: { p_product_id: string; p_persona: string; p_days?: number };
        Returns: number;
      };
      queue_health: {
        Args: Record<string, never>;
        Returns: Array<{
          queued: number;
          running: number;
          failed_24h: number;
          dead: number;
          oldest_queued_seconds: number;
        }>;
      };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

