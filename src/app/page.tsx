'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import styles from './page.module.css';
import type { Asteroid, NeoFeedResponse } from '@/types/asteroid';
import AsteroidCard from '@/components/AsteroidCard';
import { Comic_Neue } from 'next/font/google';

const comicNeue = Comic_Neue({
  subsets: ['latin'],
  weight: ['400', '700'],
});

export default function Home() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [asteroids, setAsteroids] = useState<Asteroid[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedAsteroid, setSelectedAsteroid] = useState<Asteroid | null>(null);
  const [showSimulation, setShowSimulation] = useState(false);

  useEffect(() => { // Set default dates on initial load
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(nextWeek);
  }, []);

  // Automatically update end date when start date changes
  const handleStartDateChange = (newStartDate: string) => {
    setStartDate(newStartDate);
    // Calculate end date as 7 days from start date
    const start = new Date(newStartDate);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const endDateStr = end.toISOString().split('T')[0];
    setEndDate(endDateStr);
  };

  const fetchAsteroids = async (start: string, end: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/asteroids?start_date=${start}&end_date=${end}`);
      if (!response.ok) throw new Error('Failed to fetch asteroids');

      const data: NeoFeedResponse = await response.json();

      const allAsteroids: Asteroid[] = [];
      Object.values(data.near_earth_objects).forEach(dateAsteroids => {
        allAsteroids.push(...dateAsteroids);
      });

      allAsteroids.sort((a, b) => {
        const aDistance = parseFloat(a.close_approach_data[0].miss_distance.kilometers);
        const bDistance = parseFloat(b.close_approach_data[0].miss_distance.kilometers);
        return aDistance - bDistance;
      });

      setAsteroids(allAsteroids);
    } catch (err) {
      setError('Failed to load asteroid data. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (startDate && endDate) {
      fetchAsteroids(startDate, endDate);
    }
  };

  const handleRunSimulation = () => {
    setShowSimulation(true);

    if (selectedAsteroid) {
      // Calculate physics-based animation duration
      const velocity = parseFloat(selectedAsteroid.close_approach_data[0].relative_velocity.kilometers_per_second);
      const diameter = selectedAsteroid.estimated_diameter.meters.estimated_diameter_max;
      const energy = parseFloat(calculateImpactEnergy(diameter, velocity));

      // Faster asteroids = shorter fall time (20km/s baseline = 2s, scales with velocity)
      const fallDuration = Math.max(1000, Math.min(3000, 2000 * (20 / velocity)));

      // Bigger asteroids = longer explosions
      const explosionScale = Math.min(2, Math.max(0.5, diameter / 100));

      // Calculate crater size for visual damage
      const craterSize = parseFloat(calculateCraterSize(diameter));

      // Damage scale based on energy (bigger impacts = more visible damage)
      const damageScale = Math.min(1, energy / 1000); // Cap at 1000 megatons for visual scale

      // Store physics data for CSS (via CSS custom properties)
      document.documentElement.style.setProperty('--fall-duration', `${fallDuration}ms`);
      document.documentElement.style.setProperty('--explosion-scale', `${explosionScale}`);
      document.documentElement.style.setProperty('--asteroid-size', `${Math.min(80, Math.max(20, diameter / 5))}px`);
      document.documentElement.style.setProperty('--crater-size', `${Math.min(150, Math.max(30, craterSize * 3))}px`);
      document.documentElement.style.setProperty('--damage-scale', `${damageScale}`);
    }
  };

  const handleCloseSimulation = () => {
    setShowSimulation(false);
  };

  return (
    <div className={`${styles.page} ${comicNeue.className}`}>
      <main className={styles.main}>
        <header className={styles.header}>
         <Image
        src="/HeaderAestroid.png"
        alt="Earth with asteroid impact"
        width={180}
        height={180}
        className={styles.headerImage}
        priority
      />
          <h1>Asteroid Impact Simulator</h1>
        </header>

        <form onSubmit={handleSearch} className={styles.searchForm}>
          <div className={styles.dateInputs}>
            <label>
              Start Date: <span style={{ fontSize: '0.9rem', color: '#6b7280', fontWeight: 400 }}>(End date is 7 days later)</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                required
              />
            </label>
          </div>
          <button type="submit" disabled={loading} className={comicNeue.className}>
            {loading ? 'Searching...' : 'Search Asteroids'}
          </button>
        </form>

        {error && <div className={styles.error}>{error}</div>}

        {loading ? (
          <div className={styles.loading}>Loading asteroid data...</div>
        ) : (
          <>
            <div className={styles.asteroidGrid}>
              {asteroids.map((asteroid) => (
                <AsteroidCard
                  key={asteroid.id}
                  asteroid={asteroid}
                  onClick={() => setSelectedAsteroid(asteroid)}
                />
              ))}
            </div>
          </>
        )}

        {selectedAsteroid && (
          <div className={styles.modal} onClick={() => setSelectedAsteroid(null)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <button className={styles.closeButton} onClick={() => setSelectedAsteroid(null)}>
                ×
              </button>
              <h2>{selectedAsteroid.name}</h2>
              <div className={styles.modalDetails}>
                <h3>Impact Scenario</h3>
                <p>What if this asteroid hit Earth?</p>
                <div className={styles.impactStats}>
                  <div>
                    <strong>Diameter:</strong>{' '}
                    {selectedAsteroid.estimated_diameter.meters.estimated_diameter_min.toFixed(0)} -{' '}
                    {selectedAsteroid.estimated_diameter.meters.estimated_diameter_max.toFixed(0)} meters
                  </div>
                  <div>
                    <strong>Velocity:</strong>{' '}
                    {parseFloat(selectedAsteroid.close_approach_data[0].relative_velocity.kilometers_per_second).toFixed(2)} km/s
                  </div>
                  <div>
                    <strong>Kinetic Energy:</strong>{' '}
                    {calculateImpactEnergy(
                      selectedAsteroid.estimated_diameter.meters.estimated_diameter_max,
                      parseFloat(selectedAsteroid.close_approach_data[0].relative_velocity.kilometers_per_second)
                    )} megatons TNT
                  </div>
                  <div>
                    <strong>Crater Size:</strong>{' '}
                    {calculateCraterSize(selectedAsteroid.estimated_diameter.meters.estimated_diameter_max)} km
                  </div>
                </div>
                <button className={styles.simulationButton} onClick={handleRunSimulation}>
                  Run Impact Simulation
                </button>
              </div>
            </div>
          </div>
        )}

        {showSimulation && selectedAsteroid && (
          <div className={styles.simulationOverlay}>
            <button className={styles.simulationCloseButton} onClick={handleCloseSimulation}>
              ×
            </button>
            <div className={styles.simulationContent}>
              <div className={styles.earth}>
                <div className={styles.crater}></div>
                <div className={styles.damageZone}></div>
              </div>
              <div className={styles.asteroid}></div>
              <div className={styles.explosion}></div>
              <div className={styles.shockwave}></div>
              <div className={styles.simulationText}>
                {selectedAsteroid.name} Impact Simulation
              </div>
              <div className={styles.physicsData}>
                <div>Velocity: {parseFloat(selectedAsteroid.close_approach_data[0].relative_velocity.kilometers_per_second).toFixed(2)} km/s</div>
                <div>Energy: {calculateImpactEnergy(
                  selectedAsteroid.estimated_diameter.meters.estimated_diameter_max,
                  parseFloat(selectedAsteroid.close_approach_data[0].relative_velocity.kilometers_per_second)
                )} megatons TNT</div>
                <div>Diameter: {selectedAsteroid.estimated_diameter.meters.estimated_diameter_max.toFixed(0)}m</div>
                <div>Crater: {calculateCraterSize(selectedAsteroid.estimated_diameter.meters.estimated_diameter_max)} km</div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function calculateImpactEnergy(diameterMeters: number, velocityKmPerSec: number): string {
  const radius = diameterMeters / 2;
  const volume = (4 / 3) * Math.PI * Math.pow(radius, 3);
  const density = 3000;
  const mass = volume * density;
  const velocityMetersPerSec = velocityKmPerSec * 1000;
  const energyJoules = 0.5 * mass * Math.pow(velocityMetersPerSec, 2);
  const megatonsTNT = energyJoules / 4.184e15;
  return megatonsTNT.toFixed(2);
}

function calculateCraterSize(diameterMeters: number): string {
  const craterDiameterKm = (diameterMeters * 20) / 1000;
  return craterDiameterKm.toFixed(2);
}
