/* THEME G - Q1 : Approval pressure - one blocked item, many requesters.
   Purpose        : detection
   Datasets       : koi_koi_raw (Audit, type = approval_requests)
   Status         : validated 2026-07-23 - 2 rows on tenant paet
   What it answers: which BLOCKED item is generating repeated exception requests,
                    and from how many distinct people.

   WHY THIS IS THE GATEWAY DETECTION. The Supply Chain Gateway's own Allowed/Blocked
   verdict log is CONSOLE-ONLY and never reaches XSIAM (verified 2026-07-23: koi_koi_raw
   has no gateway/block/network type, and `_raw_log contains "Blocked"` returns 0 rows).
   You therefore cannot alert on a block. What you CAN see is the user's reaction to it:
   the block page offers a "Request access" button, and pressing it emits an
   `approval_requests` audit row. Repeated requests = repeated blocks.

   INLINE EXTRACTION IS DELIBERATE. The pack's parsing rule promotes koi_approval_*
   columns, but parsing rules apply AT INGEST ONLY, so those columns are null on every
   historical row. This query re-derives them inline so it works over all history.

   Live result 2026-07-23 (90 d): Snake/chrome 8 requests from 5 distinct requesters
   (first 2026-06-22, last 2026-07-23); Product Hunt/chrome 2 requests, 1 requester.

   Tuning: raise the threshold on distinct_requesters for a stricter signal - one person
   retrying is noise, five people converging on the same blocked item is a business need
   (or a social-engineering target) and deserves a human decision. */
dataset = koi_koi_raw
| filter type = "approval_requests"
// `action` is NULL on every approval_requests row - the lifecycle state lives only in
// the free-text `message`. Same expressions as the parsing rule, kept in sync.
| alter decision  = if(message contains "was rejected by", "rejected",
                       message contains "was approved by", "approved",
                       message contains "submitted by",    "submitted", to_string(null)),
        requester = coalesce(
            arrayindex(regextract(message, "submitted by\s+(\S+)"), 0),
            // NOT anchored on "]" - the [risk: ..] segment is absent on some rows.
            arrayindex(regextract(message, "by\s+(\S+)\s+was\s+(?:rejected|approved)"), 0))
| comp count() as requests,
       count_distinct(requester) as distinct_requesters,
       min(_time) as first_seen,
       max(_time) as last_seen
  by object_name, marketplace
| filter requests > 1 or distinct_requesters > 1
| sort desc requests
