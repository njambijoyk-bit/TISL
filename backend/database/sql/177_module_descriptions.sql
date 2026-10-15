-- =====================================================================
-- 177_module_descriptions.sql
-- Module Center: the text on each module's card now says what the module holds today (Extras: the point of sale, self checkout, shifts and the rest; Menus; Courses;
-- Memberships; Events; E-commerce). Only the description changes: nothing about licences or switches. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT module_key, name, description FROM modules WHERE module_key IN ('extras', 'menus', 'courses', 'memberships', 'events', 'ecommerce') ORDER BY sort_order;

-- PART B - UPDATE
UPDATE modules SET description = 'Point of sale: cashier till, customer self checkout, shifts and cash-up, returns, receipts. Also delivery and drivers, payroll, customers and loyalty, promo and referral codes, reviews.' WHERE module_key = 'extras';
UPDATE modules SET description = 'Food and drink: menus and dishes, ingredients and recipes, the food till and floor plan, kitchen screens, kiosks and table QR ordering, meal plans, cakes and catering, chefs and rota.' WHERE module_key = 'menus';
UPDATE modules SET description = 'Courses, recipes, notes and live classes: lessons and quizzes, enrolment and fees through the books, a books library, certificates and student progress.' WHERE module_key = 'courses';
UPDATE modules SET description = 'Membership plans and members: billing through the books, benefits and credits, member check-in and reports.' WHERE module_key = 'memberships';
UPDATE modules SET description = 'Events and tickets: sell tickets, check guests in at the door, and refunds.' WHERE module_key = 'events';
UPDATE modules SET description = 'The online shop: products, categories, brands and price lists, stock and purchases, services, hampers and auctions, orders and checkout.' WHERE module_key = 'ecommerce';

-- PART C - CHECK AFTER
SELECT module_key, name, description FROM modules WHERE module_key IN ('extras', 'menus', 'courses', 'memberships', 'events', 'ecommerce') ORDER BY sort_order;
