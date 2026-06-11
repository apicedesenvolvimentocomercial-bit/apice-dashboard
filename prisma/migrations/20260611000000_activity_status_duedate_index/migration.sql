-- Cron de notificações de atividade (findDueActivities/findOverdueActivities)
-- filtra só status+dueDate, CROSS-org — nenhum índice existente começa por
-- status. Medido em prod (2026-06-11): overdue = Seq Scan 3.01s; janela de 24h
-- já usava o índice de dueDate (0.05s). Composto status+dueDate serve as duas.
CREATE INDEX "Activity_status_dueDate_idx" ON "Activity"("status", "dueDate");
