import type { Asteroid } from "@/types/asteroid";
import styles from "./AsteroidCard.module.css";

type Props = {
  asteroid: Asteroid;
  onClick?: () => void;
};

export default function AsteroidCard({ asteroid, onClick }: Props) {
  const ca = asteroid.close_approach_data?.[0];

  const missKm = ca?.miss_distance?.kilometers
    ? Math.round(Number(ca.miss_distance.kilometers)).toLocaleString()
    : "N/A";

  const speedKmh = ca?.relative_velocity?.kilometers_per_hour
    ? Math.round(Number(ca.relative_velocity.kilometers_per_hour)).toLocaleString()
    : "N/A";

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <div className={styles.name}>{asteroid.name}</div>
          <div className={styles.meta}>
            Hazardous:{" "}
            <b>{asteroid.is_potentially_hazardous_asteroid ? "Yes" : "No"}</b>
          </div>
        </div>

        <button className={styles.link} onClick={onClick}>
          View
        </button>
      </div>

      <div className={styles.row}>
        <div className={styles.kpi}>
          <div className={styles.label}>Miss distance (km)</div>
          <div className={styles.value}>{missKm}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.label}>Speed (km/h)</div>
          <div className={styles.value}>{speedKmh}</div>
        </div>
      </div>
    </div>
  );
}