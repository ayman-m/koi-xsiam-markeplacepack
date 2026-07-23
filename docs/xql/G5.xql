/* THEME G - Q5 : Rejected, then installed anyway - bypass after denial.
   Purpose        : detection (high severity if it ever fires)
   Datasets       : koi_koi_raw (Audit: approval_requests + extensions/installed)
   Status         : validated 2026-07-23 - 0 rows on tenant paet (CLEAN - see below)
   What it answers: did an item a reviewer REJECTED subsequently appear as INSTALLED,
                    with the install LATER IN TIME than the rejection?

   This is the control that proves the block held. Zero rows is the PASSING result, and
   it is worth stating plainly: on tenant paet, 2026-07-23, over 90 days, no rejected
   item was later installed. Ship the query anyway - it is cheap, and the day it returns
   a row you have someone who was told no and got the software onto an endpoint regardless
   (sideloaded, from a second machine, via a package manager the PAC does not cover, or
   because the policy was relaxed after the fact).

   NO JOIN BY DESIGN. A join across two event shapes in one dataset is expensive and
   times out the validation window. Instead this makes a SINGLE pass, tags each row as
   "rejected" or "installed", and reduces by item - so the whole test is one comp.
   min(rejection) vs max(install) then gives the time ordering for free.

   TWO LIMITATIONS, both real - do not present this as airtight:
   1. NAME-BASED. approval_requests rows carry object_name + marketplace but NOT the
      marketplace item ID (object_id is the request's own UUID). Two different items with
      the same display name would merge.
   2. LAST-INSTALL ORDERING. max(install) > min(rejection) means "an install exists after
      the first rejection". An item installed BEFORE the rejection and reinstalled after
      would also match - which is arguably still worth seeing. */
dataset = koi_koi_raw
| filter (type = "approval_requests" and message contains "was rejected by")
      or (type = "extensions" and action = "installed")
| alter kind = if(type = "approval_requests", "rejected", "installed")
| comp sum(if(kind = "rejected",  1, 0)) as rejections,
       sum(if(kind = "installed", 1, 0)) as installs,
       min(if(kind = "rejected",  _time, null)) as first_rejection,
       max(if(kind = "installed", _time, null)) as last_install
  by object_name, marketplace
| filter rejections > 0 and installs > 0 and last_install > first_rejection
| sort desc installs
