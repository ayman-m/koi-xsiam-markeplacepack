/* THEME G - Q2 : Re-request after rejection - persistence against a denial.
   Purpose        : detection
   Datasets       : koi_koi_raw (Audit, type = approval_requests)
   Status         : validated 2026-07-23 - 1 row on tenant paet
   What it answers: which items were REJECTED by a reviewer and then requested again.

   Why it matters: a rejection is a security decision. An item that keeps coming back
   is either a genuine unmet business need (route it to a proper exception process) or
   someone probing for a reviewer who will say yes. Both deserve attention; neither is
   visible from the block log, which never reaches XSIAM.

   Live result 2026-07-23 (90 d): Snake/chrome - 4 rejections, 4 submissions.

   LIMITATION - NAME-BASED. approval_requests rows carry `object_name` and `marketplace`
   but NOT the marketplace item ID (`object_id` is the REQUEST's own UUID, not the
   extension's). Correlation is therefore on (object_name, marketplace) and two different
   items sharing a display name would merge. Verified on this tenant: all approval rows
   are chrome, and the three names (Snake, Product Hunt, SAML-tracer) are distinct.

   This query does NOT prove the re-request came AFTER the rejection - it proves both
   happened for the same item. Use G5 for a time-ordered bypass test. */
dataset = koi_koi_raw
| filter type = "approval_requests"
| alter decision = if(message contains "was rejected by", "rejected",
                      message contains "was approved by", "approved",
                      message contains "submitted by",    "submitted", to_string(null))
| comp sum(if(decision = "rejected",  1, 0)) as rejections,
       sum(if(decision = "submitted", 1, 0)) as submissions
  by object_name, marketplace
| filter rejections > 0 and submissions > 1
| sort desc rejections
