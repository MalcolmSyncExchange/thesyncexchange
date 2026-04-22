const remotePatterns = [
  {
    protocol: "https",
    hostname: "images.unsplash.com"
  }
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (supabaseUrl) {
  try {
    remotePatterns.push({
      protocol: "https",
      hostname: new URL(supabaseUrl).hostname
    });
  } catch {
    // Ignore malformed local env here; runtime env validation handles it elsewhere.
  }
}

const nextConfig = {
  images: {
    remotePatterns
  }
};

export default nextConfig;
