# Portfolio Tracker - Design Specification

## Overview
A personal wealth management app for tracking investments (stocks, crypto, properties), liabilities, subscriptions, transactions, and AdSense income. Built as a full-stack web app with real-time updates.

## Architecture
- **Frontend**: React (Vite build tool) with Tailwind CSS, Radix UI components, Wouter for routing, and Framer Motion for animations.
- **Backend**: Express.js API with session-based authentication (Passport.js + Google OAuth).
- **Database**: PostgreSQL with Drizzle ORM for schema management and queries.
- **Deployment**: Vercel (serverless functions for API, static hosting for client).
- **Real-time**: WebSockets (ws library) for live updates.
- **State Management**: React Query for API data fetching.

## Features
- **Dashboard**: Overview of net worth, charts (Recharts), and asset breakdown.
- **Assets**: CRUD for holdings (stocks/crypto/properties).
- **Liabilities**: Track debts/loans.
- **Subscriptions**: Recurring expenses.
- **Transactions**: Income/expense logging with categorization.
- **AdSense Income**: Integration for Google AdSense earnings.
- **Authentication**: Login/logout with Google OAuth, session persistence.
- **Themes**: Dark/light mode with next-themes.
- **Responsive**: Mobile-first design with Tailwind.

## Data Models (Drizzle Schema)
- **Users**: id, email, name, created_at.
- **Holdings**: id, user_id, type (stock/crypto/property), symbol/name, quantity, value, purchase_date.
- **Liabilities**: id, user_id, name, amount, interest_rate, due_date.
- **Subscriptions**: id, user_id, name, amount, frequency, next_due.
- **Transactions**: id, user_id, type (income/expense), amount, category, date, description.
- **AdsenseIncome**: id, user_id, date, earnings.

## API Endpoints
- GET/POST/PUT/DELETE /api/holdings
- GET/POST/PUT/DELETE /api/liabilities
- GET/POST/PUT/DELETE /api/subscriptions
- GET/POST/PUT/DELETE /api/transactions
- GET/POST /api/adsense
- POST /auth/google (OAuth)
- GET /auth/logout

## Tech Stack Details
- **Frontend Libs**: React Hook Form (forms), Zod (validation), Lucide React (icons), React Resizable Panels (layout).
- **Backend Libs**: Drizzle Kit (migrations), Connect-PG-Simple (session store), Serverless-HTTP (Vercel adapter).
- **Security**: HTTPS-only, CSRF protection via sessions, input sanitization with Zod.
- **Performance**: Lazy loading, code splitting, optimized builds.

## Development Workflow
- Run `npm run dev` for local dev (Vite + Express).
- Build with `npm run build`.
- DB migrations: `npm run db:push`.
- Testing: No tests yet—consider adding with Vitest or Jest.

## Future Enhancements
- Multi-currency support.
- Export reports (PDF/CSV).
- Notifications for due dates.
- Integration with financial APIs (e.g., Alpha Vantage for stock prices).

## Notes
- Built with modern ES modules and TypeScript.
- No SSR; client-side rendering only.
- Accessible UI with Radix components.