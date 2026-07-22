// Theme C / C6 - Cortex-managed host population from telemetry.
// The denominator for any coverage-gap calculation: which hosts are actually producing
// Cortex XDR telemetry, and over what span. Diff this against C3/A7 (hosts running KOI
// scans) to get the supply-chain blind spot.
// RECONSTRUCTED - the originating agent's exact text was not persisted. NOT re-validated.
// PARAM: timeframe defines what "recent" means
dataset = xdr_data
| comp count() as n, min(_time) as first_seen, max(_time) as last_seen by agent_hostname
| sort desc n
| limit 100
