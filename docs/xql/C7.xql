dataset = xdr_data
| comp count() as n, min(_time) as first, max(_time) as last by agent_hostname
| sort desc n
| limit 30
