/* THEME G - Q3 : Installs with NO marketplace provenance - gateway-invisible.
   Purpose        : detection / coverage
   Datasets       : koi_koi_raw (Audit, type = extensions, action = installed)
   Status         : validated 2026-07-23 - 3 rows on tenant paet
   What it answers: which installed items did NOT arrive through any marketplace, and are
                    therefore items the Supply Chain Gateway could never have inspected.

   THE GATEWAY ONLY SEES TRAFFIC THE PAC ROUTES TO IT. The PAC matches marketplace and
   CDN hostnames (chromewebstore/clients2.google.com, marketplace.visualstudio.com and
   the vsassets CDNs, addons.mozilla.org, huggingface.co, api.mcp.github.com, ...). An
   item that never crossed one of those hosts cannot have been allowed or blocked - it
   is simply invisible to the gateway. Those installs show up here.

   The three buckets, live 2026-07-23 (90 d):
     marketplace = null    286 installs /  69 distinct items - provenance not recorded
     built_in              146 installs /  14 distinct items - shipped with the platform
     side_loaded             2 installs /   2 distinct items - LOADED FROM DISK, the
                                            classic gateway bypass (see also G4, where
                                            system_sideloading_protection fires on one)

   Read `built_in` as expected-and-benign, `side_loaded` as the one to chase, and `null`
   as a data-quality question for Koi rather than an attack signal on its own.

   NOT a marketplace: side_loaded and built_in are INSTALLATION METHODS leaking into the
   marketplace column. The pack's parsing rule maps both to NULL for marketplace_api,
   because neither is a value any Koi API command will accept. */
dataset = koi_koi_raw
| filter type = "extensions" and action = "installed"
| filter marketplace = null or marketplace in ("side_loaded", "built_in")
| comp count() as installs, count_distinct(object_name) as items by marketplace
| sort desc installs
