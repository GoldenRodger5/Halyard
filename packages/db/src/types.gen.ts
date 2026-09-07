/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with:  DATABASE_URL=postgres://... pnpm db:types
 * Source: scripts/gen-types.ts, reading information_schema of the migrated schema.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];


export interface AccountIntelligenceRow {
  id: string;
  account_id: string;
  product_id: string | null;
  observed_at: string;
  window_size: number;
  slices: Json;
  findings: Json;
  gaps: Json;
  exploration_share: number | null;
  summary: string;
  created_at: string;
}

export interface AccountIntelligenceInsert {
  id?: string;
  account_id: string;
  product_id?: string | null;
  observed_at?: string;
  window_size: number;
  slices?: Json;
  findings?: Json;
  gaps?: Json;
  exploration_share?: number | null;
  summary: string;
  created_at?: string;
}

export interface AccountIntelligenceUpdate {
  id?: string;
  account_id?: string;
  product_id?: string | null;
  observed_at?: string;
  window_size?: number;
  slices?: Json;
  findings?: Json;
  gaps?: Json;
  exploration_share?: number | null;
  summary?: string;
  created_at?: string;
}

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

export interface AgentRunsRow {
  run_id: string;
  agent_id: string;
  agent_version: string;
  team: string;
  trigger: 'job' | 'ui_action' | 'schedule' | 'test' | 'manual' | 'unknown';
  trigger_ref: string | null;
  input_ref: Json;
  output_ref: Json;
  status: 'running' | 'succeeded' | 'failed' | 'refused' | 'skipped';
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  retry_count: number;
  error: string | null;
  cost_usd: number | null;
  downstream_consumer: string | null;
  downstream_consumed_at: string | null;
  created_at: string;
}

export interface AgentRunsInsert {
  run_id?: string;
  agent_id: string;
  agent_version: string;
  team: string;
  trigger: 'job' | 'ui_action' | 'schedule' | 'test' | 'manual' | 'unknown';
  trigger_ref?: string | null;
  input_ref?: Json;
  output_ref?: Json;
  status: 'running' | 'succeeded' | 'failed' | 'refused' | 'skipped';
  started_at?: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  retry_count?: number;
  error?: string | null;
  cost_usd?: number | null;
  downstream_consumer?: string | null;
  downstream_consumed_at?: string | null;
  created_at?: string;
}

export interface AgentRunsUpdate {
  run_id?: string;
  agent_id?: string;
  agent_version?: string;
  team?: string;
  trigger?: 'job' | 'ui_action' | 'schedule' | 'test' | 'manual' | 'unknown';
  trigger_ref?: string | null;
  input_ref?: Json;
  output_ref?: Json;
  status?: 'running' | 'succeeded' | 'failed' | 'refused' | 'skipped';
  started_at?: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  retry_count?: number;
  error?: string | null;
  cost_usd?: number | null;
  downstream_consumer?: string | null;
  downstream_consumed_at?: string | null;
  created_at?: string;
}

export interface AppStoreAttributionRow {
  id: string;
  content_item_id: string | null;
  campaign_id: string | null;
  campaign_token: string | null;
  impressions: number | null;
  product_page_views: number | null;
  installs: number | null;
  first_time_downloads: number | null;
  redownloads: number | null;
  proceeds_usd: number | null;
  collected_at: string;
  source: string;
}

export interface AppStoreAttributionInsert {
  id?: string;
  content_item_id?: string | null;
  campaign_id?: string | null;
  campaign_token?: string | null;
  impressions?: number | null;
  product_page_views?: number | null;
  installs?: number | null;
  first_time_downloads?: number | null;
  redownloads?: number | null;
  proceeds_usd?: number | null;
  collected_at?: string;
  source?: string;
}

export interface AppStoreAttributionUpdate {
  id?: string;
  content_item_id?: string | null;
  campaign_id?: string | null;
  campaign_token?: string | null;
  impressions?: number | null;
  product_page_views?: number | null;
  installs?: number | null;
  first_time_downloads?: number | null;
  redownloads?: number | null;
  proceeds_usd?: number | null;
  collected_at?: string;
  source?: string;
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
  flow_id: string | null;
  app_version: string | null;
  captured_at: string | null;
  source_url: string | null;
  original_filename: string | null;
  checksum: string | null;
  alt_text: string | null;
  archived_at: string | null;
  archived_reason: string | null;
  last_used_at: string | null;
  shot: string | null;
  subject: string | null;
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
  flow_id?: string | null;
  app_version?: string | null;
  captured_at?: string | null;
  source_url?: string | null;
  original_filename?: string | null;
  checksum?: string | null;
  alt_text?: string | null;
  archived_at?: string | null;
  archived_reason?: string | null;
  last_used_at?: string | null;
  shot?: string | null;
  subject?: string | null;
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
  flow_id?: string | null;
  app_version?: string | null;
  captured_at?: string | null;
  source_url?: string | null;
  original_filename?: string | null;
  checksum?: string | null;
  alt_text?: string | null;
  archived_at?: string | null;
  archived_reason?: string | null;
  last_used_at?: string | null;
  shot?: string | null;
  subject?: string | null;
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

export interface AuditorFindingsRow {
  id: string;
  auditor_run_id: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
  subject: string;
  subject_kind: 'agent' | 'job' | 'gate' | 'integration' | 'feature' | 'source';
  detail: string;
  evidence: Json;
  created_at: string;
}

export interface AuditorFindingsInsert {
  id?: string;
  auditor_run_id: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
  subject: string;
  subject_kind: 'agent' | 'job' | 'gate' | 'integration' | 'feature' | 'source';
  detail: string;
  evidence?: Json;
  created_at?: string;
}

export interface AuditorFindingsUpdate {
  id?: string;
  auditor_run_id?: string;
  rule?: string;
  severity?: 'error' | 'warning' | 'info';
  subject?: string;
  subject_kind?: 'agent' | 'job' | 'gate' | 'integration' | 'feature' | 'source';
  detail?: string;
  evidence?: Json;
  created_at?: string;
}

export interface AuditorRunsRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  findings_total: number;
  findings_error: number;
  findings_warning: number;
  capabilities_audited: number;
  git_sha: string | null;
  triggered_by: string;
}

export interface AuditorRunsInsert {
  id?: string;
  started_at?: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  findings_total?: number;
  findings_error?: number;
  findings_warning?: number;
  capabilities_audited?: number;
  git_sha?: string | null;
  triggered_by?: string;
}

