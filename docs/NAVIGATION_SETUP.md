# Navigation Setup Guide

This guide explains how to set up navigation and pages in your FRC scouting app using the maneuver-core framework.

## Overview

The framework provides these core navigation components:

- **`MainLayout`** - Main application layout wrapper
- **`AppSidebar`** - Desktop sidebar navigation (≥ 2xl breakpoint)
- **`NavMain`** - Navigation menu with collapsible groups
- **`BottomNavigation`** - Mobile bottom navigation (PWA-aware)
- **`HomePage`** - Customizable home page
- **`NotFoundPage`** - Generic 404 error page

## Basic Setup

### 1. Create Your Routes

```tsx
// src/App.tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { 
  MainLayout, 
  HomePage, 
  NotFoundPage,
  AppSidebar,
  NavMain,
  BottomNavigation
} from '@maneuver-core/components';
import { usePWA } from '@maneuver-core/hooks';
import { Home, Binoculars, QrCode, Settings } from 'lucide-react';

// Your game-specific pages
import { ScoutingPage } from './pages/ScoutingPage';
import { DataTransferPage } from './pages/DataTransferPage';
import { SettingsPage } from './pages/SettingsPage';

// Navigation configuration
const navItems = [
  {
    title: 'Scouting',
    url: '/scout',
    icon: Binoculars,
    items: [
      { title: 'Start Scouting', url: '/scout/start' },
      { title: 'Match History', url: '/scout/history' }
    ]
  }
];

const bottomNavItems = [
  { icon: Home, label: 'Home', href: '/' },
  { icon: Binoculars, label: 'Scout', href: '/scout' },
  { icon: QrCode, label: 'Transfer', href: '/transfer' },
  { icon: Settings, label: 'Settings', href: '/settings' }
];

function Layout() {
  const isPWA = usePWA();
  
  return (
    <MainLayout
      sidebar={
        <AppSidebar
          logo={<img src="/logo.png" alt="Team Logo" />}
          navigation={<NavMain items={navItems} />}
        />
      }
      bottomNavigation={
        <BottomNavigation items={bottomNavItems} isPWA={isPWA} />
      }
    />
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: (
          <HomePage
            logo="/logo.png"
            version="2025.1.0"
            appName="My Scouting App"
          />
        )
      },
      { path: '/scout', element: <ScoutingPage /> },
      { path: '/transfer', element: <DataTransferPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> }
    ]
  }
]);

export default function App() {
  return <RouterProvider router={router} />;
}
```

### 2. Customize the Home Page

```tsx
import { HomePage } from '@maneuver-core/components';

function CustomHomePage() {
  return (
    <HomePage
      logo="/my-team-logo.png"
      version="2025.1.0"
      appName="Team 3314 Scouting"
      demoDataSection={
        <div>
          <h3>Demo Data</h3>
          <p>Current entries: 150</p>
          <Button onClick={loadDemoData}>Load Demo Data</Button>
        </div>
      }
      additionalContent={
        <Card>
          <CardHeader>Quick Links</CardHeader>
          <CardContent>
            <Button variant="outline">View Reports</Button>
            <Button variant="outline">Team Rankings</Button>
          </CardContent>
        </Card>
      }
    />
  );
}
```

### 3. Add Navigation Guards

```tsx
<BottomNavigation
  items={bottomNavItems}
  isPWA={isPWA}
  onBeforeNavigate={(href, label) => {
    if (hasUnsavedData) {
      return confirm(`You have unsaved data. Navigate to ${label}?`);
    }
    return true;
  }}
/>
```

## Component Props Reference

### `MainLayout`

```typescript
interface MainLayoutProps {
  sidebar?: ReactNode;           // Sidebar component
  bottomNavigation?: ReactNode;  // Mobile bottom nav
  header?: ReactNode;            // Header component
  scrollToTop?: ReactNode;       // Scroll to top button
  addBottomPadding?: boolean;    // Add padding for mobile nav (default: true)
  className?: string;            // CSS class name
}
```

### `AppSidebar`

```typescript
interface AppSidebarProps {
  logo?: ReactNode;           // Logo component
  navigation: ReactNode;      // Navigation menu
  footer?: ReactNode;         // Footer content
  headerContent?: ReactNode;  // Additional header content
  className?: string;         // CSS class name
}
```

### `NavMain`

```typescript
interface NavMainProps {
  items: NavItem[];                    // Navigation items
  topItems?: NavItem[];                // Top-level items
  label?: string;                      // Section label
  onBeforeNavigate?: (url, label) => boolean;  // Navigation guard
}

interface NavItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  isActive?: boolean;
  items?: { title: string; url: string; }[];
}
```

### `BottomNavigation`

```typescript
interface BottomNavigationProps {
  items: BottomNavItem[];               // Navigation items
  isPWA: boolean;                       // Is app installed as PWA?
  onBeforeNavigate?: (href, label) => boolean;  // Navigation guard
  showInDev?: boolean;                  // Show in dev mode (default: true)
}

interface BottomNavItem {
  icon: LucideIcon;  // Lucide icon component
  label: string;     // Display label
  href: string;      // Navigation path
}
```

### `HomePage`

```typescript
interface HomePageProps {
  logo?: string;                    // Logo image URL
  version?: string;                 // Version string
  appName?: string;                 // App name (default: "FRC Scouting App")
  demoDataSection?: ReactNode;      // Game-specific demo UI
  additionalContent?: ReactNode;    // Extra custom content
}
```

### `NotFoundPage`

```typescript
interface NotFoundPageProps {
  customImage?: string;    // Custom 404 image URL
  customMessage?: string;  // Custom error message
}
```

## Responsive Behavior

The navigation system automatically adapts to screen size:

- **Mobile (< 1536px / < 2xl):**
  - Sidebar hidden
  - Bottom navigation visible (only in PWA)
  - Content uses full width

- **Desktop (≥ 1536px / ≥ 2xl):**
  - Sidebar visible
  - Bottom navigation hidden
  - Content has sidebar padding

## PWA Awareness

The `BottomNavigation` component only shows on mobile when the app is installed as a PWA. This prevents conflicts with browser navigation controls.

```tsx
import { usePWA } from '@maneuver-core/hooks';

function MyApp() {
  const isPWA = usePWA();  // true if installed as PWA
  
  return (
    <BottomNavigation
      items={navItems}
      isPWA={isPWA}
    />
  );
}
```

**Development Mode:** The bottom navigation will show in development mode (even if not a PWA) with a yellow banner to indicate this is for testing only.

## Advanced: Custom Layouts

You can create custom layouts by composing components differently:

```tsx
function CustomLayout() {
  return (
    <div className="flex h-screen">
      {/* Custom sidebar */}
      <aside className="w-64 border-r">
        <MyCustomSidebar />
      </aside>
      
      {/* Content */}
      <main className="flex-1 overflow-auto">
        <MyCustomHeader />
        <Outlet />
      </main>
    </div>
  );
}
```

## Next Steps

- See [FRAMEWORK_DESIGN.md](./FRAMEWORK_DESIGN.md) for architectural details
- Check out [PWA.md](./PWA.md) for PWA setup
- Read [QR_DATA_TRANSFER.md](./QR_DATA_TRANSFER.md) and [PEER_TRANSFER.md](./PEER_TRANSFER.md) for transfer integration

---

**Framework Philosophy:** Keep navigation generic and configurable. Game-specific routes and content are provided by your game implementation, not hardcoded in the framework.
