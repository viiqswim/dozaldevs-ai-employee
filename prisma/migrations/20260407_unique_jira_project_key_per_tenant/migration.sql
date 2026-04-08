-- Add unique constraint on jira_project_key per tenant
CREATE UNIQUE INDEX "projects_jira_project_key_tenant_id_key" ON "projects"("jira_project_key", "tenant_id");
