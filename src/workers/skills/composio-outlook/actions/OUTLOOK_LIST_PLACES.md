# OUTLOOK_LIST_PLACES

**Description**: Retrieves a collection of place objects defined in a tenant by type. Places can include rooms, workspaces, buildings, floors, sections, desks, and room lists. When room_list_id is provided, returns only rooms or workspaces within that specific room list using the /places/{roomListId}/microsoft.graph.roomlist/rooms (or /workspaces) endpoint. Use this action when you need to discover available physical spaces or locations within an organization. Note: Before using this API, ensure that the Places settings are properly configured in the tenant.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
