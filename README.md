# PolyBet365

A Polymarket-style prediction market platform.

## Stack
- **Frontend:** React + Vite → Vercel
- **Backend:** Node.js + Express → Render
- **Database:** MongoDB Atlas

## Development

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Seed Database
```bash
cd backend
npm run seed
```

## Environment Variables

### Backend (`backend/.env`)
```
MONGODB_URI=...
JWT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
CLIENT_URL=http://localhost:5173
PORT=5000
NODE_ENV=development
```

### Frontend (`frontend/.env`)
```
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_CLIENT_ID=...
VITE_WALLETCONNECT_PROJECT_ID=...
```
