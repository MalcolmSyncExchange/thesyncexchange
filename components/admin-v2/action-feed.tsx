"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleAlert, Clock3 } from "lucide-react";

import type { AdminAttentionItem, AdminAttentionPriority } from "@/lib/admin-v2/operations";
import styles from "./operations.module.css";

const filters: Array<"All" | AdminAttentionPriority> = ["All", "Critical", "Needs attention", "Review", "Informational"];

export function ActionFeed({ items, filterable = false }: { items: AdminAttentionItem[]; filterable?: boolean }) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const visible = filter === "All" ? items : items.filter((item) => item.priority === filter || item.priority === "Critical");

  return (
    <>
      {filterable ? (
        <div className={styles.filters} role="group" aria-label="Filter attention items by priority">
          {filters.map((option) => <button key={option} type="button" aria-pressed={option === filter} onClick={() => setFilter(option)}>{option}</button>)}
        </div>
      ) : null}
      {filter !== "All" && filter !== "Critical" && items.some((item) => item.priority === "Critical") ? (
        <p className={styles.filterNote}>Unresolved Critical items stay visible in every filter.</p>
      ) : null}
      {visible.length ? (
        <div className={styles.feed}>
          {visible.map((item) => (
            <article className={styles.actionItem} key={item.key}>
              <div className={styles.actionIcon} aria-hidden="true"><CircleAlert size={18} /></div>
              <div className={styles.actionBody}>
                <div className={styles.actionTop}><span className={`${styles.priority} ${styles[item.priority.replace(" ", "").toLowerCase()]}`}>{item.priority}</span><span className={styles.entity}>{item.entity} · {item.entityId}</span></div>
                <h3>{item.title}</h3>
                <p>{item.reason}</p>
                <div className={styles.actionMeta}><Clock3 size={13} aria-hidden="true" /> Recorded {formatUtc(item.eventAt)} · Source: {item.source}</div>
              </div>
              <Link className={styles.inspect} href={item.href} aria-label={`Inspect ${item.entity.toLowerCase()} ${item.title}`}>
                Inspect <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      ) : filterable && items.length ? (
        <p className={styles.filterNote} role="status">No items match this priority. Choose All to see the current list.</p>
      ) : null}
    </>
  );
}

function formatUtc(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "time unavailable" : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
