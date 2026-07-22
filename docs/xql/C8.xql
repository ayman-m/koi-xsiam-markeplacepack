dataset = koi_koi_raw
| comp count() as n, min(_time) as first, max(_time) as last by hostname, source_log_type
| sort desc n
| limit 30
