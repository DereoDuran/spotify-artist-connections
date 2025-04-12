# Spotify Artist Connections / Song Finder

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjosecarlosgt%2Fartist-graph&env=NEXT_PUBLIC_SPOTIFY_CLIENT_ID,SPOTIFY_CLIENT_SECRET&envDescription=Spotify%20API%20Credentials&envLink=https%3A%2F%2Fdeveloper.spotify.com%2Fdashboard%2Fapplications)

This application allows users to log in with their Spotify account and search for an artist. It then fetches and displays a comprehensive list of songs associated with that artist, including their albums, singles, and appearances on other works.

**Live Version:** [https://spotify-artist-connections.vercel.app/](https://spotify-artist-connections.vercel.app/)

## Features

*   Spotify Authentication (OAuth 2.0)
*   Search for artists using the Spotify API.
*   Fetches all albums, singles, compilations, and appearances for a given artist.
*   Displays a deduplicated list of songs.
*   Handles Spotify API token refresh automatically.

## Tech Stack

*   [Next.js](https://nextjs.org/) (App Router)
*   [TypeScript](https://www.typescriptlang.org/)
*   [Tailwind CSS](https://tailwindcss.com/)
*   Spotify Web API

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
