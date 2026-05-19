-- CreateIndex
CREATE INDEX "Activity_organizationId_status_dueDate_idx" ON "Activity"("organizationId", "status", "dueDate");
