dataset = koi_koi_raw
| filter source_log_type = "Audit"
| comp count_distinct(hostname) as distinct_koi_hosts, count() as audit_rows
