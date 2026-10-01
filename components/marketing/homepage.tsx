import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileCheck2, Music2, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import surface from "@/components/layout/sync-surface.module.css";
import styles from "./homepage.module.css";

const buyerSteps = [
  { icon: Search, title: "Find it.", text: "Search by sound, mood, genre, track, or artist." },
  { icon: ShieldCheck, title: "Clear it.", text: "Review the rights information, availability, price, and terms for the offered license." },
  { icon: FileCheck2, title: "License it.", text: "Choose the license for your use and keep the agreement record." }
];

export function Homepage() {
  return <main className={styles.home}>
    <section className={styles.hero} aria-labelledby="home-title">
      <div className={styles.heroMedia} aria-hidden="true">
        <Image src="/images/sync-sound-sculpture.webp" alt="" fill priority sizes="100vw" className={styles.heroArtwork} />
      </div>
      <div className={styles.heroAtmosphere} aria-hidden="true" />
      <div className={styles.heroTransition} aria-hidden="true" />
      <div className={styles.heroContent}>
        <div className={styles.heroCopy}>
          <p className={`${surface.eyebrow} ${styles.titleCaseEyebrow} ${styles.heroEyebrow}`}>Music Licensing Marketplace</p>
          <h1 id="home-title" className={styles.heroTitle}>Find it. Clear it. License it.</h1>
          <p className={`${surface.description} ${styles.heroDescription}`}>A music licensing marketplace for buyers and artists. Find music, review what is offered, and choose a license for your project.</p>
          <div className={styles.heroConversion}>
            <div className={styles.actions}>
              <Button asChild size="lg" className={styles.primaryAction}><Link href="/discover">Search music<ArrowRight aria-hidden="true" size={18} /></Link></Button>
              <Button asChild variant="outline" size="lg" className={styles.secondaryAction}><Link href="/signup/artist">List your music<Music2 aria-hidden="true" size={18} /></Link></Button>
            </div>
            <p className={styles.signin}>Already part of The Sync Exchange? <Link href="/login">Log in</Link></p>
          </div>
        </div>
      </div>
    </section>

    <section className={styles.discovery} aria-labelledby="discovery-title">
      <div className={styles.sectionHeading}><div><p className={surface.eyebrow}>How it works</p><h2 id="discovery-title">From first listen to license record.</h2></div><Link href="/how-it-works" className={surface.link}>See both paths<ArrowRight aria-hidden="true" size={18} /></Link></div>
      <ol className={styles.steps}>{buyerSteps.map(({icon: Icon,title,text},index)=><li key={title}><div className={styles.stepTop}><Icon aria-hidden="true" size={26} /><span>0{index+1}</span></div><h3>{title}</h3><p>{text}</p></li>)}</ol>
    </section>

    <section className={styles.artist} aria-labelledby="artist-title">
      <div><p className={surface.eyebrow}>For artists & rightsholders</p><h2 id="artist-title">Make your music easy to find and ready to license.</h2><p className={surface.description}>Build your public profile, add your catalog, provide recording and composition details, and set supported license prices.</p><Link href="/for-artists" className={surface.link}>Learn about Artist Desk<ArrowRight aria-hidden="true" size={18} /></Link></div>
      <div className={styles.artistJourney}><h3>Your music. Your offer.</h3><ol>{[["Be found.","Build a public artist profile and add your catalog."],["Make the rights clear.","Provide recording and composition information separately."],["Set license options.","Choose supported offer prices. Platform terms stay separate."]].map(([title,text])=><li key={title}><CheckCircle2 aria-hidden="true" size={26} /><div><h4>{title}</h4><p>{text}</p></div></li>)}</ol></div>
    </section>

    <section className={styles.closing}><div><p className={surface.eyebrow}>Clear it.</p><h2>Know what is offered before you move forward.</h2><p className={surface.description}>See the track’s rights information, license availability, price, and terms. This helps you understand the offer. It is not a promise that every right has been independently verified.</p></div><Button asChild size="lg" variant="outline"><Link href="/rights-and-licensing">How rights and licensing work<ArrowRight aria-hidden="true" size={18} /></Link></Button></section>
  </main>;
}
