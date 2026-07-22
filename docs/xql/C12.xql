dataset = endpoints
| comp count() as endpoint_rows, count_distinct(endpoint_name) as distinct_hosts
