# MAILCHIMP_ADD_OR_UPDATE_PRODUCT_VARIANT

**Description**: Add a new product variant or update an existing one in a Mailchimp e-commerce store. This endpoint uses PUT for an upsert operation - if the variant exists, it will be updated; if not, a new variant will be created. The variant_id in the URL path and the id in the request body should match. Product variants require inventory_quantity > 0 for product recommendations to work properly.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
