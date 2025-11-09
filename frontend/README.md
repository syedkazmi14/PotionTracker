# PotionTracker Frontend

A modern React + TypeScript frontend for monitoring cauldron systems.

## Features

- 🎨 **TailwindCSS** with dark mode and custom purple accent (#683cfc)
- 🧩 **shadcn/ui** components for consistent UI
- 🗺️ **Mapbox GL** integration for interactive maps
- 📊 **Recharts** for data visualizations
- 🔄 **React Query** for efficient data fetching
- 🗂️ **Zustand** for global state management
- ✅ **Zod** for runtime validation
- ⏰ **Luxon** for time formatting

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the `frontend` directory:

```env
VITE_API_URL=http://localhost:3000
VITE_MAPBOX_TOKEN=your_mapbox_token_here
```

Get a Mapbox token from [mapbox.com](https://www.mapbox.com/)

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── ui/           # shadcn/ui base components
│   │   ├── Card.tsx      # KPI card component
│   │   ├── ChartContainer.tsx
│   │   ├── MapView.tsx
│   │   ├── AnomalyTable.tsx
│   │   └── CauldronSparkline.tsx
│   ├── layouts/          # Layout components
│   │   └── MainLayout.tsx
│   ├── pages/            # Route pages
│   │   ├── DashboardPage.tsx
│   │   ├── MapPage.tsx
│   │   └── CauldronDetailPage.tsx
│   ├── hooks/            # React Query hooks
│   ├── store/            # Zustand stores
│   ├── lib/              # Utilities and API client
│   ├── types/            # TypeScript types
│   └── main.tsx         # Entry point
└── public/
```

## Pages

- **Dashboard** (`/dashboard`) - Overview with KPIs and charts
- **Map** (`/map`) - Interactive map of all cauldrons
- **Cauldron Detail** (`/cauldron/:id`) - Detailed view of a single cauldron

## Mock Data

The app currently uses mock data defined in `src/lib/api.ts`. Replace this with actual API calls when connecting to a backend.

