-- ===========================================================================
-- 031 — the two states between "accepted" and "completed"
--
-- A donor who has been accepted hears nothing more until the whole thing is
-- over. The brief asks for the steps in between to be visible and, crucially,
-- to be set by the organisation rather than claimed by the donor:
--
--   hair   sent → being checked → accepted → collection → received → completed
--   milk   sent → screening → eligible → donation at centre → received → done
--   blood  available → screening → eligible → donation → confirmed → completed
--
-- One machine, three vocabularies; the words live in
-- src/lib/validation/health.ts. Only the two missing states are added here —
-- a value cannot be added and used in the same transaction, so everything that
-- uses them is in 032.
-- ===========================================================================

alter type public.offer_status add value if not exists 'collecting' after 'accepted';
alter type public.offer_status add value if not exists 'received' after 'collecting';

comment on type public.offer_status is
  'submitted | in_review | accepted | collecting | received | completed | declined | withdrawn. The organisation moves it; the donor can only withdraw.';
