# SaaS Time Tracking App (Supabase + React)

This project is a Proof of Concept (MVP) for a multi-tenant Time Tracking application compliant with Spanish labor laws (Art. 34.9 ET).

## Architecture
- **Frontend**: React + Vite (located in `web/` folder)
- **Backend**: Supabase (Postgres, Auth, Edge Functions)
- **Styling**: Vanilla CSS with CSS Variables for Tenant Branding

## Prerequisites
- Node.js (v18+)
- A Supabase Project (Free tier works)

## Setup Instructions

### 1. Database Setup (Supabase)
1. Go to your Supabase Dashboard.
2. Open the **SQL Editor**.
3. Copy the content of `schema.sql` (located in the root of this repository) and run it.
   - This creates all necessary tables (`tenants`, `profiles`, `time_entries`) and Row Level Security (RLS) policies.

### 2. Frontend Setup
1. Navigate to the web folder:
   ```bash
   cd web
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.local` file in the `web` folder with your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## Key Features Implemented (MVP)
- **Multi-tenant Data Model**: Strict separation of data by `tenant_id`.
- **Role-Based Access**: Admins can see all employees; Employees see only their own data.
- **Audit Log**: Immutable record of changes and critical actions.
- **Time Tracking**: Structure for Clock In/Out (Basic Frontend).

## Next Steps for Development
1. **User Invitation Flow**: Implement a Supabase Edge Function to invite users to a specific tenant.
2. **Branding Injection**: Create a React Context to fetch `tenant_branding` and inject CSS variables (`--primary-color`, etc.) into the document root.
3. **Reporting**: Implement logic to fetch records and generate PDF using `jspdf` client-side.