export interface AuditorRunsUpdate {
  id?: string;
  started_at?: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  findings_total?: number;
  findings_error?: number;
  findings_warning?: number;
  capabilities_audited?: number;
  git_sha?: string | null;
  triggered_by?: string;
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

export interface CampaignsRow {
  id: string;
  product_id: string;
  name: string;
  kind: 'launch' | 'feature' | 'seasonal' | 'experiment' | 'other';
  brief: string | null;
  goal: string | null;
  starts_at: string;
  ends_at: string;
  destination_override: string | null;
  product_mix_ceiling: number;
  status: 'planning' | 'staged' | 'running' | 'complete' | 'abandoned';
  created_at: string;
  updated_at: string;
}

export interface CampaignsInsert {
  id?: string;
  product_id: string;
  name: string;
  kind?: 'launch' | 'feature' | 'seasonal' | 'experiment' | 'other';
  brief?: string | null;
  goal?: string | null;
  starts_at: string;
  ends_at: string;
  destination_override?: string | null;
  product_mix_ceiling?: number;
  status?: 'planning' | 'staged' | 'running' | 'complete' | 'abandoned';
  created_at?: string;
  updated_at?: string;
}

export interface CampaignsUpdate {
  id?: string;
  product_id?: string;
  name?: string;
  kind?: 'launch' | 'feature' | 'seasonal' | 'experiment' | 'other';
  brief?: string | null;
  goal?: string | null;
  starts_at?: string;
  ends_at?: string;
  destination_override?: string | null;
  product_mix_ceiling?: number;
  status?: 'planning' | 'staged' | 'running' | 'complete' | 'abandoned';
  created_at?: string;
  updated_at?: string;
}

export interface CapabilityAuditStateRow {
  capability_id: string;
  kind: 'agent' | 'job' | 'gate' | 'integration' | 'feature';
  state: 'implemented_exercised' | 'implemented_partial' | 'implemented_no_caller' | 'planned' | 'blocked' | 'regression';
  reason: string;
  evidence: Json;
  declared_state: string | null;
  determined_at: string;
  determined_by: string;
  previous_state: string | null;
  changed_at: string | null;
}

export interface CapabilityAuditStateInsert {
  capability_id: string;
  kind: 'agent' | 'job' | 'gate' | 'integration' | 'feature';
  state: 'implemented_exercised' | 'implemented_partial' | 'implemented_no_caller' | 'planned' | 'blocked' | 'regression';
  reason: string;
  evidence?: Json;
  declared_state?: string | null;
  determined_at?: string;
  determined_by?: string;
  previous_state?: string | null;
  changed_at?: string | null;
}

export interface CapabilityAuditStateUpdate {
  capability_id?: string;
  kind?: 'agent' | 'job' | 'gate' | 'integration' | 'feature';
  state?: 'implemented_exercised' | 'implemented_partial' | 'implemented_no_caller' | 'planned' | 'blocked' | 'regression';
  reason?: string;
  evidence?: Json;
  declared_state?: string | null;
  determined_at?: string;
  determined_by?: string;
  previous_state?: string | null;
  changed_at?: string | null;
}

export interface CapabilityProbesRow {
  id: string;
  provider: string;
  platform: string | null;
  action: string | null;
  method: 'live_api' | 'dry_run' | 'manual';
  outcome: 'confirmed' | 'refuted' | 'unavailable' | 'error';
  detail: string;
  observed: Json;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  triggered_by: string;
  job_id: string | null;
  account_id: string | null;
}

export interface CapabilityProbesInsert {
  id?: string;
  provider: string;
  platform?: string | null;
  action?: string | null;
  method: 'live_api' | 'dry_run' | 'manual';
  outcome: 'confirmed' | 'refuted' | 'unavailable' | 'error';
  detail: string;
  observed?: Json;
  started_at?: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  triggered_by?: string;
  job_id?: string | null;
  account_id?: string | null;
}

export interface CapabilityProbesUpdate {
  id?: string;
  provider?: string;
  platform?: string | null;
  action?: string | null;
  method?: 'live_api' | 'dry_run' | 'manual';
  outcome?: 'confirmed' | 'refuted' | 'unavailable' | 'error';
  detail?: string;
  observed?: Json;
  started_at?: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  triggered_by?: string;
  job_id?: string | null;
  account_id?: string | null;
}

export interface CaptureAuditRow {
  id: string;
  product_id: string;
  flow_id: string;
  capture_run_id: string | null;
  kind: string;
  finding: string;
  recovery: string;
  acted: boolean;
  action_taken: Json | null;
  resolved_at: string | null;
  created_at: string;
}

export interface CaptureAuditInsert {
  id?: string;
  product_id: string;
  flow_id: string;
  capture_run_id?: string | null;
  kind: string;
  finding: string;
  recovery: string;
  acted?: boolean;
  action_taken?: Json | null;
  resolved_at?: string | null;
  created_at?: string;
}

export interface CaptureAuditUpdate {
  id?: string;
  product_id?: string;
  flow_id?: string;
  capture_run_id?: string | null;
  kind?: string;
  finding?: string;
  recovery?: string;
  acted?: boolean;
  action_taken?: Json | null;
  resolved_at?: string | null;
  created_at?: string;
}

export interface CaptureRunsRow {
  id: string;
  product_id: string;
  flow_id: string;
  mode: 'verify' | 'capture';
  ok: boolean;
  base_url: string;
  app_version: string | null;
  started_at: string;
  duration_ms: number | null;
  steps: Json;
  elisions: Json;
  asset_ids: string[];
  video_asset_id: string | null;
  summary: string;
  failure_screenshot_path: string | null;
}

export interface CaptureRunsInsert {
  id?: string;
  product_id: string;
  flow_id: string;
  mode: 'verify' | 'capture';
  ok: boolean;
  base_url: string;
  app_version?: string | null;
  started_at?: string;
  duration_ms?: number | null;
  steps?: Json;
  elisions?: Json;
  asset_ids?: string[];
  video_asset_id?: string | null;
  summary: string;
  failure_screenshot_path?: string | null;
}

export interface CaptureRunsUpdate {
  id?: string;
  product_id?: string;
  flow_id?: string;
  mode?: 'verify' | 'capture';
  ok?: boolean;
  base_url?: string;
  app_version?: string | null;
  started_at?: string;
  duration_ms?: number | null;
  steps?: Json;
  elisions?: Json;
  asset_ids?: string[];
  video_asset_id?: string | null;
  summary?: string;
  failure_screenshot_path?: string | null;
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

export interface ConceptsRow {
  id: string;
  product_id: string;
  idea_id: string | null;
  signal_id: string | null;
  strategy_decision_id: string | null;
  title: string;
  premise: string;
  hook: string | null;
  audience: string | null;
  objective: 'awareness' | 'engagement' | 'education' | 'traffic' | 'conversion' | 'retention' | 'follower_growth' | 'product_promotion';
  emotional_angle: string | null;
  story_structure: Json;
  visual_treatment: Json;
  audio_direction: Json;
  platform_intent: string[];
  differentiation: string | null;
  evidence_requirements: Json;
  imagery_requirements: Json;
  retention_strategy: string | null;
  score: number | null;
  score_breakdown: Json;
  status: 'proposed' | 'selected' | 'rejected' | 'used' | 'expired';
  rejected_reason: string | null;
  selected_at: string | null;
  batch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConceptsInsert {
  id?: string;
  product_id: string;
  idea_id?: string | null;
  signal_id?: string | null;
  strategy_decision_id?: string | null;
  title: string;
  premise: string;
  hook?: string | null;
  audience?: string | null;
  objective: 'awareness' | 'engagement' | 'education' | 'traffic' | 'conversion' | 'retention' | 'follower_growth' | 'product_promotion';
  emotional_angle?: string | null;
  story_structure?: Json;
  visual_treatment?: Json;
  audio_direction?: Json;
  platform_intent?: string[];
  differentiation?: string | null;
  evidence_requirements?: Json;
  imagery_requirements?: Json;
  retention_strategy?: string | null;
  score?: number | null;
  score_breakdown?: Json;
  status?: 'proposed' | 'selected' | 'rejected' | 'used' | 'expired';
  rejected_reason?: string | null;
  selected_at?: string | null;
  batch_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ConceptsUpdate {
  id?: string;
  product_id?: string;
  idea_id?: string | null;
  signal_id?: string | null;
  strategy_decision_id?: string | null;
  title?: string;
  premise?: string;
  hook?: string | null;
  audience?: string | null;
  objective?: 'awareness' | 'engagement' | 'education' | 'traffic' | 'conversion' | 'retention' | 'follower_growth' | 'product_promotion';
  emotional_angle?: string | null;
  story_structure?: Json;
  visual_treatment?: Json;
  audio_direction?: Json;
  platform_intent?: string[];
  differentiation?: string | null;
  evidence_requirements?: Json;
  imagery_requirements?: Json;
  retention_strategy?: string | null;
  score?: number | null;
  score_breakdown?: Json;
  status?: 'proposed' | 'selected' | 'rejected' | 'used' | 'expired';
  rejected_reason?: string | null;
  selected_at?: string | null;
  batch_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ConnectorCallsRow {
  id: string;
  product_id: string;
  tool: string;
  ok: boolean;
  duration_ms: number | null;
  error: string | null;
  cached: boolean;
  called_at: string;
}

export interface ConnectorCallsInsert {
  id?: string;
  product_id: string;
  tool: string;
  ok: boolean;
  duration_ms?: number | null;
  error?: string | null;
  cached?: boolean;
  called_at?: string;
}

export interface ConnectorCallsUpdate {
  id?: string;
  product_id?: string;
  tool?: string;
  ok?: boolean;
  duration_ms?: number | null;
  error?: string | null;
  cached?: boolean;
  called_at?: string;
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
  product_artifact_id: string | null;
  about_product_id: string | null;
  hook_variant_id: string | null;
  experiment_id: string | null;
  format_subtype: string | null;
  routing_scope: string | null;
  destination_type: 'share_link' | 'app_store' | 'web' | 'link_in_bio' | null;
  destination_url: string | null;
  destination_reason: string | null;
  campaign_id: string | null;
  attached_asset_ids: string[];
  board_id: string | null;
  board_reason: string | null;
  media_observations: Json | null;
  tiktok_options: Json | null;
  tiktok_creator_info: Json | null;
  tiktok_creator_info_at: string | null;
  tiktok_last_error: string | null;
  overflow_body: string | null;
  overflow_home: 'first_comment' | 'reply' | 'description' | 'none' | null;
  overflow_posted_at: string | null;
  concept_id: string | null;
  brief_id: string | null;
  post_format: string | null;
  vo_lines: Json | null;
  screenplay: Json | null;
  caption_shape: string | null;
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
  product_artifact_id?: string | null;
  about_product_id?: string | null;
  hook_variant_id?: string | null;
  experiment_id?: string | null;
  format_subtype?: string | null;
  destination_type?: 'share_link' | 'app_store' | 'web' | 'link_in_bio' | null;
  destination_url?: string | null;
  destination_reason?: string | null;
  campaign_id?: string | null;
  attached_asset_ids?: string[];
  board_id?: string | null;
  board_reason?: string | null;
  media_observations?: Json | null;
  tiktok_options?: Json | null;
  tiktok_creator_info?: Json | null;
  tiktok_creator_info_at?: string | null;
  tiktok_last_error?: string | null;
  overflow_body?: string | null;
  overflow_home?: 'first_comment' | 'reply' | 'description' | 'none' | null;
  overflow_posted_at?: string | null;
  concept_id?: string | null;
  brief_id?: string | null;
  post_format?: string | null;
  vo_lines?: Json | null;
  screenplay?: Json | null;
  caption_shape?: string | null;
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
  product_artifact_id?: string | null;
  about_product_id?: string | null;
  hook_variant_id?: string | null;
  experiment_id?: string | null;
  format_subtype?: string | null;
  destination_type?: 'share_link' | 'app_store' | 'web' | 'link_in_bio' | null;
  destination_url?: string | null;
  destination_reason?: string | null;
  campaign_id?: string | null;
  attached_asset_ids?: string[];
  board_id?: string | null;
  board_reason?: string | null;
  media_observations?: Json | null;
  tiktok_options?: Json | null;
  tiktok_creator_info?: Json | null;
  tiktok_creator_info_at?: string | null;
  tiktok_last_error?: string | null;
  overflow_body?: string | null;
  overflow_home?: 'first_comment' | 'reply' | 'description' | 'none' | null;
  overflow_posted_at?: string | null;
  concept_id?: string | null;
  brief_id?: string | null;
  post_format?: string | null;
  vo_lines?: Json | null;
  screenplay?: Json | null;
  caption_shape?: string | null;
}

export interface ContentIterationsRow {
  id: string;
  content_item_id: string;
  iteration: number;
  parent_iteration: number | null;
  gates: Json;
  defects: Json;
  snapshot: Json;
  action: string | null;
  reason: string | null;
  changed: string[];
  invalidated: string[];
  regressions: Json;
  body: string | null;
  vo_asset_id: string | null;
  render_id: string | null;
  cost_usd: number;
  duration_ms: number | null;
  outcome: 'generated' | 'corrected' | 'accepted' | 'rejected_regression' | 'escalated' | 'exhausted';
  created_at: string;
}

export interface ContentIterationsInsert {
  id?: string;
  content_item_id: string;
  iteration: number;
  parent_iteration?: number | null;
  gates?: Json;
  defects?: Json;
  snapshot?: Json;
  action?: string | null;
  reason?: string | null;
  changed?: string[];
  invalidated?: string[];
  regressions?: Json;
  body?: string | null;
  vo_asset_id?: string | null;
  render_id?: string | null;
  cost_usd?: number;
  duration_ms?: number | null;
  outcome: 'generated' | 'corrected' | 'accepted' | 'rejected_regression' | 'escalated' | 'exhausted';
  created_at?: string;
}

export interface ContentIterationsUpdate {
  id?: string;
  content_item_id?: string;
  iteration?: number;
  parent_iteration?: number | null;
  gates?: Json;
  defects?: Json;
  snapshot?: Json;
  action?: string | null;
  reason?: string | null;
  changed?: string[];
  invalidated?: string[];
  regressions?: Json;
  body?: string | null;
  vo_asset_id?: string | null;
  render_id?: string | null;
  cost_usd?: number;
  duration_ms?: number | null;
  outcome?: 'generated' | 'corrected' | 'accepted' | 'rejected_regression' | 'escalated' | 'exhausted';
  created_at?: string;
}

export interface CreativeBriefsRow {
  id: string;
  concept_id: string | null;
  product_id: string;
  account_id: string | null;
  platform: string;
  treatment: string;
  presentation_mode: 'editorial' | 'punch';
  target_seconds: number | null;
  aspect_ratio: string | null;
  beats: Json;
  visual_direction: Json;
  audio_direction: Json;
  caption_direction: Json;
  evidence: string[];
  rationale: string | null;
  created_at: string;
}

export interface CreativeBriefsInsert {
  id?: string;
  concept_id?: string | null;
  product_id: string;
  account_id?: string | null;
  platform: string;
  treatment: string;
  presentation_mode?: 'editorial' | 'punch';
  target_seconds?: number | null;
  aspect_ratio?: string | null;
  beats?: Json;
  visual_direction?: Json;
  audio_direction?: Json;
  caption_direction?: Json;
  evidence?: string[];
  rationale?: string | null;
  created_at?: string;
}

export interface CreativeBriefsUpdate {
  id?: string;
  concept_id?: string | null;
  product_id?: string;
  account_id?: string | null;
  platform?: string;
  treatment?: string;
  presentation_mode?: 'editorial' | 'punch';
  target_seconds?: number | null;
  aspect_ratio?: string | null;
  beats?: Json;
  visual_direction?: Json;
  audio_direction?: Json;
  caption_direction?: Json;
  evidence?: string[];
  rationale?: string | null;
  created_at?: string;
}

export interface DesiredHandlesRow {
  product_id: string;
  platform: string;
  handle: string;
  last_status: string | null;
  last_detail: string | null;
  last_method: string | null;
  checked_at: string | null;
}

export interface DesiredHandlesInsert {
  product_id: string;
  platform: string;
  handle: string;
  last_status?: string | null;
  last_detail?: string | null;
  last_method?: string | null;
  checked_at?: string | null;
}

export interface DesiredHandlesUpdate {
  product_id?: string;
  platform?: string;
  handle?: string;
  last_status?: string | null;
  last_detail?: string | null;
  last_method?: string | null;
  checked_at?: string | null;
}

export interface FeatureClaimsRow {
  id: string;
  product_id: string;
  name: string;
  summary: string;
  source: 'crawl' | 'code' | 'connector' | 'brief' | 'operator';
  replay: Json;
  evidence: Json;
  status: 'unverified' | 'verified' | 'refuted' | 'unverifiable';
  verified_at: string | null;
  last_attempt_at: string | null;
  attempts: number;
  last_verdict: string | null;
  last_elapsed_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureClaimsInsert {
  id?: string;
  product_id: string;
  name: string;
  summary: string;
  source: 'crawl' | 'code' | 'connector' | 'brief' | 'operator';
  replay: Json;
  evidence?: Json;
  status?: 'unverified' | 'verified' | 'refuted' | 'unverifiable';
  verified_at?: string | null;
  last_attempt_at?: string | null;
  attempts?: number;
  last_verdict?: string | null;
  last_elapsed_ms?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface FeatureClaimsUpdate {
  id?: string;
  product_id?: string;
  name?: string;
  summary?: string;
  source?: 'crawl' | 'code' | 'connector' | 'brief' | 'operator';
  replay?: Json;
  evidence?: Json;
  status?: 'unverified' | 'verified' | 'refuted' | 'unverifiable';
  verified_at?: string | null;
  last_attempt_at?: string | null;
  attempts?: number;
  last_verdict?: string | null;
  last_elapsed_ms?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface FindsRow {
  id: string;
  product_id: string;
  url: string;
  title: string | null;
  summary: string | null;
  suggested_angle: string | null;
  why_useful: string | null;
  source: 'paste' | 'bookmarklet' | 'shortcut' | 'rss';
  status: 'new' | 'drafted' | 'used' | 'discarded';
  content_item_id: string | null;
  created_at: string;
}

export interface FindsInsert {
  id?: string;
  product_id: string;
  url: string;
  title?: string | null;
  summary?: string | null;
  suggested_angle?: string | null;
  why_useful?: string | null;
  source?: 'paste' | 'bookmarklet' | 'shortcut' | 'rss';
  status?: 'new' | 'drafted' | 'used' | 'discarded';
  content_item_id?: string | null;
  created_at?: string;
}

export interface FindsUpdate {
  id?: string;
  product_id?: string;
  url?: string;
  title?: string | null;
  summary?: string | null;
  suggested_angle?: string | null;
  why_useful?: string | null;
  source?: 'paste' | 'bookmarklet' | 'shortcut' | 'rss';
  status?: 'new' | 'drafted' | 'used' | 'discarded';
  content_item_id?: string | null;
  created_at?: string;
}

export interface FormatCadenceRow {
  id: string;
  product_id: string;
  format: string;
  weekly_floor: number;
  weekly_ceiling: number;
  reason: string | null;
}

export interface FormatCadenceInsert {
  id?: string;
  product_id: string;
  format: string;
  weekly_floor?: number;
  weekly_ceiling?: number;
  reason?: string | null;
}

export interface FormatCadenceUpdate {
  id?: string;
  product_id?: string;
  format?: string;
  weekly_floor?: number;
  weekly_ceiling?: number;
  reason?: string | null;
}

export interface HookExperimentsRow {
  id: string;
  product_id: string;
  hypothesis: string;
  status: 'running' | 'concluded' | 'abandoned';
  controls: Json;
  started_at: string;
  concluded_at: string | null;
  outcome: string | null;
}

export interface HookExperimentsInsert {
  id?: string;
  product_id: string;
  hypothesis: string;
  status?: 'running' | 'concluded' | 'abandoned';
  controls?: Json;
  started_at?: string;
  concluded_at?: string | null;
  outcome?: string | null;
}

export interface HookExperimentsUpdate {
  id?: string;
  product_id?: string;
  hypothesis?: string;
  status?: 'running' | 'concluded' | 'abandoned';
  controls?: Json;
  started_at?: string;
  concluded_at?: string | null;
  outcome?: string | null;
}

export interface HookVariantsRow {
  id: string;
  content_item_id: string;
  hook_type: string;
  text_hook: string;
  spoken_hook: string | null;
  visual_direction: string | null;
  caption_hook: string | null;
  predicted_stop_rate: number | null;
  prediction_basis: string | null;
  selected: boolean;
  experiment_id: string | null;
  variant_label: string | null;
  rejected_reason: string | null;
  created_at: string;
}

export interface HookVariantsInsert {
  id?: string;
  content_item_id: string;
  hook_type: string;
  text_hook: string;
  spoken_hook?: string | null;
  visual_direction?: string | null;
  caption_hook?: string | null;
  predicted_stop_rate?: number | null;
  prediction_basis?: string | null;
  selected?: boolean;
  experiment_id?: string | null;
  variant_label?: string | null;
  rejected_reason?: string | null;
  created_at?: string;
}

export interface HookVariantsUpdate {
  id?: string;
  content_item_id?: string;
  hook_type?: string;
  text_hook?: string;
  spoken_hook?: string | null;
  visual_direction?: string | null;
  caption_hook?: string | null;
  predicted_stop_rate?: number | null;
  prediction_basis?: string | null;
  selected?: boolean;
  experiment_id?: string | null;
  variant_label?: string | null;
  rejected_reason?: string | null;
  created_at?: string;
}

export interface HooksRow {
  id: string;
  product_id: string | null;
  pattern: string;
  platform: string | null;
  category: string | null;
  source: 'seeded' | 'calibration' | 'approved_post' | 'manual' | 'swipe' | 'generated';
  uses: number;
  avg_stop_rate: number | null;
  avg_score: number | null;
  active: boolean;
  created_at: string;
  hook_type: string;
  layer: 'text' | 'spoken' | 'visual' | 'caption';
  pattern_template: string | null;
  last_used_at: string | null;
  recency_weighted_score: number | null;
  format: string | null;
}

export interface HooksInsert {
  id?: string;
  product_id?: string | null;
  pattern: string;
  platform?: string | null;
  category?: string | null;
  source?: 'seeded' | 'calibration' | 'approved_post' | 'manual' | 'swipe' | 'generated';
  uses?: number;
  avg_stop_rate?: number | null;
  avg_score?: number | null;
  active?: boolean;
  created_at?: string;
  hook_type: string;
  layer?: 'text' | 'spoken' | 'visual' | 'caption';
  pattern_template?: string | null;
  last_used_at?: string | null;
  recency_weighted_score?: number | null;
  format?: string | null;
}

export interface HooksUpdate {
  id?: string;
  product_id?: string | null;
  pattern?: string;
  platform?: string | null;
  category?: string | null;
  source?: 'seeded' | 'calibration' | 'approved_post' | 'manual' | 'swipe' | 'generated';
  uses?: number;
  avg_stop_rate?: number | null;
  avg_score?: number | null;
  active?: boolean;
  created_at?: string;
  hook_type?: string;
  layer?: 'text' | 'spoken' | 'visual' | 'caption';
  pattern_template?: string | null;
  last_used_at?: string | null;
  recency_weighted_score?: number | null;
  format?: string | null;
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
  about_product_id: string | null;
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
  about_product_id?: string | null;
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
  about_product_id?: string | null;
}

export interface JobEventsRow {
  id: number;
  job_id: string;
  message: string;
  detail: Json | null;
  at: string;
  stage: string | null;
}

export interface JobEventsInsert {
  id?: number;
  job_id: string;
  message: string;
  detail?: Json | null;
  at?: string;
  stage?: string | null;
}

export interface JobEventsUpdate {
  id?: number;
  job_id?: string;
  message?: string;
  detail?: Json | null;
  at?: string;
  stage?: string | null;
}

export interface JobsRow {
  id: string;
  kind: 'generate' | 'render' | 'tts' | 'capture' | 'publish' | 'collect_metrics' | 'collect_signals' | 'collect_comments' | 'collect_attribution' | 'refresh_tokens' | 'score_performance' | 'digest_email' | 'reconcile_schedule' | 'mark_stale_assets' | 'collect_app_store' | 'detect_release' | 'collect_watch_terms' | 'draft_newsletter' | 'send_newsletter' | 'collect_reviews' | 'review_media' | 'verify_feature' | 'explore_product' | 'cluster_rejections' | 'purge_logs' | 'collect_product_evidence' | 'build_product_brain' | 'verify_provider_capability' | 'correct_content' | 'learn_from_performance' | 'build_account_intelligence' | 'generate_concepts';
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
  kind: 'generate' | 'render' | 'tts' | 'capture' | 'publish' | 'collect_metrics' | 'collect_signals' | 'collect_comments' | 'collect_attribution' | 'refresh_tokens' | 'score_performance' | 'digest_email' | 'reconcile_schedule' | 'mark_stale_assets' | 'collect_app_store' | 'detect_release' | 'collect_watch_terms' | 'draft_newsletter' | 'send_newsletter' | 'collect_reviews' | 'review_media' | 'verify_feature' | 'explore_product' | 'cluster_rejections' | 'purge_logs' | 'collect_product_evidence' | 'build_product_brain' | 'verify_provider_capability' | 'correct_content' | 'learn_from_performance' | 'build_account_intelligence' | 'generate_concepts';
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
  kind?: 'generate' | 'render' | 'tts' | 'capture' | 'publish' | 'collect_metrics' | 'collect_signals' | 'collect_comments' | 'collect_attribution' | 'refresh_tokens' | 'score_performance' | 'digest_email' | 'reconcile_schedule' | 'mark_stale_assets' | 'collect_app_store' | 'detect_release' | 'collect_watch_terms' | 'draft_newsletter' | 'send_newsletter' | 'collect_reviews' | 'review_media' | 'verify_feature' | 'explore_product' | 'cluster_rejections' | 'purge_logs' | 'collect_product_evidence' | 'build_product_brain' | 'verify_provider_capability' | 'correct_content' | 'learn_from_performance' | 'build_account_intelligence' | 'generate_concepts';
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

export interface LearnedInsightsRow {
  id: string;
  scope: 'global' | 'platform' | 'account';
  platform: string | null;
  account_id: string | null;
  product_id: string | null;
  feature: string;
  feature_value: string;
  cohort_mean: number;
  baseline_mean: number;
  lift: number;
  sample_size: number;
  baseline_size: number;
  status: 'observed' | 'inferred' | 'validated';
  confidence: number;
  corroborations: number;
  supporting_content_ids: string[];
  contradicting_content_ids: string[];
  evidence_window_start: string | null;
  evidence_window_end: string | null;
  observation: string;
  recommendation: string;
  review_after: string;
  created_at: string;
  updated_at: string;
}

export interface LearnedInsightsInsert {
  id?: string;
  scope: 'global' | 'platform' | 'account';
  platform?: string | null;
  account_id?: string | null;
  product_id?: string | null;
  feature: string;
  feature_value: string;
  cohort_mean: number;
  baseline_mean: number;
  lift: number;
  sample_size: number;
  baseline_size: number;
  status: 'observed' | 'inferred' | 'validated';
  confidence: number;
  corroborations?: number;
  supporting_content_ids?: string[];
  contradicting_content_ids?: string[];
  evidence_window_start?: string | null;
  evidence_window_end?: string | null;
  observation: string;
  recommendation: string;
  review_after: string;
  created_at?: string;
  updated_at?: string;
}

export interface LearnedInsightsUpdate {
  id?: string;
  scope?: 'global' | 'platform' | 'account';
  platform?: string | null;
  account_id?: string | null;
  product_id?: string | null;
  feature?: string;
  feature_value?: string;
  cohort_mean?: number;
  baseline_mean?: number;
  lift?: number;
  sample_size?: number;
  baseline_size?: number;
  status?: 'observed' | 'inferred' | 'validated';
  confidence?: number;
  corroborations?: number;
  supporting_content_ids?: string[];
  contradicting_content_ids?: string[];
  evidence_window_start?: string | null;
  evidence_window_end?: string | null;
  observation?: string;
  recommendation?: string;
  review_after?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LinkClicksRow {
  id: string;
  content_item_id: string | null;
  campaign_id: string | null;
  device_class: 'ios' | 'android' | 'desktop' | 'bot' | 'unknown';
  platform: string | null;
  referrer: string | null;
  user_agent: string | null;
  destination_type: string | null;
  destination_url: string | null;
  country: string | null;
  clicked_at: string;
}

export interface LinkClicksInsert {
  id?: string;
  content_item_id?: string | null;
  campaign_id?: string | null;
  device_class: 'ios' | 'android' | 'desktop' | 'bot' | 'unknown';
  platform?: string | null;
  referrer?: string | null;
  user_agent?: string | null;
  destination_type?: string | null;
  destination_url?: string | null;
  country?: string | null;
  clicked_at?: string;
}

export interface LinkClicksUpdate {
  id?: string;
  content_item_id?: string | null;
  campaign_id?: string | null;
  device_class?: 'ios' | 'android' | 'desktop' | 'bot' | 'unknown';
  platform?: string | null;
  referrer?: string | null;
  user_agent?: string | null;
  destination_type?: string | null;
  destination_url?: string | null;
  country?: string | null;
  clicked_at?: string;
}

export interface MusicBedsRow {
  id: string;
  asset_id: string;
  product_id: string | null;
  title: string;
  artist: string | null;
  mood: 'warm' | 'bright' | 'calm' | 'driving' | 'playful' | 'tense' | 'melancholy' | 'confident';
  energy: number;
  bpm: number | null;
  genre: string | null;
  instrumentation: string[];
  duration_seconds: number;
  loopable: boolean;
  intro_seconds: number | null;
  licence: string;
  licensor: string | null;
  licence_url: string | null;
  attribution_required: boolean;
  attribution_text: string | null;
  platform_restrictions: string[];
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
  provenance: unknown;
  source: string | null;
  licence_proof: string | null;
  prohibited_platforms: string[];
  has_vocals: boolean | null;
  stems: Json;
  active: boolean;
  usage_count: number;
  account_restrictions: string[];
}

export interface MusicBedsInsert {
  id?: string;
  asset_id: string;
  product_id?: string | null;
  title: string;
  artist?: string | null;
  mood: 'warm' | 'bright' | 'calm' | 'driving' | 'playful' | 'tense' | 'melancholy' | 'confident';
  energy: number;
  bpm?: number | null;
  genre?: string | null;
  instrumentation?: string[];
  duration_seconds: number;
  loopable?: boolean;
  intro_seconds?: number | null;
  licence: string;
  licensor?: string | null;
  licence_url?: string | null;
  attribution_required?: boolean;
  attribution_text?: string | null;
  platform_restrictions?: string[];
  expires_at?: string | null;
  created_at?: string;
  last_used_at?: string | null;
  provenance?: unknown;
  source?: string | null;
  licence_proof?: string | null;
  prohibited_platforms?: string[];
  has_vocals?: boolean | null;
  stems?: Json;
  active?: boolean;
  usage_count?: number;
  account_restrictions?: string[];
}

export interface MusicBedsUpdate {
  id?: string;
  asset_id?: string;
  product_id?: string | null;
  title?: string;
  artist?: string | null;
  mood?: 'warm' | 'bright' | 'calm' | 'driving' | 'playful' | 'tense' | 'melancholy' | 'confident';
  energy?: number;
  bpm?: number | null;
  genre?: string | null;
  instrumentation?: string[];
  duration_seconds?: number;
  loopable?: boolean;
  intro_seconds?: number | null;
  licence?: string;
  licensor?: string | null;
  licence_url?: string | null;
  attribution_required?: boolean;
  attribution_text?: string | null;
  platform_restrictions?: string[];
  expires_at?: string | null;
  created_at?: string;
  last_used_at?: string | null;
  provenance?: unknown;
  source?: string | null;
  licence_proof?: string | null;
  prohibited_platforms?: string[];
  has_vocals?: boolean | null;
  stems?: Json;
  active?: boolean;
  usage_count?: number;
  account_restrictions?: string[];
}

export interface MusicUsageRow {
  id: string;
  music_bed_id: string;
  content_item_id: string | null;
  brief_id: string | null;
  account_id: string | null;
  platform: string;
  treatment: string | null;
  visual_language: string | null;
  reasons: string[];
  used_at: string;
  score: number | null;
  scored_at: string | null;
}

export interface MusicUsageInsert {
  id?: string;
  music_bed_id: string;
  content_item_id?: string | null;
  brief_id?: string | null;
  account_id?: string | null;
  platform: string;
  treatment?: string | null;
  visual_language?: string | null;
  reasons?: string[];
  used_at?: string;
  score?: number | null;
  scored_at?: string | null;
}

export interface MusicUsageUpdate {
  id?: string;
  music_bed_id?: string;
  content_item_id?: string | null;
  brief_id?: string | null;
  account_id?: string | null;
  platform?: string;
  treatment?: string | null;
  visual_language?: string | null;
  reasons?: string[];
  used_at?: string;
  score?: number | null;
  scored_at?: string | null;
}

export interface NewslettersRow {
  id: string;
  product_id: string;
  subject: string;
  preheader: string | null;
  body_markdown: string;
  body_html: string | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'sending' | 'sent' | 'failed';
  period_start: string | null;
  period_end: string | null;
  source_item_ids: string[];
  recipient_count: number | null;
  sent_at: string | null;
  provider_id: string | null;
  error: string | null;
  opens: number | null;
  clicks: number | null;
  created_at: string;
  updated_at: string;
}

export interface NewslettersInsert {
  id?: string;
  product_id: string;
  subject: string;
  preheader?: string | null;
  body_markdown: string;
  body_html?: string | null;
  status?: 'draft' | 'pending_approval' | 'approved' | 'sending' | 'sent' | 'failed';
  period_start?: string | null;
  period_end?: string | null;
  source_item_ids?: string[];
  recipient_count?: number | null;
  sent_at?: string | null;
  provider_id?: string | null;
  error?: string | null;
  opens?: number | null;
  clicks?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface NewslettersUpdate {
  id?: string;
  product_id?: string;
  subject?: string;
  preheader?: string | null;
  body_markdown?: string;
  body_html?: string | null;
  status?: 'draft' | 'pending_approval' | 'approved' | 'sending' | 'sent' | 'failed';
  period_start?: string | null;
  period_end?: string | null;
  source_item_ids?: string[];
  recipient_count?: number | null;
  sent_at?: string | null;
  provider_id?: string | null;
  error?: string | null;
  opens?: number | null;
  clicks?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface NotificationsRow {
  id: string;
  kind: 'auth_failure' | 'duplicate_publish_abort' | 'queue_depth' | 'worker_missing' | 'render_failure' | 'digest' | 'connector_down' | 'correction_stopped' | 'generation_refused';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  dedupe_key: string | null;
}

export interface NotificationsInsert {
  id?: string;
  kind: 'auth_failure' | 'duplicate_publish_abort' | 'queue_depth' | 'worker_missing' | 'render_failure' | 'digest' | 'connector_down' | 'correction_stopped' | 'generation_refused';
  severity?: 'info' | 'warning' | 'critical';
  title: string;
  body?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  sent_at?: string | null;
  read_at?: string | null;
  created_at?: string;
  dedupe_key?: string | null;
}

export interface NotificationsUpdate {
  id?: string;
  kind?: 'auth_failure' | 'duplicate_publish_abort' | 'queue_depth' | 'worker_missing' | 'render_failure' | 'digest' | 'connector_down' | 'correction_stopped' | 'generation_refused';
  severity?: 'info' | 'warning' | 'critical';
  title?: string;
  body?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  sent_at?: string | null;
  read_at?: string | null;
  created_at?: string;
  dedupe_key?: string | null;
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

export interface PendingConnectionsRow {
  id: string;
  product_id: string;
  platform: string;
  persona: 'founder' | 'brand';
  platform_user_id: string | null;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  follower_count: number | null;
  scopes: string[];
  access_token_enc: string;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  token_meta: Json;
  alternatives: Json;
  warnings: Json;
  reconnect_account_id: string | null;
  created_at: string;
  expires_at: string;
}

export interface PendingConnectionsInsert {
  id?: string;
  product_id: string;
  platform: string;
  persona: 'founder' | 'brand';
  platform_user_id?: string | null;
  handle?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  follower_count?: number | null;
  scopes?: string[];
  access_token_enc: string;
  refresh_token_enc?: string | null;
  token_expires_at?: string | null;
  token_meta?: Json;
  alternatives?: Json;
  warnings?: Json;
  reconnect_account_id?: string | null;
  created_at?: string;
  expires_at?: string;
}

export interface PendingConnectionsUpdate {
  id?: string;
  product_id?: string;
  platform?: string;
  persona?: 'founder' | 'brand';
  platform_user_id?: string | null;
  handle?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  follower_count?: number | null;
  scopes?: string[];
  access_token_enc?: string;
  refresh_token_enc?: string | null;
  token_expires_at?: string | null;
  token_meta?: Json;
  alternatives?: Json;
  warnings?: Json;
  reconnect_account_id?: string | null;
  created_at?: string;
  expires_at?: string;
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

export interface PinterestBoardsRow {
  id: string;
  account_id: string;
  board_id: string;
  name: string;
  match_tags: string[] | null;
  is_default: boolean;
  synced_at: string;
}

export interface PinterestBoardsInsert {
  id?: string;
  account_id: string;
  board_id: string;
  name: string;
  match_tags?: string[] | null;
  is_default?: boolean;
  synced_at?: string;
}

export interface PinterestBoardsUpdate {
  id?: string;
  account_id?: string;
  board_id?: string;
  name?: string;
  match_tags?: string[] | null;
  is_default?: boolean;
  synced_at?: string;
}

export interface PlatformRequestsRow {
  id: string;
  account_id: string | null;
  platform: string;
  method: string;
  url: string;
  request_body: Json | null;
  status: number | null;
  response_body: Json | null;
  duration_ms: number | null;
  dry_run: boolean;
  error: string | null;
  created_at: string;
  purge_after: string;
}

export interface PlatformRequestsInsert {
  id?: string;
  account_id?: string | null;
  platform: string;
  method: string;
  url: string;
  request_body?: Json | null;
  status?: number | null;
  response_body?: Json | null;
  duration_ms?: number | null;
  dry_run?: boolean;
  error?: string | null;
  created_at?: string;
  purge_after?: string;
}

export interface PlatformRequestsUpdate {
  id?: string;
  account_id?: string | null;
  platform?: string;
  method?: string;
  url?: string;
  request_body?: Json | null;
  status?: number | null;
  response_body?: Json | null;
  duration_ms?: number | null;
  dry_run?: boolean;
  error?: string | null;
  created_at?: string;
  purge_after?: string;
}

export interface PlatformVariantsRow {
  id: string;
  concept_id: string | null;
  brief_id: string | null;
  content_item_id: string | null;
  platform: string;
  aspect_ratio: string | null;
  target_seconds: number | null;
  pacing: string | null;
  text_density: string | null;
  hook_treatment: string | null;
  cta: string | null;
  audio_treatment: string | null;
  render_id: string | null;
  decision: 'original' | 'remix' | 'reuse' | 'skip' | 'produce' | 'defer';
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformVariantsInsert {
  id?: string;
  concept_id?: string | null;
  brief_id?: string | null;
  content_item_id?: string | null;
  platform: string;
  aspect_ratio?: string | null;
  target_seconds?: number | null;
  pacing?: string | null;
  text_density?: string | null;
  hook_treatment?: string | null;
  cta?: string | null;
  audio_treatment?: string | null;
  render_id?: string | null;
  decision?: 'original' | 'remix' | 'reuse' | 'skip' | 'produce' | 'defer';
  decision_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PlatformVariantsUpdate {
  id?: string;
  concept_id?: string | null;
  brief_id?: string | null;
  content_item_id?: string | null;
  platform?: string;
  aspect_ratio?: string | null;
  target_seconds?: number | null;
  pacing?: string | null;
  text_density?: string | null;
  hook_treatment?: string | null;
  cta?: string | null;
  audio_treatment?: string | null;
  render_id?: string | null;
  decision?: 'original' | 'remix' | 'reuse' | 'skip' | 'produce' | 'defer';
  decision_reason?: string | null;
  created_at?: string;
  updated_at?: string;
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

export interface ProductArtifactsRow {
  id: string;
  product_id: string;
  kind: string;
  request_key: string;
  request: Json;
  raw: Json;
  headline: string | null;
  highlights: Json;
  visual_hints: string[];
  duration_ms: number | null;
  fetched_at: string;
  expires_at: string | null;
  hit_count: number;
}

export interface ProductArtifactsInsert {
  id?: string;
  product_id: string;
  kind?: string;
  request_key: string;
  request?: Json;
  raw: Json;
  headline?: string | null;
  highlights?: Json;
  visual_hints?: string[];
  duration_ms?: number | null;
  fetched_at?: string;
  expires_at?: string | null;
  hit_count?: number;
}

export interface ProductArtifactsUpdate {
  id?: string;
  product_id?: string;
  kind?: string;
  request_key?: string;
  request?: Json;
  raw?: Json;
  headline?: string | null;
  highlights?: Json;
  visual_hints?: string[];
  duration_ms?: number | null;
  fetched_at?: string;
  expires_at?: string | null;
  hit_count?: number;
}

export interface ProductEvidenceRow {
  id: string;
  product_id: string;
  kind: 'web_page' | 'app_store_listing' | 'connector_surface' | 'connector_artifact' | 'screenshot' | 'repository' | 'operator_brief';
  source_url: string | null;
  content_hash: string;
  title: string | null;
  body: string;
  meta: Json;
  collected_at: string;
  collector: string;
  superseded_by: string | null;
}

export interface ProductEvidenceInsert {
  id?: string;
  product_id: string;
  kind: 'web_page' | 'app_store_listing' | 'connector_surface' | 'connector_artifact' | 'screenshot' | 'repository' | 'operator_brief';
  source_url?: string | null;
  content_hash: string;
  title?: string | null;
  body?: string;
  meta?: Json;
  collected_at?: string;
  collector: string;
  superseded_by?: string | null;
}

export interface ProductEvidenceUpdate {
  id?: string;
  product_id?: string;
  kind?: 'web_page' | 'app_store_listing' | 'connector_surface' | 'connector_artifact' | 'screenshot' | 'repository' | 'operator_brief';
  source_url?: string | null;
  content_hash?: string;
  title?: string | null;
  body?: string;
  meta?: Json;
  collected_at?: string;
  collector?: string;
  superseded_by?: string | null;
}

export interface ProductFactsRow {
  id: string;
  product_id: string;
  category: 'identity' | 'mission' | 'users' | 'personas' | 'jobs_to_be_done' | 'workflows' | 'differentiators' | 'pricing' | 'monetization' | 'competitors' | 'brand_voice' | 'visual_identity' | 'claims' | 'ux_model' | 'conversion_funnel' | 'app_store_positioning' | 'content_pillars';
  key: string;
  value: string;
  detail: string | null;
  status: 'unverified' | 'verified' | 'refuted' | 'unverifiable' | 'inferred';
  confidence: number;
  evidence_ids: string[];
  contradicts: string | null;
  reconciliation: string | null;
  agent_id: string;
  agent_version: string;
  prompt_version: string | null;
  first_seen_at: string;
  last_verified_at: string | null;
  updated_at: string;
  superseded_by: string | null;
}

export interface ProductFactsInsert {
  id?: string;
  product_id: string;
  category: 'identity' | 'mission' | 'users' | 'personas' | 'jobs_to_be_done' | 'workflows' | 'differentiators' | 'pricing' | 'monetization' | 'competitors' | 'brand_voice' | 'visual_identity' | 'claims' | 'ux_model' | 'conversion_funnel' | 'app_store_positioning' | 'content_pillars';
  key: string;
  value: string;
  detail?: string | null;
  status?: 'unverified' | 'verified' | 'refuted' | 'unverifiable' | 'inferred';
  confidence?: number;
  evidence_ids?: string[];
  contradicts?: string | null;
  reconciliation?: string | null;
  agent_id: string;
  agent_version: string;
  prompt_version?: string | null;
  first_seen_at?: string;
  last_verified_at?: string | null;
  updated_at?: string;
  superseded_by?: string | null;
}

export interface ProductFactsUpdate {
  id?: string;
  product_id?: string;
  category?: 'identity' | 'mission' | 'users' | 'personas' | 'jobs_to_be_done' | 'workflows' | 'differentiators' | 'pricing' | 'monetization' | 'competitors' | 'brand_voice' | 'visual_identity' | 'claims' | 'ux_model' | 'conversion_funnel' | 'app_store_positioning' | 'content_pillars';
  key?: string;
  value?: string;
  detail?: string | null;
  status?: 'unverified' | 'verified' | 'refuted' | 'unverifiable' | 'inferred';
  confidence?: number;
  evidence_ids?: string[];
  contradicts?: string | null;
  reconciliation?: string | null;
  agent_id?: string;
  agent_version?: string;
  prompt_version?: string | null;
  first_seen_at?: string;
  last_verified_at?: string | null;
  updated_at?: string;
  superseded_by?: string | null;
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
  connector_type: 'mcp' | 'rest' | 'github' | 'none';
  connector_config: Json;
  brand_tokens: Json;
  content_rules: Json;
  audience_timezone: string;
  operator_timezone: string;
  created_at: string;
  updated_at: string;
  kind: 'product' | 'personal';
  repo_config: Json;
  brief_staleness_threshold: number;
  expected_handles: Json;
  destinations: Json;
  observed_app_version: string | null;
  observed_app_version_at: string | null;
  capture_credentials: Json | null;
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
  connector_type?: 'mcp' | 'rest' | 'github' | 'none';
  connector_config?: Json;
  brand_tokens?: Json;
  content_rules?: Json;
  audience_timezone?: string;
  operator_timezone?: string;
  created_at?: string;
  updated_at?: string;
  kind?: 'product' | 'personal';
  repo_config?: Json;
  brief_staleness_threshold?: number;
  expected_handles?: Json;
  destinations?: Json;
  observed_app_version?: string | null;
  observed_app_version_at?: string | null;
  capture_credentials?: Json | null;
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
  connector_type?: 'mcp' | 'rest' | 'github' | 'none';
  connector_config?: Json;
  brand_tokens?: Json;
  content_rules?: Json;
  audience_timezone?: string;
  operator_timezone?: string;
  created_at?: string;
  updated_at?: string;
  kind?: 'product' | 'personal';
  repo_config?: Json;
  brief_staleness_threshold?: number;
  expected_handles?: Json;
  destinations?: Json;
  observed_app_version?: string | null;
  observed_app_version_at?: string | null;
  capture_credentials?: Json | null;
}

export interface ProviderCapabilitiesRow {
  provider: string;
  capabilities: Json;
  verified_at: string;
  probe_id: string | null;
  method: 'live_api' | 'dry_run' | 'manual' | null;
}

export interface ProviderCapabilitiesInsert {
  provider: string;
  capabilities: Json;
  verified_at?: string;
  probe_id?: string | null;
  method?: 'live_api' | 'dry_run' | 'manual' | null;
}

export interface ProviderCapabilitiesUpdate {
  provider?: string;
  capabilities?: Json;
  verified_at?: string;
  probe_id?: string | null;
  method?: 'live_api' | 'dry_run' | 'manual' | null;
}

export interface PublicationsRow {
  id: string;
  content_item_id: string;
  account_id: string;
  platform: string;
  platform_post_id: string | null;
  permalink: string | null;
  publish_mode: 'direct' | 'draft' | 'private';
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
  publish_mode: 'direct' | 'draft' | 'private';
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
  publish_mode?: 'direct' | 'draft' | 'private';
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
  format: string | null;
  category: string | null;
  hook_text: string | null;
  hook_type: string | null;
  author_handle: string | null;
  added_at: string;
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
  format?: string | null;
  category?: string | null;
  hook_text?: string | null;
  hook_type?: string | null;
  author_handle?: string | null;
  added_at?: string;
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
  format?: string | null;
  category?: string | null;
  hook_text?: string | null;
  hook_type?: string | null;
  author_handle?: string | null;
  added_at?: string;
}

export interface RejectionClustersRow {
  id: string;
  product_id: string;
  category: string | null;
  pattern: string;
  example_ids: string[];
  occurrences: number;
  suggested_rule: string | null;
  status: 'surfaced' | 'accepted' | 'dismissed';
  created_at: string;
  updated_at: string;
  dismissed_until: string | null;
  accepted_rule: string | null;
  accepted_at: string | null;
}

export interface RejectionClustersInsert {
  id?: string;
  product_id: string;
  category?: string | null;
  pattern: string;
  example_ids?: string[];
  occurrences?: number;
  suggested_rule?: string | null;
  status?: 'surfaced' | 'accepted' | 'dismissed';
  created_at?: string;
  updated_at?: string;
  dismissed_until?: string | null;
  accepted_rule?: string | null;
  accepted_at?: string | null;
}

export interface RejectionClustersUpdate {
  id?: string;
  product_id?: string;
  category?: string | null;
  pattern?: string;
  example_ids?: string[];
  occurrences?: number;
  suggested_rule?: string | null;
  status?: 'surfaced' | 'accepted' | 'dismissed';
  created_at?: string;
  updated_at?: string;
  dismissed_until?: string | null;
  accepted_rule?: string | null;
  accepted_at?: string | null;
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
  treatment: string | null;
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
  treatment?: string | null;
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
  treatment?: string | null;
}

export interface ReviewSubmissionsRow {
  id: string;
  product_id: string;
  platform: string;
  review_name: string;
  status: 'not_started' | 'preparing' | 'submitted' | 'changes_requested' | 'approved' | 'rejected' | 'abandoned';
  submitted_at: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  requirements: Json;
  demo_asset_id: string | null;
  external_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewSubmissionsInsert {
  id?: string;
  product_id: string;
  platform: string;
  review_name: string;
  status?: 'not_started' | 'preparing' | 'submitted' | 'changes_requested' | 'approved' | 'rejected' | 'abandoned';
  submitted_at?: string | null;
  decided_at?: string | null;
  decision_notes?: string | null;
  requirements?: Json;
  demo_asset_id?: string | null;
  external_url?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ReviewSubmissionsUpdate {
  id?: string;
  product_id?: string;
  platform?: string;
  review_name?: string;
  status?: 'not_started' | 'preparing' | 'submitted' | 'changes_requested' | 'approved' | 'rejected' | 'abandoned';
  submitted_at?: string | null;
  decided_at?: string | null;
  decision_notes?: string | null;
  requirements?: Json;
  demo_asset_id?: string | null;
  external_url?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RssItemsRow {
  id: string;
  source_id: string;
  product_id: string;
  guid: string;
  url: string;
  title: string;
  summary: string | null;
  author: string | null;
  published_at: string | null;
  fetched_at: string;
  cluster_key: string | null;
  feed_count: number;
  expires_at: string;
  relevance: number | null;
  contested: string | null;
  rank_reason: string | null;
  status: 'new' | 'surfaced' | 'used' | 'skipped' | 'expired';
}

export interface RssItemsInsert {
  id?: string;
  source_id: string;
  product_id: string;
  guid: string;
  url: string;
  title: string;
  summary?: string | null;
  author?: string | null;
  published_at?: string | null;
  fetched_at?: string;
  cluster_key?: string | null;
  feed_count?: number;
  expires_at?: string;
  relevance?: number | null;
  contested?: string | null;
  rank_reason?: string | null;
  status?: 'new' | 'surfaced' | 'used' | 'skipped' | 'expired';
}

export interface RssItemsUpdate {
  id?: string;
  source_id?: string;
  product_id?: string;
  guid?: string;
  url?: string;
  title?: string;
  summary?: string | null;
  author?: string | null;
  published_at?: string | null;
  fetched_at?: string;
  cluster_key?: string | null;
  feed_count?: number;
  expires_at?: string;
  relevance?: number | null;
  contested?: string | null;
  rank_reason?: string | null;
  status?: 'new' | 'surfaced' | 'used' | 'skipped' | 'expired';
}

export interface RssSourcesRow {
  id: string;
  product_id: string;
  name: string;
  feed_url: string;
  why: string | null;
  weight: number;
  enabled: boolean;
  last_polled_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface RssSourcesInsert {
  id?: string;
  product_id: string;
  name: string;
  feed_url: string;
  why?: string | null;
  weight?: number;
  enabled?: boolean;
  last_polled_at?: string | null;
  last_error?: string | null;
  created_at?: string;
}

export interface RssSourcesUpdate {
  id?: string;
  product_id?: string;
  name?: string;
  feed_url?: string;
  why?: string | null;
  weight?: number;
  enabled?: boolean;
  last_polled_at?: string | null;
  last_error?: string | null;
  created_at?: string;
}

export interface SchemaVersionRow {
  id: boolean;
  version: string;
  applied_at: string;
}

export interface SchemaVersionInsert {
  id?: boolean;
  version: string;
  applied_at?: string;
}

export interface SchemaVersionUpdate {
  id?: boolean;
  version?: string;
  applied_at?: string;
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
  log_retention_days: number | null;
  daily_budget_usd: number;
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
  log_retention_days?: number | null;
  daily_budget_usd?: number;
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
  log_retention_days?: number | null;
  daily_budget_usd?: number;
}

export interface SetupKitEntriesRow {
  id: string;
  product_id: string;
  platform: string;
  persona: 'brand' | 'founder';
  bios: Json;
  display_names: Json;
  pinned_post: string | null;
  chosen_bio: number | null;
  chosen_name: number | null;
  notes: Json;
  prompt_version: string;
  generated_at: string;
}

export interface SetupKitEntriesInsert {
  id?: string;
  product_id: string;
  platform: string;
  persona: 'brand' | 'founder';
  bios?: Json;
  display_names?: Json;
  pinned_post?: string | null;
  chosen_bio?: number | null;
  chosen_name?: number | null;
  notes?: Json;
  prompt_version: string;
  generated_at?: string;
}

export interface SetupKitEntriesUpdate {
  id?: string;
  product_id?: string;
  platform?: string;
  persona?: 'brand' | 'founder';
  bios?: Json;
  display_names?: Json;
  pinned_post?: string | null;
  chosen_bio?: number | null;
  chosen_name?: number | null;
  notes?: Json;
  prompt_version?: string;
  generated_at?: string;
}

export interface ShippedFeaturesRow {
  id: string;
  product_id: string;
  title: string;
  description: string;
  source_refs: Json;
  shipped_at: string;
  user_facing: boolean;
  status: 'new' | 'used' | 'ignored';
  content_item_id: string | null;
  created_at: string;
}

export interface ShippedFeaturesInsert {
  id?: string;
  product_id: string;
  title: string;
  description: string;
  source_refs?: Json;
  shipped_at: string;
  user_facing?: boolean;
  status?: 'new' | 'used' | 'ignored';
  content_item_id?: string | null;
  created_at?: string;
}

export interface ShippedFeaturesUpdate {
  id?: string;
  product_id?: string;
  title?: string;
  description?: string;
  source_refs?: Json;
  shipped_at?: string;
  user_facing?: boolean;
  status?: 'new' | 'used' | 'ignored';
  content_item_id?: string | null;
  created_at?: string;
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
  platform: string | null;
  observed_at: string | null;
  expires_at: string | null;
  confidence: number | null;
  velocity: number | null;
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
  platform?: string | null;
  observed_at?: string | null;
  expires_at?: string | null;
  confidence?: number | null;
  velocity?: number | null;
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
  platform?: string | null;
  observed_at?: string | null;
  expires_at?: string | null;
  confidence?: number | null;
  velocity?: number | null;
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
  platform: 'x' | 'instagram' | 'tiktok' | 'pinterest' | 'youtube' | 'threads' | 'bluesky';
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
  display_name: string | null;
  avatar_url: string | null;
  follower_count: number | null;
  identity_confirmed_at: string | null;
  identity_warning: string | null;
  last_self_test_at: string | null;
  last_self_test_ok: boolean | null;
  last_self_test_detail: string | null;
  last_published_at: string | null;
  duplicate_identity_ack: boolean;
  routing_scope: string | null;
  required_product_kind: string | null;
  transport: 'direct' | 'unified';
  provider_account_id: string | null;
  refresh_locked_at: string | null;
  refresh_failures: number;
  refresh_next_attempt_at: string | null;
}

export interface SocialAccountsInsert {
  id?: string;
  product_id: string;
  platform: 'x' | 'instagram' | 'tiktok' | 'pinterest' | 'youtube' | 'threads' | 'bluesky';
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
  display_name?: string | null;
  avatar_url?: string | null;
  follower_count?: number | null;
  identity_confirmed_at?: string | null;
  identity_warning?: string | null;
  last_self_test_at?: string | null;
  last_self_test_ok?: boolean | null;
  last_self_test_detail?: string | null;
  last_published_at?: string | null;
  duplicate_identity_ack?: boolean;
  transport?: 'direct' | 'unified';
  provider_account_id?: string | null;
  refresh_locked_at?: string | null;
  refresh_failures?: number;
  refresh_next_attempt_at?: string | null;
}

export interface SocialAccountsUpdate {
  id?: string;
  product_id?: string;
  platform?: 'x' | 'instagram' | 'tiktok' | 'pinterest' | 'youtube' | 'threads' | 'bluesky';
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
  display_name?: string | null;
  avatar_url?: string | null;
  follower_count?: number | null;
  identity_confirmed_at?: string | null;
  identity_warning?: string | null;
  last_self_test_at?: string | null;
  last_self_test_ok?: boolean | null;
  last_self_test_detail?: string | null;
  last_published_at?: string | null;
  duplicate_identity_ack?: boolean;
  transport?: 'direct' | 'unified';
  provider_account_id?: string | null;
  refresh_locked_at?: string | null;
  refresh_failures?: number;
  refresh_next_attempt_at?: string | null;
}

export interface SocialProofRow {
  id: string;
  product_id: string;
  source: 'app_store' | 'play_store' | 'user_feedback' | 'beta_feedback' | 'comment' | 'email';
  source_id: string;
  source_url: string | null;
  author_display: string | null;
  rating: number | null;
  title: string | null;
  body: string;
  posted_at: string | null;
  consent_state: 'not_asked' | 'granted' | 'declined' | 'public_by_default';
  status: 'new' | 'used' | 'declined';
  content_item_id: string | null;
  fetched_at: string;
}

export interface SocialProofInsert {
  id?: string;
  product_id: string;
  source: 'app_store' | 'play_store' | 'user_feedback' | 'beta_feedback' | 'comment' | 'email';
  source_id: string;
  source_url?: string | null;
  author_display?: string | null;
  rating?: number | null;
  title?: string | null;
  body: string;
  posted_at?: string | null;
  consent_state?: 'not_asked' | 'granted' | 'declined' | 'public_by_default';
  status?: 'new' | 'used' | 'declined';
  content_item_id?: string | null;
  fetched_at?: string;
}

export interface SocialProofUpdate {
  id?: string;
  product_id?: string;
  source?: 'app_store' | 'play_store' | 'user_feedback' | 'beta_feedback' | 'comment' | 'email';
  source_id?: string;
  source_url?: string | null;
  author_display?: string | null;
  rating?: number | null;
  title?: string | null;
  body?: string;
  posted_at?: string | null;
  consent_state?: 'not_asked' | 'granted' | 'declined' | 'public_by_default';
  status?: 'new' | 'used' | 'declined';
  content_item_id?: string | null;
  fetched_at?: string;
}

export interface SocialRecommendationsRow {
  id: string;
  account_id: string;
  product_id: string | null;
  platform: string;
  subject: string;
  subject_type: 'creator' | 'brand' | 'community' | 'publication' | 'topic' | 'conversation' | 'question';
  kind: 'study' | 'follow' | 'investigate' | 'collaborate' | 'reference' | 'respond' | 'monitor' | 'ignore';
  relevance: number;
  confidence: number;
  rationale: string;
  evidence: Json;
  observed_at: string;
  expires_at: string | null;
  status: 'proposed' | 'accepted' | 'dismissed' | 'done';
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialRecommendationsInsert {
  id?: string;
  account_id: string;
  product_id?: string | null;
  platform: string;
  subject: string;
  subject_type: 'creator' | 'brand' | 'community' | 'publication' | 'topic' | 'conversation' | 'question';
  kind: 'study' | 'follow' | 'investigate' | 'collaborate' | 'reference' | 'respond' | 'monitor' | 'ignore';
  relevance: number;
  confidence: number;
  rationale: string;
  evidence: Json;
  observed_at?: string;
  expires_at?: string | null;
  status?: 'proposed' | 'accepted' | 'dismissed' | 'done';
  decided_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SocialRecommendationsUpdate {
  id?: string;
  account_id?: string;
  product_id?: string | null;
  platform?: string;
  subject?: string;
  subject_type?: 'creator' | 'brand' | 'community' | 'publication' | 'topic' | 'conversation' | 'question';
  kind?: 'study' | 'follow' | 'investigate' | 'collaborate' | 'reference' | 'respond' | 'monitor' | 'ignore';
  relevance?: number;
  confidence?: number;
  rationale?: string;
  evidence?: Json;
  observed_at?: string;
  expires_at?: string | null;
  status?: 'proposed' | 'accepted' | 'dismissed' | 'done';
  decided_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SoundEffectsRow {
  id: string;
  product_id: string | null;
  asset_id: string;
  title: string;
  role: 'transition' | 'impact' | 'accent' | 'ui' | 'ambience' | 'texture';
  duration_seconds: number;
  peak_db: number;
  licence: string;
  licensor: string | null;
  licence_url: string | null;
  attribution_required: boolean;
  attribution_text: string | null;
  platform_restrictions: string[];
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  provenance: unknown;
  source: string | null;
  licence_proof: string | null;
  prohibited_platforms: string[];
  active: boolean;
  usage_count: number;
}

export interface SoundEffectsInsert {
  id?: string;
  product_id?: string | null;
  asset_id: string;
  title: string;
  role: 'transition' | 'impact' | 'accent' | 'ui' | 'ambience' | 'texture';
  duration_seconds: number;
  peak_db?: number;
  licence: string;
  licensor?: string | null;
  licence_url?: string | null;
  attribution_required?: boolean;
  attribution_text?: string | null;
  platform_restrictions?: string[];
  expires_at?: string | null;
  last_used_at?: string | null;
  created_at?: string;
  provenance?: unknown;
  source?: string | null;
  licence_proof?: string | null;
  prohibited_platforms?: string[];
  active?: boolean;
  usage_count?: number;
}

export interface SoundEffectsUpdate {
  id?: string;
  product_id?: string | null;
  asset_id?: string;
  title?: string;
  role?: 'transition' | 'impact' | 'accent' | 'ui' | 'ambience' | 'texture';
  duration_seconds?: number;
  peak_db?: number;
  licence?: string;
  licensor?: string | null;
  licence_url?: string | null;
  attribution_required?: boolean;
  attribution_text?: string | null;
  platform_restrictions?: string[];
  expires_at?: string | null;
  last_used_at?: string | null;
  created_at?: string;
  provenance?: unknown;
  source?: string | null;
  licence_proof?: string | null;
  prohibited_platforms?: string[];
  active?: boolean;
  usage_count?: number;
}

export interface StrategyDecisionsRow {
  id: string;
  product_id: string | null;
  account_id: string;
  platform: string;
  signal_id: string | null;
  idea_id: string | null;
  content_item_id: string | null;
  objective: 'awareness' | 'engagement' | 'education' | 'traffic' | 'conversion' | 'retention' | 'follower_growth' | 'product_promotion';
  creation_mode: 'create' | 'reuse' | 'remix' | 'adapt';
  why_now: string;
  audience: string;
  rationale: string;
  preferred_treatments: string[];
  avoid_treatments: string[];
  publish_earliest: string;
  publish_latest: string;
  timing_reason: string;
  primary_metric: string;
  success_threshold: number | null;
  measurement_basis: string;
  review_after: string;
  confidence: number;
  evidence: string[];
  created_at: string;
}

export interface StrategyDecisionsInsert {
  id?: string;
  product_id?: string | null;
  account_id: string;
  platform: string;
  signal_id?: string | null;
  idea_id?: string | null;
  content_item_id?: string | null;
  objective: 'awareness' | 'engagement' | 'education' | 'traffic' | 'conversion' | 'retention' | 'follower_growth' | 'product_promotion';
  creation_mode?: 'create' | 'reuse' | 'remix' | 'adapt';
  why_now: string;
  audience: string;
  rationale: string;
  preferred_treatments?: string[];
  avoid_treatments?: string[];
  publish_earliest: string;
  publish_latest: string;
  timing_reason: string;
  primary_metric: string;
  success_threshold?: number | null;
  measurement_basis: string;
  review_after: string;
  confidence: number;
  evidence?: string[];
  created_at?: string;
}

export interface StrategyDecisionsUpdate {
  id?: string;
  product_id?: string | null;
  account_id?: string;
  platform?: string;
  signal_id?: string | null;
  idea_id?: string | null;
  content_item_id?: string | null;
  objective?: 'awareness' | 'engagement' | 'education' | 'traffic' | 'conversion' | 'retention' | 'follower_growth' | 'product_promotion';
  creation_mode?: 'create' | 'reuse' | 'remix' | 'adapt';
  why_now?: string;
  audience?: string;
  rationale?: string;
  preferred_treatments?: string[];
  avoid_treatments?: string[];
  publish_earliest?: string;
  publish_latest?: string;
  timing_reason?: string;
  primary_metric?: string;
  success_threshold?: number | null;
  measurement_basis?: string;
  review_after?: string;
  confidence?: number;
  evidence?: string[];
  created_at?: string;
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

export interface SubscribersRow {
  id: string;
  product_id: string;
  email: string;
  source: string;
  lead_magnet: string | null;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
  unsubscribe_token: string;
}

export interface SubscribersInsert {
  id?: string;
  product_id: string;
  email: string;
  source?: string;
  lead_magnet?: string | null;
  confirmed_at?: string | null;
  unsubscribed_at?: string | null;
  created_at?: string;
  unsubscribe_token?: string;
}

export interface SubscribersUpdate {
  id?: string;
  product_id?: string;
  email?: string;
  source?: string;
  lead_magnet?: string | null;
  confirmed_at?: string | null;
  unsubscribed_at?: string | null;
  created_at?: string;
  unsubscribe_token?: string;
}

export interface TakesRow {
  id: string;
  product_id: string;
  rss_item_id: string | null;
  raw_input: string;
  input_method: 'typed' | 'spoken';
  audience: string | null;
  fact_check: Json;
  fact_check_ok: boolean | null;
  story_verified: boolean | null;
  supporting: Json;
  strongest_counter: string | null;
  risk_flags: Json;
  draft: string | null;
  likely_pushback: Json;
  status: 'awaiting_input' | 'checking' | 'needs_revision' | 'drafted' | 'approved' | 'discarded';
  content_item_id: string | null;
  created_at: string;
  updated_at: string;
  opinion_overlap: number | null;
  opinion_note: string | null;
}

export interface TakesInsert {
  id?: string;
  product_id: string;
  rss_item_id?: string | null;
  raw_input: string;
  input_method?: 'typed' | 'spoken';
  audience?: string | null;
  fact_check?: Json;
  fact_check_ok?: boolean | null;
  story_verified?: boolean | null;
  supporting?: Json;
  strongest_counter?: string | null;
  risk_flags?: Json;
  draft?: string | null;
  likely_pushback?: Json;
  status?: 'awaiting_input' | 'checking' | 'needs_revision' | 'drafted' | 'approved' | 'discarded';
  content_item_id?: string | null;
  created_at?: string;
  updated_at?: string;
  opinion_overlap?: number | null;
  opinion_note?: string | null;
}

export interface TakesUpdate {
  id?: string;
  product_id?: string;
  rss_item_id?: string | null;
  raw_input?: string;
  input_method?: 'typed' | 'spoken';
  audience?: string | null;
  fact_check?: Json;
  fact_check_ok?: boolean | null;
  story_verified?: boolean | null;
  supporting?: Json;
  strongest_counter?: string | null;
  risk_flags?: Json;
  draft?: string | null;
  likely_pushback?: Json;
  status?: 'awaiting_input' | 'checking' | 'needs_revision' | 'drafted' | 'approved' | 'discarded';
  content_item_id?: string | null;
  created_at?: string;
  updated_at?: string;
  opinion_overlap?: number | null;
  opinion_note?: string | null;
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
  loop_ready: boolean;
  opens_on_content: boolean;
  min_pattern_interrupt_seconds: number;
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
  loop_ready?: boolean;
  opens_on_content?: boolean;
  min_pattern_interrupt_seconds?: number;
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
  loop_ready?: boolean;
  opens_on_content?: boolean;
  min_pattern_interrupt_seconds?: number;
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

export interface WatchHitsRow {
  id: string;
  watch_term_id: string;
  product_id: string;
  source: string;
  url: string;
  title: string;
  excerpt: string | null;
  author: string | null;
  engagement: number | null;
  posted_at: string | null;
  question: boolean;
  signal_id: string | null;
  seen_at: string;
  promoted_at: string | null;
}

export interface WatchHitsInsert {
  id?: string;
  watch_term_id: string;
  product_id: string;
  source: string;
  url: string;
  title: string;
  excerpt?: string | null;
  author?: string | null;
  engagement?: number | null;
  posted_at?: string | null;
  question?: boolean;
  signal_id?: string | null;
  seen_at?: string;
  promoted_at?: string | null;
}

export interface WatchHitsUpdate {
  id?: string;
  watch_term_id?: string;
  product_id?: string;
  source?: string;
  url?: string;
  title?: string;
  excerpt?: string | null;
  author?: string | null;
  engagement?: number | null;
  posted_at?: string | null;
  question?: boolean;
  signal_id?: string | null;
  seen_at?: string;
  promoted_at?: string | null;
}

export interface WatchTermsRow {
  id: string;
  product_id: string;
  term: string;
  sources: string[];
  enabled: boolean;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
  min_occurrences: number;
  last_hit_count: number;
}

export interface WatchTermsInsert {
  id?: string;
  product_id: string;
  term: string;
  sources?: string[];
  enabled?: boolean;
  last_run_at?: string | null;
  last_error?: string | null;
  created_at?: string;
  min_occurrences?: number;
  last_hit_count?: number;
}

export interface WatchTermsUpdate {
  id?: string;
  product_id?: string;
  term?: string;
  sources?: string[];
  enabled?: boolean;
  last_run_at?: string | null;
  last_error?: string | null;
  created_at?: string;
  min_occurrences?: number;
  last_hit_count?: number;
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
    account_intelligence: { Row: AccountIntelligenceRow; Insert: AccountIntelligenceInsert; Update: AccountIntelligenceUpdate; Relationships: [] };
    admin_users: { Row: AdminUsersRow; Insert: AdminUsersInsert; Update: AdminUsersUpdate; Relationships: [] };
    agent_runs: { Row: AgentRunsRow; Insert: AgentRunsInsert; Update: AgentRunsUpdate; Relationships: [] };
    app_store_attribution: { Row: AppStoreAttributionRow; Insert: AppStoreAttributionInsert; Update: AppStoreAttributionUpdate; Relationships: [] };
    assets: { Row: AssetsRow; Insert: AssetsInsert; Update: AssetsUpdate; Relationships: [] };
    attribution: { Row: AttributionRow; Insert: AttributionInsert; Update: AttributionUpdate; Relationships: [] };
    audit_log: { Row: AuditLogRow; Insert: AuditLogInsert; Update: AuditLogUpdate; Relationships: [] };
    auditor_findings: { Row: AuditorFindingsRow; Insert: AuditorFindingsInsert; Update: AuditorFindingsUpdate; Relationships: [] };
    auditor_runs: { Row: AuditorRunsRow; Insert: AuditorRunsInsert; Update: AuditorRunsUpdate; Relationships: [] };
    brand_voices: { Row: BrandVoicesRow; Insert: BrandVoicesInsert; Update: BrandVoicesUpdate; Relationships: [] };
    calibration_reviews: { Row: CalibrationReviewsRow; Insert: CalibrationReviewsInsert; Update: CalibrationReviewsUpdate; Relationships: [] };
    campaigns: { Row: CampaignsRow; Insert: CampaignsInsert; Update: CampaignsUpdate; Relationships: [] };
    capability_audit_state: { Row: CapabilityAuditStateRow; Insert: CapabilityAuditStateInsert; Update: CapabilityAuditStateUpdate; Relationships: [] };
    capability_probes: { Row: CapabilityProbesRow; Insert: CapabilityProbesInsert; Update: CapabilityProbesUpdate; Relationships: [] };
    capture_audit: { Row: CaptureAuditRow; Insert: CaptureAuditInsert; Update: CaptureAuditUpdate; Relationships: [] };
    capture_runs: { Row: CaptureRunsRow; Insert: CaptureRunsInsert; Update: CaptureRunsUpdate; Relationships: [] };
    comment_replies: { Row: CommentRepliesRow; Insert: CommentRepliesInsert; Update: CommentRepliesUpdate; Relationships: [] };
    comments: { Row: CommentsRow; Insert: CommentsInsert; Update: CommentsUpdate; Relationships: [] };
    compose_sessions: { Row: ComposeSessionsRow; Insert: ComposeSessionsInsert; Update: ComposeSessionsUpdate; Relationships: [] };
    concepts: { Row: ConceptsRow; Insert: ConceptsInsert; Update: ConceptsUpdate; Relationships: [] };
    connector_calls: { Row: ConnectorCallsRow; Insert: ConnectorCallsInsert; Update: ConnectorCallsUpdate; Relationships: [] };
    content_items: { Row: ContentItemsRow; Insert: ContentItemsInsert; Update: ContentItemsUpdate; Relationships: [] };
    content_iterations: { Row: ContentIterationsRow; Insert: ContentIterationsInsert; Update: ContentIterationsUpdate; Relationships: [] };
    creative_briefs: { Row: CreativeBriefsRow; Insert: CreativeBriefsInsert; Update: CreativeBriefsUpdate; Relationships: [] };
    desired_handles: { Row: DesiredHandlesRow; Insert: DesiredHandlesInsert; Update: DesiredHandlesUpdate; Relationships: [] };
    feature_claims: { Row: FeatureClaimsRow; Insert: FeatureClaimsInsert; Update: FeatureClaimsUpdate; Relationships: [] };
    finds: { Row: FindsRow; Insert: FindsInsert; Update: FindsUpdate; Relationships: [] };
    format_cadence: { Row: FormatCadenceRow; Insert: FormatCadenceInsert; Update: FormatCadenceUpdate; Relationships: [] };
    hook_experiments: { Row: HookExperimentsRow; Insert: HookExperimentsInsert; Update: HookExperimentsUpdate; Relationships: [] };
    hook_variants: { Row: HookVariantsRow; Insert: HookVariantsInsert; Update: HookVariantsUpdate; Relationships: [] };
    hooks: { Row: HooksRow; Insert: HooksInsert; Update: HooksUpdate; Relationships: [] };
    ideas: { Row: IdeasRow; Insert: IdeasInsert; Update: IdeasUpdate; Relationships: [] };
    job_events: { Row: JobEventsRow; Insert: JobEventsInsert; Update: JobEventsUpdate; Relationships: [] };
    jobs: { Row: JobsRow; Insert: JobsInsert; Update: JobsUpdate; Relationships: [] };
    learned_insights: { Row: LearnedInsightsRow; Insert: LearnedInsightsInsert; Update: LearnedInsightsUpdate; Relationships: [] };
    link_clicks: { Row: LinkClicksRow; Insert: LinkClicksInsert; Update: LinkClicksUpdate; Relationships: [] };
    music_beds: { Row: MusicBedsRow; Insert: MusicBedsInsert; Update: MusicBedsUpdate; Relationships: [] };
    music_usage: { Row: MusicUsageRow; Insert: MusicUsageInsert; Update: MusicUsageUpdate; Relationships: [] };
    newsletters: { Row: NewslettersRow; Insert: NewslettersInsert; Update: NewslettersUpdate; Relationships: [] };
    notifications: { Row: NotificationsRow; Insert: NotificationsInsert; Update: NotificationsUpdate; Relationships: [] };
    onboarding_state: { Row: OnboardingStateRow; Insert: OnboardingStateInsert; Update: OnboardingStateUpdate; Relationships: [] };
    pending_connections: { Row: PendingConnectionsRow; Insert: PendingConnectionsInsert; Update: PendingConnectionsUpdate; Relationships: [] };
    performance_scores: { Row: PerformanceScoresRow; Insert: PerformanceScoresInsert; Update: PerformanceScoresUpdate; Relationships: [] };
    pinterest_boards: { Row: PinterestBoardsRow; Insert: PinterestBoardsInsert; Update: PinterestBoardsUpdate; Relationships: [] };
    platform_requests: { Row: PlatformRequestsRow; Insert: PlatformRequestsInsert; Update: PlatformRequestsUpdate; Relationships: [] };
    platform_variants: { Row: PlatformVariantsRow; Insert: PlatformVariantsInsert; Update: PlatformVariantsUpdate; Relationships: [] };
    post_metrics: { Row: PostMetricsRow; Insert: PostMetricsInsert; Update: PostMetricsUpdate; Relationships: [] };
    product_artifacts: { Row: ProductArtifactsRow; Insert: ProductArtifactsInsert; Update: ProductArtifactsUpdate; Relationships: [] };
    product_evidence: { Row: ProductEvidenceRow; Insert: ProductEvidenceInsert; Update: ProductEvidenceUpdate; Relationships: [] };
    product_facts: { Row: ProductFactsRow; Insert: ProductFactsInsert; Update: ProductFactsUpdate; Relationships: [] };
    products: { Row: ProductsRow; Insert: ProductsInsert; Update: ProductsUpdate; Relationships: [] };
    provider_capabilities: { Row: ProviderCapabilitiesRow; Insert: ProviderCapabilitiesInsert; Update: ProviderCapabilitiesUpdate; Relationships: [] };
    publications: { Row: PublicationsRow; Insert: PublicationsInsert; Update: PublicationsUpdate; Relationships: [] };
    references_swipe: { Row: ReferencesSwipeRow; Insert: ReferencesSwipeInsert; Update: ReferencesSwipeUpdate; Relationships: [] };
    rejection_clusters: { Row: RejectionClustersRow; Insert: RejectionClustersInsert; Update: RejectionClustersUpdate; Relationships: [] };
    renders: { Row: RendersRow; Insert: RendersInsert; Update: RendersUpdate; Relationships: [] };
    review_submissions: { Row: ReviewSubmissionsRow; Insert: ReviewSubmissionsInsert; Update: ReviewSubmissionsUpdate; Relationships: [] };
    rss_items: { Row: RssItemsRow; Insert: RssItemsInsert; Update: RssItemsUpdate; Relationships: [] };
    rss_sources: { Row: RssSourcesRow; Insert: RssSourcesInsert; Update: RssSourcesUpdate; Relationships: [] };
    schema_version: { Row: SchemaVersionRow; Insert: SchemaVersionInsert; Update: SchemaVersionUpdate; Relationships: [] };
    series: { Row: SeriesRow; Insert: SeriesInsert; Update: SeriesUpdate; Relationships: [] };
    settings: { Row: SettingsRow; Insert: SettingsInsert; Update: SettingsUpdate; Relationships: [] };
    setup_kit_entries: { Row: SetupKitEntriesRow; Insert: SetupKitEntriesInsert; Update: SetupKitEntriesUpdate; Relationships: [] };
    shipped_features: { Row: ShippedFeaturesRow; Insert: ShippedFeaturesInsert; Update: ShippedFeaturesUpdate; Relationships: [] };
    signals: { Row: SignalsRow; Insert: SignalsInsert; Update: SignalsUpdate; Relationships: [] };
    slots: { Row: SlotsRow; Insert: SlotsInsert; Update: SlotsUpdate; Relationships: [] };
    social_accounts: { Row: SocialAccountsRow; Insert: SocialAccountsInsert; Update: SocialAccountsUpdate; Relationships: [] };
    social_proof: { Row: SocialProofRow; Insert: SocialProofInsert; Update: SocialProofUpdate; Relationships: [] };
    social_recommendations: { Row: SocialRecommendationsRow; Insert: SocialRecommendationsInsert; Update: SocialRecommendationsUpdate; Relationships: [] };
    sound_effects: { Row: SoundEffectsRow; Insert: SoundEffectsInsert; Update: SoundEffectsUpdate; Relationships: [] };
    strategy_decisions: { Row: StrategyDecisionsRow; Insert: StrategyDecisionsInsert; Update: StrategyDecisionsUpdate; Relationships: [] };
    submissions: { Row: SubmissionsRow; Insert: SubmissionsInsert; Update: SubmissionsUpdate; Relationships: [] };
    subscribers: { Row: SubscribersRow; Insert: SubscribersInsert; Update: SubscribersUpdate; Relationships: [] };
    takes: { Row: TakesRow; Insert: TakesInsert; Update: TakesUpdate; Relationships: [] };
    templates: { Row: TemplatesRow; Insert: TemplatesInsert; Update: TemplatesUpdate; Relationships: [] };
    voice_lexicon: { Row: VoiceLexiconRow; Insert: VoiceLexiconInsert; Update: VoiceLexiconUpdate; Relationships: [] };
    watch_hits: { Row: WatchHitsRow; Insert: WatchHitsInsert; Update: WatchHitsUpdate; Relationships: [] };
    watch_terms: { Row: WatchTermsRow; Insert: WatchTermsInsert; Update: WatchTermsUpdate; Relationships: [] };
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

