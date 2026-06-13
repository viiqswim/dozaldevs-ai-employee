---
name: composio-render
description: 'Use when working with Render via the Composio integration — reading, writing, or managing Render content. Requires Render to be connected in the platform settings. Full action parameter schemas are in the bundled actions/ files.'
---

# Composio — Render

Full parameter schemas for each action are in `actions/<SLUG>.md`.

## Available Actions

| Action | Description |
|--------|-------------|
| RENDER_ADD_HEADERS | Tool to add a custom HTTP header rule to a Render service. Use when you need to configure headers like Cache-Control, security headers, or CORS headers for specific request paths. |
| RENDER_ADD_OR_UPDATE_SECRET_FILE | Tool to add or update a secret file for a Render service. Use when you need to create a new secret file or update the content of an existing secret file. |
| RENDER_ADD_RESOURCES_TO_ENVIRONMENT | Tool to add resources to a Render environment. Use when you need to associate services, databases, Redis instances, or environment groups with an existing environment. |
| RENDER_ADD_ROUTE | Tool to add redirect or rewrite rules to a Render service. Use when you need to configure URL routing, redirects, or rewrites for a service. Redirect rules send HTTP redirects to clients, while rewrite rules modify the request path internally. |
| RENDER_CREATE_CUSTOM_DOMAIN | Tool to add a custom domain to a Render service. Use when you need to configure a custom domain for a service. |
| RENDER_CREATE_ENV_GROUP | Tool to create a new environment group. Use when you need to create a shared collection of environment variables and secret files that can be used across multiple services. |
| RENDER_CREATE_ENVIRONMENT | Tool to create a new environment within a Render project. Use when you need to set up a new environment for organizing services, databases, and other resources. |
| RENDER_CREATE_POSTGRES | Tool to create a new Postgres instance on Render. Use when you need to provision a new PostgreSQL database with configurable plan, version, and region. |
| RENDER_CREATE_REGISTRY_CREDENTIAL | Tool to create a registry credential. Use when you need to add a new container registry credential to your Render account for authenticating with Docker Hub, GitHub, GitLab, Google Artifact Registry, or AWS ECR. |
| RENDER_DELETE_ENV_GROUP_ENV_VAR | Tool to remove an environment variable from an environment group. Use when you need to delete a specific environment variable by its key from a given environment group. |
| RENDER_DELETE_ENV_GROUP_SECRET_FILE | Tool to remove a secret file from an environment group. Use when you need to delete a specific secret file by its name from a given environment group. |
| RENDER_DELETE_ENVIRONMENT | Tool to delete a specified environment. Use when you need to remove an environment from Render. Returns success confirmation. |
| RENDER_DELETE_KEY_VALUE | Tool to delete a Key Value instance. Use when you need to remove a specific Key Value store from your Render account. |
| RENDER_DELETE_OWNER_LOG_STREAM | Tool to delete a log stream for an owner. Use when you need to remove log stream configuration for a specific workspace. |
| RENDER_DELETE_OWNER_METRICS_STREAM | Tool to delete a metrics stream for a workspace. Use when removing metrics integration for a specific owner. |
| RENDER_DELETE_REGISTRY_CREDENTIAL | Tool to delete a registry credential. Use when you need to remove a Docker registry credential from your Render account. |
| RENDER_DELETE_SECRET_FILE | Tool to delete a secret file from a Render service. Use when you need to remove a secret file that is no longer needed. |
| RENDER_DELETE_SERVICE | Tool to delete a service. Use when you need to permanently remove a service from your Render account. |
| RENDER_DISCONNECT_BLUEPRINT | Tool to disconnect a blueprint from your Render account. Use when you need to remove a blueprint connection. |
| RENDER_GET_ACTIVE_CONNECTIONS | Tool to get active connection count metrics for Render resources. Use when you need to retrieve time-series data of active connections for Postgres or Redis instances over a specified time range. |
| RENDER_GET_BANDWIDTH_SOURCES | Tool to get bandwidth usage breakdown by traffic source. Use when you need to retrieve bandwidth usage statistics segmented by different traffic sources for a Render service. |
| RENDER_GET_CPU | Tool to retrieve CPU usage metrics for Render resources. Use when you need to monitor CPU utilization for services, Postgres databases, or Redis instances. At least one filter (resource, service, or instance) must be provided. |
| RENDER_GET_CPU_LIMIT | Tool to retrieve CPU limit metrics for Render resources. Use when you need to get the CPU limit time series data for services, Postgres databases, or Redis instances. Returns metrics over a specified time range with configurable resolution. |
| RENDER_GET_DISK_CAPACITY | Tool to get disk capacity metrics for Render resources. Use when you need to retrieve disk capacity time series data for services, Postgres databases, or Redis instances. At least one filter parameter (resource or service) must be specified. |
| RENDER_GET_DISK_USAGE | Tool to retrieve disk usage metrics for Render resources. Use when you need to monitor persistent disk utilization for services, Postgres databases, or Redis instances. It is recommended to specify at least one resource filter. |
| RENDER_GET_INSTANCE_COUNT | Tool to get instance count metrics for Render resources. Use when you need to retrieve instance count time series data for services, Postgres databases, or Redis instances. The resource parameter is required. |
| RENDER_GET_MEMORY | Tool to get memory usage metrics for one or more resources. Use when you need to retrieve memory usage data for services, Postgres databases, or Redis instances over a specified time range. |
| RENDER_GET_MEMORY_LIMIT | Tool to get memory limit metrics for Render resources over a specified time range. Use when you need to retrieve memory limit data for services, Postgres databases, or Redis instances. At least one filter (resource, service, or instance) must be provided. |
| RENDER_GET_MEMORY_TARGET | Tool to get memory target metrics for Render resources. Use when you need to retrieve memory target data for services, Postgres databases, or Redis instances over a specified time range. At least one resource identifier (resource, service, or instance) is required. |
| RENDER_GET_USER | Tool to get the authenticated user. Use when you need to retrieve information about the currently authenticated account owner. |
| RENDER_LINK_SERVICE_TO_ENV_GROUP | Tool to link a service to an environment group. Use when you need to associate a service with an environment group so that the service can access the environment variables and secret files defined in that group. |
| RENDER_LIST_APPLICATION_FILTER_VALUES | Tool to list queryable instance values for application metrics. Use when you need to discover available filter values for metrics queries. |
| RENDER_LIST_BLUEPRINTS | Tool to list all blueprints. Use when you need to retrieve the definitions of all blueprints in your account. |
| RENDER_LIST_DEPLOYS | Tool to list recent deploys for a Render service with pagination and filtering. Use when you need to fetch deploy history, inspect deploy statuses, or find a specific deployId to pass to other deploy operations. |
| RENDER_LIST_DISKS | Tool to list all disks. Use when you need to retrieve all disks associated with your account. |
| RENDER_LIST_ENV_GROUPS | Tool to list environment groups. Use when you need to retrieve environment groups to view shared environment variables across services. |
| RENDER_LIST_ENVIRONMENTS | Tool to list environments for a project. Use when you need to retrieve environments within a specific project. Requires at least one project ID. |
| RENDER_LIST_ENV_VARS_FOR_SERVICE | Tool to list all environment variables configured directly on a Render service (with pagination). Use when you need to enumerate env vars without knowing individual keys. |
| RENDER_LIST_INSTANCES | Tool to list instances of a service. Use when you need to retrieve all instances for a specific Render service. |
| RENDER_LIST_KEY_VALUE | Tool to list all Key Value instances. Use when you need to retrieve Key Value instances associated with your account, optionally filtering by name, region, owner, environment, or timestamps. |
| RENDER_LIST_LOGS | Tool to list logs for a specific workspace and resource. Use when you need to retrieve logs for services, databases, or other resources, with support for filtering by time range, log type, severity level, and text content. Wildcards and regex patterns are supported for most text filters. |
| RENDER_LIST_LOGS_VALUES | Tool to list log label values for a workspace. Use when you need to discover possible values for a specific log label (instance, host, statusCode, method, level, or type) within a time range. |
| RENDER_LIST_MAINTENANCE | Tool to list maintenance runs. Use when you need to retrieve scheduled or past maintenance activities for services and database instances. |
| RENDER_LIST_NOTIFICATION_OVERRIDES | Tool to list notification overrides for services. Use when you need to retrieve notification settings that override default notification behavior for specific services. |
| RENDER_LIST_OWNER_MEMBERS | Tool to list workspace members. Use when you need to retrieve all members of a specific workspace or team. |
| RENDER_LIST_OWNERS | Tool to list owners (users and teams). Use after authenticating to fetch available owner IDs for resource creation. |
| RENDER_LIST_POSTGRES | Tool to list Postgres instances. Use when you need to retrieve all Postgres databases associated with your account, optionally filtering by name, region, or other criteria. |
| RENDER_LIST_POSTGRES_EXPORT | Tool to list all exports for a Postgres instance. Use when you need to retrieve the history of exports for a specific Postgres database. |
| RENDER_LIST_POSTGRES_USERS | Tool to list PostgreSQL user credentials for a Render PostgreSQL database instance. Use when you need to view all users with access to a specific PostgreSQL database. |
| RENDER_LIST_PROJECTS | List Projects |
| RENDER_LIST_REGISTRY_CREDENTIALS | Tool to list registry credentials. Use when you need to retrieve container registry credentials associated with your account, optionally filtering by name, username, or registry type. |
| RENDER_LIST_RESOURCE_LOG_STREAMS | Tool to list resource log stream overrides. Use when you need to retrieve log stream configurations for resources in your account. |
| RENDER_LIST_ROUTES | Tool to list redirect/rewrite rules for a service. Use when you need to retrieve routing configuration for a Render service. |
| RENDER_LIST_SECRET_FILES | Tool to list secret files for a Render service. Use when you need to retrieve all secret files associated with a specific service. |
| RENDER_LIST_SERVICES | Tool to list all services. Use when you need to retrieve services accessible by your account, optionally filtering by name or type. Use after authentication. |
| RENDER_LIST_TASK_RUNS | Tool to list task runs. Use when you need to retrieve task execution history for workflows, optionally filtering by task ID, workflow, owner, or root task run. |
| RENDER_LIST_TASKS | Tool to list tasks. Use when you need to retrieve tasks from workflows, optionally filtering by owner, task ID, workflow ID, or workflow version ID. |
| RENDER_LIST_WEBHOOKS | Tool to list all webhooks. Use when you need to retrieve configured webhooks for your account. |
| RENDER_LIST_WORKFLOWS | Tool to list workflows. Use when you need to retrieve workflows accessible by your account, optionally filtering by name, owner, environment, or workflow ID. |
| RENDER_LIST_WORKFLOW_VERSIONS | Tool to list workflow versions. Use when you need to retrieve workflow versions, optionally filtering by owner, workflow, or version ID. |
| RENDER_RESTART_SERVICE | Tool to restart a service. Use when you need to restart a running service, such as after configuration changes or to resolve issues. |
| RENDER_RESUME_SERVICE | Tool to resume a suspended service. Use when you need to restart a service that was previously suspended. |
| RENDER_RETRIEVE_CUSTOM_DOMAIN | Tool to retrieve a specific custom domain for a service. Use when you need to get details about a custom domain associated with a Render service. |
| RENDER_RETRIEVE_DEPLOY | Retrieve deploy |
| RENDER_RETRIEVE_ENV_GROUP | Tool to retrieve a specific environment group by ID. Use when you need to fetch detailed information about a specific environment group including its environment variables, secret files, and linked services. |
| RENDER_RETRIEVE_ENV_GROUP_ENV_VAR | Tool to retrieve a specific environment variable from a Render environment group. Use when you need to fetch the value of a particular environment variable by its key. |
| RENDER_RETRIEVE_ENV_GROUP_SECRET_FILE | Tool to retrieve secret file from an environment group. Use when you need to get the content of a specific secret file within an environment group. |
| RENDER_RETRIEVE_ENV_VAR | Tool to retrieve a specific environment variable from a Render service. Use when you need to fetch the value of a particular environment variable by its key. |
| RENDER_RETRIEVE_OWNER | Tool to retrieve a specific owner (workspace) by ID. Use when you need details about a user or team workspace. |
| RENDER_RETRIEVE_OWNER_NOTIFICATION_SETTINGS | Tool to retrieve notification settings for a specific owner (workspace). Use when you need to check current notification configuration for Slack, email, and preview notifications. |
| RENDER_RETRIEVE_POSTGRES | Tool to retrieve a specific Postgres instance. Use when you need to get details about a Postgres database in your Render account. |
| RENDER_RETRIEVE_PROJECT | Tool to retrieve a specific project by ID. Use when you need to fetch detailed information about a Render project including its name, owner, and associated environments. |
| RENDER_RETRIEVE_REGISTRY_CREDENTIAL | Tool to retrieve a registry credential by ID. Use when you need to get details about a Docker registry credential in your Render account. |
| RENDER_RETRIEVE_SECRET_FILE | Tool to retrieve a secret file from a Render service. Use when you need to get the content of a specific secret file within a service. |
| RENDER_RETRIEVE_SERVICE | Tool to retrieve a specific service by ID. Use when you need detailed information about a service including its configuration, status, and deployment settings. |
| RENDER_STREAM_TASK_RUNS_EVENTS | Tool to stream real-time task run events via Server-Sent Events (SSE). Use when you need to monitor task execution status and receive live updates as tasks progress. Requires maintaining an open HTTP connection to receive the event stream. |
| RENDER_SUBSCRIBE_LOGS | Tool to subscribe to real-time logs via WebSocket connection. Use when you need to stream logs as they are generated for services, databases, or other resources. Note: This endpoint requires HTTP/1.1 WebSocket upgrade (HTTP 101 Switching Protocols). For retrieving historical logs without streaming, use the List Logs action instead. |
| RENDER_SUSPEND_SERVICE | Tool to suspend a service. Use when you need to temporarily stop a service without deleting it. |
| RENDER_TRIGGER_DEPLOY | Tool to trigger a new deploy for a specified service. Requires the service to already exist on Render and be linked to a Git repo — initial setup and repo linking must be done in the Render UI. Use when you need to manually start a new build and deployment process, such as after updating service configuration or pushing code changes that Render does not auto-apply. |
| RENDER_UPDATE_ENV_GROUP | Tool to update an environment group's name. Use when you need to rename an existing environment group. |
| RENDER_UPDATE_ENV_GROUP_ENV_VAR | Tool to add or update an environment variable in an environment group. Use when you need to set a new value for an environment variable or create a new one if it doesn't exist. You can either provide a specific value or request a randomly generated value. |
| RENDER_UPDATE_ENV_GROUP_SECRET_FILE | Tool to add or update a secret file in an environment group. Use when you need to create a new secret file or modify the content of an existing secret file within an environment group. |
| RENDER_UPDATE_ENV_VAR | Tool to add or update an environment variable for a Render service. Use when you need to set a new environment variable or modify an existing one's value. You can either provide a specific value or have Render auto-generate a secure random value. |
| RENDER_UPDATE_ENV_VARS_FOR_SERVICE | Tool to update environment variables for a Render service. Use when you need to add, modify, or set environment variables for a service. This replaces all environment variables with the provided list. |
| RENDER_UPDATE_HEADERS | Tool to replace all header rules for a Render service. Use when you need to completely replace the existing set of custom HTTP headers with a new set. This operation removes all existing header rules and replaces them with the provided ones. |
| RENDER_UPDATE_OWNER_LOG_STREAM | Tool to update log stream configuration for an owner. Use when you need to modify log stream settings for a specific workspace. |
| RENDER_UPDATE_OWNER_NOTIFICATION_SETTINGS | Tool to update notification settings for a specific owner (workspace). Use when you need to modify email, preview, or notification type settings. |
| RENDER_UPDATE_POSTGRES | Tool to update a Postgres instance configuration. Use when you need to modify settings like name, plan, disk size, high availability, or IP allowlist for an existing Render Postgres database. |
| RENDER_UPDATE_PROJECT | Tool to update a project's name. Use when you need to rename an existing Render project. |
| RENDER_UPDATE_REGISTRY_CREDENTIAL | Tool to update a registry credential. Use when you need to modify the name, username, authentication token, or registry type for an existing Docker registry credential in your Render account. |
| RENDER_UPDATE_RESOURCE_LOG_STREAM | Tool to update log stream override for a resource. Use when you need to configure whether logs should be sent to a custom endpoint or dropped for a specific resource (server, cron job, postgres, or redis). |
| RENDER_UPDATE_ROUTES | Tool to update redirect/rewrite rules for a service. Use when you need to set or replace the routing configuration for a Render service. This operation replaces all existing routes with the provided list. |
| RENDER_UPDATE_SECRET_FILES_FOR_SERVICE | Tool to update secret files for a Render service. Use when you need to create or update multiple secret files at once for a specific service. |
| RENDER_UPDATE_SERVICE | Tool to update a service configuration. Use when you need to modify service settings such as auto-deploy, branch, build filters, Docker image, name, repository, or service-specific details. |
| RENDER_VERIFY_CUSTOM_DOMAIN | Tool to verify DNS configuration for a custom domain. Use when you need to trigger DNS verification for a custom domain associated with a Render service. |
