# VERCEL_UPDATE_FIREWALL_CONFIG

**Description**: Tool to incrementally update Vercel Firewall configuration for a project using PATCH. Use when you need to: enable/disable the firewall ('firewallEnabled'), add/remove IP blocking rules ('ip.insert'/'ip.remove'), manage custom rules ('rules.insert'/'rules.update'/'rules.remove'), or configure OWASP CRS rules ('crs.update'/'crs.disable'). Each call modifies a single aspect of the configuration. For full replacement of firewall config, use VERCEL_PUT_FIREWALL_CONFIG instead.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
