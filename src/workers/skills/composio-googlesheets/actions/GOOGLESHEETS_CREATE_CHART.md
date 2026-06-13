# GOOGLESHEETS_CREATE_CHART

**Description**: Create a chart in a Google Sheets spreadsheet using the specified data range and chart type. Conditional requirements: - Provide either a simple chart via chart_type + data_range (basicChart), OR supply a full chart_spec supporting all chart types. Exactly one approach should be used. - When using chart_spec, set exactly one of the union fields (basicChart | pieChart | bubbleChart | candlestickChart | histogramChart | waterfallChart | treemapChart | orgChart | scorecardChart).

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
