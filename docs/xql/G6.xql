/* THEME G - Q6 : Gateway coverage gap - installs outside PAC scope.
   Purpose        : coverage / posture reporting (NOT an alert)
   Datasets       : koi_koi_raw (Audit, type = extensions, action = installed)
   Status         : validated 2026-07-23 - 12 rows on tenant paet
   What it answers: how much of what actually gets installed never traverses the Supply
                    Chain Gateway at all?

   THIS IS THE MOST IMPORTANT NUMBER IN THEME G, and it is a scoping fact, not an
   incident. The gateway is a proxy: it can only govern hosts the PAC routes to it. The
   live PAC (assets.koi.security/pac/16671441-....pac) routes browser stores, IDE
   marketplaces, Hugging Face and the GitHub MCP registry. It does NOT route PyPI, npm,
   Homebrew, Chocolatey, Docker, OS software channels, or anything sideloaded.

   ⚠️ "OUTSIDE PAC SCOPE" IS NOT "UNGOVERNABLE" - never quote this number as a Koi coverage
   limit. For npm and PyPI, Koi supports policy-based prevention AT INSTALL TIME "as long as
   the Koi Proxy is configured", and it does NOT require the endpoint script. The gap is a PAC
   DELIVERY limit, not a capability limit: a PAC file is a browser/OS-proxy mechanism and the
   CLI tools do not read it. Koi's own docs say to deploy registry config when "You use a PAC
   file integration and CLI tools (pip, npm) do not inherit proxy settings" - so adding the
   registry hosts to the PAC would NOT help. Three documented routes govern npm/PyPI, none of
   them needing the script:
     1. SWG layer    - route the registry hosts to Koi at the gateway/SASE tier. Koi's docs:
                       "This handles routing and trust automatically without per-tool
                       configuration." This is the route a Prisma Access / Zscaler / Netskope
                       customer already has in place.
     2. Repo manager - configure Koi as an UPSTREAM registry on Artifactory / Nexus.
     3. Endpoint     - per-tool .npmrc / pip.conf pushed by MDM.
   Live proof on this tenant 2026-07-23, via route 3: Blocked - NPM - registry.npmjs.org
   /lodash-es. Note the code-package path needs NO Koi Root CA - Koi serves a globally trusted
   certificate there because it acts as a registry endpoint, not a TLS interceptor. The CA
   requirement applies to the MARKETPLACE path only.

   So read this as "how much of the estate the PAC alone does not reach", and pair it with the
   routing decision above rather than presenting it as unprotected surface.

   Live result 2026-07-23 (90 d), 12 rows - installs / distinct items:
     pypi 1788/539 · npm 437/246 · software_windows 351/127 · software_mac 171/97
     built_in 146/14 · homebrew 96/54 · chocolatey 72/24 · docker 15/7 · ollama 4/4
     claude_desktop_extensions 3/2 · npp 3/3 · side_loaded 2/2
   Total outside PAC scope: ~3,088 installs.
   For contrast, the PAC-covered marketplaces over the same window total ~230 installs
   (chrome 87, vsc 61, github 26, cursor 22, edge 16, firefox 13, jet 5).

   So on this tenant roughly NINE IN TEN installs with a known marketplace are outside
   gateway scope. Use this to set expectations before anyone concludes "the gateway will
   stop supply-chain installs" - it stops the ones routed through it, which here is the
   browser/IDE extension surface, not the code-package surface.

   The PAC list below is the SHORT event vocabulary (what koi_koi_raw stores), not the
   long API vocabulary - `vsc` not `vscode`, `jet` not `jetbrains`. Keep it in sync with
   the PAC file if Koi adds marketplaces. */
dataset = koi_koi_raw
| filter type = "extensions" and action = "installed" and marketplace != null
| filter marketplace not in ("chrome", "edge", "firefox", "vsc", "cursor", "jet",
                             "openvsx", "hugging_face", "github")
| comp count() as installs, count_distinct(object_name) as items by marketplace
| sort desc installs
