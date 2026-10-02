import Link from "next/link";
import { Headphones, Music2 } from "lucide-react";
import styles from "./auth-form.module.css";

export function SignupRoleLinks({role}: {role?: "buyer" | "artist"}) {
  return <nav aria-label="Choose your account type" className={styles.roles}>
    <Link href="/signup/buyer" aria-current={role === "buyer" ? "page" : undefined}><Headphones aria-hidden="true" size={22} /><span>Find music for a project</span></Link>
    <Link href="/signup/artist" aria-current={role === "artist" ? "page" : undefined}><Music2 aria-hidden="true" size={22} /><span>List music for licensing</span></Link>
  </nav>;
}
