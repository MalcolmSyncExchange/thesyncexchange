"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <div role="alert"><p>SEC operations are unavailable. No result is assumed.</p><button onClick={reset}>Retry</button></div>;}
