import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Heart, Music2, Search, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import surface from "@/components/layout/sync-surface.module.css";
import styles from "./homepage.module.css";

const buyerSteps = [
  { icon: Search, title: "Find your sound", text: "Explore music by genre, mood, tempo and license budget. Listen as you browse." },
  { icon: Heart, title: "Build your shortlist", text: "Save the tracks that fit. Return to your favorites when you’re ready to choose." },
  { icon: FileCheck2, title: "License for your project", text: "Review license options, complete your purchase and find your agreement in your account." }
];

export function Homepage() {
  return <main className={styles.home}>
    <section className={styles.hero} aria-labelledby="home-title">
      <div>
        <p className={surface.eyebrow}>Music for what’s next</p>
        <h1 id="home-title">Your next project starts with the right music.</h1>
        <p className={surface.description}>Discover independent music, save your favorites, and find a license that fits your next film, campaign or creative project.</p>
        <div className={styles.actions}>
          <Button asChild size="lg"><Link href="/signup/buyer">Find music<ArrowRight aria-hidden="true" size={18} /></Link></Button>
          <Button asChild variant="outline" size="lg"><Link href="/signup/artist">I’m an artist<Music2 aria-hidden="true" size={18} /></Link></Button>
        </div>
        <p className={styles.signin}>Already part of The Sync Exchange? <Link href="/login">Log in</Link></p>
      </div>
      <figure className={styles.feature}>
        <div className={styles.photo}><Image src="https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1400&q=80" alt="Studio microphone ready for a recording session" fill priority sizes="(min-width: 1000px) 40vw, 100vw" className="object-cover" /></div>
        <figcaption><Music2 aria-hidden="true" size={22} /><div><strong>Independent music. New possibilities.</strong><p>A place for artists and the projects that need their sound.</p></div></figcaption>
      </figure>
    </section>

    <section className={styles.discovery} aria-labelledby="discovery-title">
      <div className={styles.sectionHeading}><div><p className={surface.eyebrow}>For music buyers</p><h2 id="discovery-title">From first listen to your next project.</h2></div><Link href="/how-it-works" className={surface.link}>How it works<ArrowRight aria-hidden="true" size={18} /></Link></div>
      <ol className={styles.steps}>{buyerSteps.map(({icon: Icon,title,text},index)=><li key={title}><div className={styles.stepTop}><Icon aria-hidden="true" size={26} /><span>0{index+1}</span></div><h3>{title}</h3><p>{text}</p></li>)}</ol>
    </section>

    <section className={styles.artist} aria-labelledby="artist-title">
      <div><p className={surface.eyebrow}>For independent artists</p><h2 id="artist-title">Your next release starts here.</h2><p className={surface.description}>Bring your music, add the details, and submit it for review. Keep your catalog and rights information together in one workspace.</p><Link href="/signup/artist" className={surface.link}>Create your artist account<ArrowRight aria-hidden="true" size={18} /></Link></div>
      <div className={styles.artistJourney}><h3>Your path to the catalog</h3><ol>{[["Prepare your track","Add your recording, metadata and rights holders."],["Submit for review","Follow your submission’s progress in your dashboard."],["Make it discoverable","Approved, eligible tracks appear in the buyer catalog."]].map(([title,text])=><li key={title}><CheckCircle2 aria-hidden="true" size={26} /><div><h4>{title}</h4><p>{text}</p></div></li>)}</ol></div>
    </section>

    <section className={styles.closing}><div><p className={surface.eyebrow}>The Sync Exchange</p><h2>Let’s find your next sound.</h2></div><Button asChild size="lg"><Link href="/signup/buyer">Start discovering<ArrowRight aria-hidden="true" size={18} /></Link></Button></section>
  </main>;
}
