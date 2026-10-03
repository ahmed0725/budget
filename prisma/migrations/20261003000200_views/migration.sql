-- Compatibility views: revenue/expenditure codes and lines share normalised tables.
CREATE VIEW `revenue_codes` AS SELECT * FROM `budget_codes` WHERE `kind` = 'REVENUE';
CREATE VIEW `expenditure_codes` AS SELECT * FROM `budget_codes` WHERE `kind` = 'EXPENDITURE';
CREATE VIEW `revenue_lines` AS SELECT * FROM `budget_lines` WHERE `kind` = 'REVENUE';
CREATE VIEW `expenditure_lines` AS SELECT * FROM `budget_lines` WHERE `kind` = 'EXPENDITURE';
