# VERCEL_CHECK_DOMAIN_AVAILABILITY

**Description**: Tool to check if a domain is available for registration. Read-only: does not reserve or purchase the domain. Use when you need to verify domain availability before purchase. Response field `available=false` means the domain is taken (not an error); actual failures return HTTP 4xx. IMPORTANT: Vercel only supports specific TLDs. Common supported TLDs include: .com, .net, .org, .io, .co, .dev, .app, .ai, .xyz, .me. Some TLDs are NOT supported (e.g., .cam, .berlin, .wales). For the full list, see: https://vercel.com/docs/domains/supported-domains

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
