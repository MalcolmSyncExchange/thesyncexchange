"use client";
export default function ErrorState({reset}:{reset:()=>void}){return <section role="alert" className="space-y-4 p-6"><h2>Analytics are temporarily unavailable</h2><p>No results were inferred. Check your access or try again.</p><button onClick={reset} className="rounded border p-2">Try again</button></section>;}
