# Visual Design Principles and Branding

## 1. Core Palette (Campus Context)
- **Primary (Action)**: `#3b82f6` (Vibrant Blue) - Used for primary buttons and "Claimed" status.
- **Success (Available)**: `#22c55e` (Emerald Green) - Used for "Free" status and confirmations.
- **Warning (Maybe)**: `#eab308` (Amber Yellow) - Used for "Medium Confidence" or "Maybe" status.
- **Danger (Full)**: `#ef4444` (Rose Red) - Used for "Full" status and critical errors.
- **Background**: `#f8fafc` (Slate 50) - Clean, light background to let the map dominate.
- **Text**: `#1e293b` (Slate 800) - High contrast for readability.

## 2. Typography
- **Primary Font**: `Inter` or `system-ui` (Sans-serif) - Clean, modern, and highly legible on small screens.
- **Weights**: 400 (Regular) for body, 600 (Semi-bold) for labels, 700 (Bold) for spot names.

## 3. Map Marker Design
- **Shape**: Teardrop (On-campus) vs. Circle (Off-campus).
- **Scale**: Selected markers scale up by 1.35x.
- **Animations**:
    - **Pulsing**: Free spots should have a subtle green pulse to attract the eye.
    - **Ripple**: Claimed spots have a blue ripple for the first 5 minutes.

## 4. Component Styles
- **Bottom Sheet (Mobile)**: Large rounded corners (`1.5rem`), draggable handle, background blur (`backdrop-filter`).
- **Sidebar (Desktop)**: Fixed position, semi-transparent glassmorphism effect.
- **Spot Cards**: Consistent spacing (`1rem`), iconography for amenities (Lucide icons), and clear confidence badges.

## 5. Iconography
- Use **Lucide Icons** for a consistent, lightweight stroke-based look.
- Icons should be intuitive: ⚡ (Outlet), 📶 (Wi-Fi), 🔇 (Quiet), 🍔 (Food).
