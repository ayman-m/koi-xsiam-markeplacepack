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
   Homebrew, Chocolatey, Docker, OS software channels, or anything sideloaded - those are
   governed, if at all, by Koi's separate REGISTRY approach (pip/npm config), not the PAC.

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
