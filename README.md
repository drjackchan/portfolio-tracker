# Portfolio Tracker

A personal wealth management web application for tracking investments, liabilities, subscriptions, transactions, and AdSense income. Built with React, Express, and PostgreSQL.

## Features

- **Dashboard**: View net worth, asset breakdown, and interactive charts.
- **Assets Management**: Track stocks, crypto, and properties.
- **Liabilities**: Monitor debts and loans.
- **Subscriptions**: Manage recurring expenses.
- **Transactions**: Log income and expenses with categorization.
- **AdSense Income**: Integrate and track Google AdSense earnings.
- **Authentication**: Secure login with Google OAuth.
- **Real-time Updates**: Live data synchronization via WebSockets.
- **Themes**: Dark and light mode support.
- **Responsive Design**: Optimized for desktop and mobile.

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Radix UI, Wouter, Framer Motion, Recharts
- **Backend**: Express.js, Passport.js, Drizzle ORM
- **Database**: PostgreSQL
- **Deployment**: Vercel
- **Real-time**: WebSockets
- **Authentication**: Google OAuth 2.0

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- Google OAuth credentials (for authentication)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/portfolio-tracker.git
   cd portfolio-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory with:
   ```
   DATABASE_URL=postgresql://username:password@localhost:5432/portfolio_db
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   SESSION_SECRET=your_session_secret
   NODE_ENV=development
   ```

4. Set up the database:
   ```bash
   npm run db:push
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
npm run build
npm start
```

## Project Structure

```
portfolio-tracker/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   └── utils/          # Utility functions
│   └── index.html          # Main HTML file
├── server/                 # Express backend
│   ├── index.ts            # Server entry point
│   ├── routes/             # API routes
│   └── middleware/         # Express middleware
├── db/                     # Database schema and migrations
├── script/                 # Build scripts
├── .vercel/                # Vercel deployment config
├── DESIGN.md               # Design specification
└── package.json            # Project dependencies
```

## API Documentation

### Authentication
- `POST /auth/google` - Google OAuth login
- `GET /auth/logout` - Logout

### Holdings
- `GET /api/holdings` - Get all holdings
- `POST /api/holdings` - Create a new holding
- `PUT /api/holdings/:id` - Update a holding
- `DELETE /api/holdings/:id` - Delete a holding

### Liabilities
- `GET /api/liabilities` - Get all liabilities
- `POST /api/liabilities` - Create a new liability
- `PUT /api/liabilities/:id` - Update a liability
- `DELETE /api/liabilities/:id` - Delete a liability

### Subscriptions
- `GET /api/subscriptions` - Get all subscriptions
- `POST /api/subscriptions` - Create a new subscription
- `PUT /api/subscriptions/:id` - Update a subscription
- `DELETE /api/subscriptions/:id` - Delete a subscription

### Transactions
- `GET /api/transactions` - Get all transactions
- `POST /api/transactions` - Create a new transaction
- `PUT /api/transactions/:id` - Update a transaction
- `DELETE /api/transactions/:id` - Delete a transaction

### AdSense Income
- `GET /api/adsense` - Get AdSense income data
- `POST /api/adsense` - Add new AdSense income entry

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a pull request

## License

This project is licensed under the MIT License.