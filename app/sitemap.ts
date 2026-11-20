import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'http://localhost:3000';
  return [
    { url: `${base}/`, priority: 1 },
    { url: `${base}/app`, priority: 0.8 },
    { url: `${base}/app/ask`, priority: 0.6 },
    { url: `${base}/app/cost`, priority: 0.6 },
    { url: `${base}/app/settings`, priority: 0.4 },
    { url: `${base}/app/c/mkt`, priority: 0.5 },
    { url: `${base}/app/c/db`, priority: 0.5 },
    { url: `${base}/app/c/startup`, priority: 0.5 },
  ];
}