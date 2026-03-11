## Packages
date-fns | Required for complex date math and heatmap grid calculations
framer-motion | Required for smooth, Apple-like page transitions and micro-interactions
clsx | Utility for constructing className strings conditionally
tailwind-merge | Utility for merging Tailwind CSS classes safely

## Notes
- App uses Replit Auth (useAuth hook imported from @/hooks/use-auth).
- Heatmap uses a 180-day lookback window calculated dynamically based on current date.
- Activity Timer tracks elapsed time and posts the session.
