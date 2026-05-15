# TISL Content Studio — Implementation Guide

This folder contains all the necessary assets to implement the publishing system.
To finalize the integration, move the files to the following locations in your main repository:

## 1. Backend (Laravel)
Run the `studio_db.sql` script on your database first.

- `backend/Models/*`          → `backend/app/Models/`
- `backend/Controllers/*`     → `backend/app/Http/Controllers/Api/`

## 2. Frontend (React)
- `frontend/store/studioStore.js`        → `frontend/src/store/studioStore.js`
- `frontend/pages/admin/*`               → `frontend/src/pages/admin/`
- `frontend/pages/customer/*`            → `frontend/src/pages/customer/`
- `frontend/components/studio/blocks/*`  → `frontend/src/components/studio/blocks/`

## 3. Integration Snippets
Copy and paste the code from `integration_snippets.txt` into:
- `backend/routes/api.php`
- `frontend/src/App.jsx`
- `frontend/src/pages/admin/settings/Settings.jsx`

---
The flow is:
1. Go to Settings > Publications.
2. Create a new Publication (type is required).
3. You will be redirected to the Editor.
4. Drag blocks from the left sidebar to the canvas.
5. Click a block to edit its properties in the right sidebar.
6. Set status to 'Published' and save.
7. View at `/brochures/:slug`, `/news/:slug`, or `/blog/:slug`.
