'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// @ts-ignore
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

interface Simulation3DProps {
asteroidDiameter: number;   // in meters (based on your conversion logic)
explosionScale: number;     // currently UNUSED
fallDuration: number;       // milliseconds for the fall
craterSize: number;         // currently UNUSED
damageScale: number;        // currently UNUSED

}

export default function Simulation3D({
  asteroidDiameter,
  fallDuration,
  explosionScale,
  craterSize,
  damageScale,
 
}: Simulation3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // ─── Renderer ───
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);

    // ─── Scene ───
    const scene = new THREE.Scene();

    // ─── Camera ───
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    camera.position.set(0, 15, 55);

    // ─── OrbitControls ───
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 30;
    controls.maxDistance = 100;
    controls.target.set(0, 0, 0);

    // ─── Scaling ───
    // Earth real diameter: 12,742 km
    // s/v = x/12742 where v = Earth visual diameter, x = asteroid diameter in km
    const v = 40;
    const earthRadius = v / 2;
    const xKm = asteroidDiameter / 1000;
    const s = v * (xKm / 12742);
    const asteroidRadius = Math.max(0.5, s / 2);

    // ─── Starfield ───
    const starCount = 2000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 400 + Math.random() * 200;
      starPositions[i] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i + 2] = r * Math.cos(phi);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 });
    scene.add(new THREE.Points(starGeometry, starMaterial));

    // ─── Lighting ───
    const sunLight = new THREE.DirectionalLight(0xffffff, 3);
    sunLight.position.set(50, 30, 50);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const rimLight = new THREE.DirectionalLight(0x4488ff, 0.5);
    rimLight.position.set(-30, -10, -30);
    scene.add(rimLight);

    // ─── Earth ───
    // Fallback procedural sphere (shown until GLB loads)
    const earthGeometry = new THREE.SphereGeometry(earthRadius, 64, 64);
    const earthMaterial = new THREE.MeshPhongMaterial({
      color: 0x2563eb,
      emissive: 0x0d1f4d,
    });
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earth);

    // Load NASA Earth GLB model
    // Use a pivot group so centering offset doesn't cause drift on rotation
    const earthPivot = new THREE.Group();
    scene.add(earthPivot);
    let earthModelLoaded = false;
    const loader = new GLTFLoader();
    loader.load(
      '/earth_by_nasa.glb',
      (gltf: any) => {
        const model = gltf.scene;

        // Find the centroid of all geometry, then measure the true max vertex
        // distance from that centroid to get the actual earth surface radius.
        // The bounding sphere overestimates because the model is offset in Z.
        const box = new THREE.Box3().setFromObject(model);
        const modelCenter = new THREE.Vector3();
        box.getCenter(modelCenter);

        // Compute actual radius: max distance from center to any vertex
        let maxDist = 0;
        model.traverse((child: any) => {
          if (child.isMesh) {
            const posAttr = child.geometry.attributes.position;
            const vertex = new THREE.Vector3();
            for (let i = 0; i < posAttr.count; i++) {
              vertex.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
              child.localToWorld(vertex);
              const dist = vertex.distanceTo(modelCenter);
              if (dist > maxDist) maxDist = dist;
            }
          }
        });

        console.log(`Model center: (${modelCenter.x.toFixed(2)}, ${modelCenter.y.toFixed(2)}, ${modelCenter.z.toFixed(2)})`);
        console.log(`Actual earth radius (max vertex dist): ${maxDist.toFixed(2)}`);
        console.log(`Desired earthRadius: ${earthRadius}`);

        // Scale so the model's actual radius matches our desired earthRadius
        const scaleFactor = earthRadius / maxDist;
        model.scale.setScalar(scaleFactor);
        console.log(`Scale factor: ${scaleFactor.toFixed(4)}`);

        // Center the model at origin
        const offset = modelCenter.multiplyScalar(scaleFactor);
        model.position.set(-offset.x, -offset.y, -offset.z);

        // Fix materials - ensure textures render with correct color space
        model.traverse((child: any) => {
          if (child.isMesh && child.material) {
            if (child.material.map) {
              child.material.map.colorSpace = THREE.SRGBColorSpace;
            }
            child.material.needsUpdate = true;
          }
        });

        earthPivot.add(model);
        earthModelLoaded = true;
        // Hide fallback sphere
        earth.visible = false;
      },
      undefined,
      (err: any) => {
        console.warn('Earth GLB failed to load:', err);
      }
    );

    // ─── Asteroid ───
    const asteroidGeometry = new THREE.IcosahedronGeometry(asteroidRadius, 2);
    // Deform vertices for rocky look
    const pos = asteroidGeometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vertex = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      vertex.multiplyScalar(1 + (Math.random() - 0.5) * 0.3);
      pos.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    asteroidGeometry.computeVertexNormals();

    const asteroidMaterial = new THREE.MeshPhongMaterial({
      color: 0x8b7355,
      emissive: 0x2a1f14,
      flatShading: true,
    });
    const asteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial);
    const asteroidStartY = earthRadius + 20;
    asteroid.position.set(0, asteroidStartY, 0);
    scene.add(asteroid);

    // ─── Fire Trail (particle system) ───
    const trailCount = 200;
    const trailPositions = new Float32Array(trailCount * 3);
    const trailColors = new Float32Array(trailCount * 3);
    const trailSizes = new Float32Array(trailCount);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    trailGeometry.setAttribute('size', new THREE.BufferAttribute(trailSizes, 1));
    const trailMaterial = new THREE.PointsMaterial({
      size: 0.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const trailParticles = new THREE.Points(trailGeometry, trailMaterial);
    scene.add(trailParticles);

    // Trail particle state
    const trailData: { x: number; y: number; z: number; life: number; vx: number; vy: number; vz: number }[] = [];
    for (let i = 0; i < trailCount; i++) {
      trailData.push({ x: 0, y: asteroidStartY, z: 0, life: 0, vx: 0, vy: 0, vz: 0 });
    }

    // ─── Impact Effects (hidden until impact) ───

    // Flash
    const flashGeometry = new THREE.SphereGeometry(asteroidRadius * 4, 16, 16);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.set(0, earthRadius, 0);
    flash.visible = false;
    scene.add(flash);

    // Shockwave ring
    const shockwaveGeometry = new THREE.TorusGeometry(asteroidRadius * 2, 0.3, 8, 64);
    const shockwaveMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    const shockwave = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial);
    shockwave.rotation.x = Math.PI / 2;
    shockwave.position.set(0, earthRadius + 0.5, 0);
    shockwave.visible = false;
    scene.add(shockwave);

    // ─── Realistic Crater ───
    const craterGroup = new THREE.Group();
    craterGroup.position.set(0, earthRadius, 0);
    craterGroup.visible = false;
    scene.add(craterGroup);

    const craterOuterR = asteroidRadius * 3.5;
    const craterInnerR = asteroidRadius * 2;
    const craterDepth = asteroidRadius * 1.2;
    const craterSegments = 48;

    // 1) Concave bowl — sphere segment pushed inward with vertex colors
    const bowlGeo = new THREE.SphereGeometry(craterInnerR, craterSegments, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const bowlPos = bowlGeo.attributes.position;
    const bowlColors = new Float32Array(bowlPos.count * 3);
    for (let i = 0; i < bowlPos.count; i++) {
      const x = bowlPos.getX(i);
      const y = bowlPos.getY(i);
      const z = bowlPos.getZ(i);
      // Flatten into a dish shape and invert
      const r = Math.sqrt(x * x + z * z) / craterInnerR;
      const depthFactor = (1 - r * r) * craterDepth;
      bowlPos.setY(i, y * 0.3 - depthFactor);
      // Vertex colors: molten orange center → charred dark at edges
      const t = Math.min(r, 1);
      bowlColors[i * 3] = 1.0 * (1 - t) + 0.1 * t;       // R
      bowlColors[i * 3 + 1] = 0.4 * (1 - t) + 0.05 * t;   // G
      bowlColors[i * 3 + 2] = 0.0 * (1 - t) + 0.02 * t;   // B
    }
    bowlGeo.setAttribute('color', new THREE.BufferAttribute(bowlColors, 3));
    bowlGeo.computeVertexNormals();
    const bowlMat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      emissive: 0xff4400,
      emissiveIntensity: 0.8,
      side: THREE.DoubleSide,
      shininess: 10,
    });
    const bowlMesh = new THREE.Mesh(bowlGeo, bowlMat);
    craterGroup.add(bowlMesh);

    // 2) Raised rim — torus ring around crater edge
    const rimGeo = new THREE.TorusGeometry(craterInnerR * 1.05, asteroidRadius * 0.25, 12, craterSegments);
    const rimColors = new Float32Array(rimGeo.attributes.position.count * 3);
    for (let i = 0; i < rimGeo.attributes.position.count; i++) {
      const y = rimGeo.attributes.position.getY(i);
      const t = (y + asteroidRadius * 0.25) / (asteroidRadius * 0.5);
      rimColors[i * 3] = 0.3 + 0.2 * t;
      rimColors[i * 3 + 1] = 0.15 + 0.1 * t;
      rimColors[i * 3 + 2] = 0.05;
    }
    rimGeo.setAttribute('color', new THREE.BufferAttribute(rimColors, 3));
    const rimMat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      emissive: 0x221100,
      emissiveIntensity: 0.3,
      flatShading: true,
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.rotation.x = -Math.PI / 2;
    rimMesh.position.y = asteroidRadius * 0.1;
    craterGroup.add(rimMesh);

    // 3) Glowing molten center — small bright sphere at the bottom of the bowl
    const glowGeo = new THREE.SphereGeometry(asteroidRadius * 0.6, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.position.y = -craterDepth * 0.6;
    craterGroup.add(glowMesh);

    // 4) Scorched ground ring — larger dark ring around the crater
    const scorchGeo = new THREE.RingGeometry(craterInnerR * 1.1, craterOuterR, craterSegments);
    const scorchPos = scorchGeo.attributes.position;
    const scorchColors = new Float32Array(scorchPos.count * 3);
    for (let i = 0; i < scorchPos.count; i++) {
      const x = scorchPos.getX(i);
      const z = scorchPos.getZ(i);
      const dist = Math.sqrt(x * x + z * z);
      const t = (dist - craterInnerR * 1.1) / (craterOuterR - craterInnerR * 1.1);
      // Dark charred near crater → fading to transparent at edges
      scorchColors[i * 3] = 0.08 + 0.05 * t;
      scorchColors[i * 3 + 1] = 0.04 + 0.03 * t;
      scorchColors[i * 3 + 2] = 0.02 + 0.01 * t;
    }
    scorchGeo.setAttribute('color', new THREE.BufferAttribute(scorchColors, 3));
    const scorchMat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      emissive: 0x110500,
      emissiveIntensity: 0.2,
    });
    const scorchMesh = new THREE.Mesh(scorchGeo, scorchMat);
    scorchMesh.rotation.x = -Math.PI / 2;
    scorchMesh.position.y = 0.05;
    craterGroup.add(scorchMesh);

    // Debris particles
    const debrisCount = 80;
    const debrisParticles: { mesh: THREE.Mesh; vx: number; vy: number; vz: number }[] = [];
    const createDebris = () => {
      for (let i = 0; i < debrisCount; i++) {
        const size = Math.random() * 0.3 + 0.1;
        const geo = new THREE.IcosahedronGeometry(size, 0);
        const mat = new THREE.MeshPhongMaterial({
          color: Math.random() > 0.5 ? 0x8b7355 : 0x555555,
          flatShading: true,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, earthRadius + 1, 0);
        scene.add(mesh);
        debrisParticles.push({
          mesh,
          vx: (Math.random() - 0.5) * 0.8,
          vy: Math.random() * 0.6 + 0.2,
          vz: (Math.random() - 0.5) * 0.8,
        });
      }
    };

    // ─── Animation Loop ───
    const startTime = Date.now();
    // Speed: asteroid must travel from start to earth surface within fallDuration
    const travelDistance = asteroidStartY - (earthRadius + asteroidRadius);
    const speed = travelDistance / fallDuration; // units per ms
    let impactTriggered = false;
    let impactTime = 0;
    const impactCamPos = new THREE.Vector3();
    const impactCamTarget = new THREE.Vector3();
    let trailSpawnIndex = 0;

    const animate = () => {
      requestAnimationFrame(animate);

      const elapsed = Date.now() - startTime;

      // Update OrbitControls
      controls.update();

      // Slowly rotate Earth (rotate pivot so centered model spins in place)
      const activeEarth = earthModelLoaded ? earthPivot : earth;
      activeEarth.rotation.y += 0.002;

      // ─── Pre-impact: asteroid falling ───
      if (!impactTriggered) {
        // Move asteroid down at constant speed until collision
        asteroid.position.y = asteroidStartY - speed * elapsed;

        // Rotate asteroid
        asteroid.rotation.x += 0.02;
        asteroid.rotation.y += 0.03;

        // Spawn fire trail particles (start after 5% of fall duration)
        if (elapsed > fallDuration * 0.05) {
          for (let j = 0; j < 3; j++) {
            const p = trailData[trailSpawnIndex % trailCount];
            p.x = asteroid.position.x + (Math.random() - 0.5) * asteroidRadius;
            p.y = asteroid.position.y + asteroidRadius;
            p.z = asteroid.position.z + (Math.random() - 0.5) * asteroidRadius;
            p.vx = (Math.random() - 0.5) * 0.1;
            p.vy = Math.random() * 0.15 + 0.05;
            p.vz = (Math.random() - 0.5) * 0.1;
            p.life = 1.0;
            trailSpawnIndex++;
          }
        }

        // Update trail particles
        const tPos = trailGeometry.attributes.position.array as Float32Array;
        const tCol = trailGeometry.attributes.color.array as Float32Array;
        for (let i = 0; i < trailCount; i++) {
          const p = trailData[i];
          if (p.life > 0) {
            p.x += p.vx;
            p.y += p.vy;
            p.z += p.vz;
            p.life -= 0.02;
          }
          tPos[i * 3] = p.x;
          tPos[i * 3 + 1] = p.y;
          tPos[i * 3 + 2] = p.z;
          // Orange → red fade
          tCol[i * 3] = 1.0;
          tCol[i * 3 + 1] = Math.max(0, p.life * 0.6);
          tCol[i * 3 + 2] = 0;
        }
        trailGeometry.attributes.position.needsUpdate = true;
        trailGeometry.attributes.color.needsUpdate = true;
      }

      // ─── Impact: trigger when asteroid surface touches Earth surface ───
      if (!impactTriggered && asteroid.position.y <= earthRadius) {
        impactTriggered = true;
        impactTime = elapsed;

        // Save camera state for zoom animation
        impactCamPos.copy(camera.position);
        impactCamTarget.copy(controls.target);

        // Hide asteroid and trail
        asteroid.visible = false;
        trailParticles.visible = false;

        // Show impact effects
        flash.visible = true;
        flashMaterial.opacity = 1.0;
        shockwave.visible = true;
        shockwaveMaterial.opacity = 0.8;
        craterGroup.visible = true;

        // Create debris
        createDebris();
      }

      // ─── Post-impact animation ───
      if (impactTriggered) {
        const impactElapsed = elapsed - impactTime;
        const impactProgress = Math.min(impactElapsed / 3000, 1); // 3 second post-impact

        // Flash fades out
        flashMaterial.opacity = Math.max(0, 1 - impactProgress * 3);
        flash.scale.setScalar(1 + impactProgress * 2);

        // Shockwave expands
        shockwave.scale.setScalar(1 + impactProgress * 8);
        shockwaveMaterial.opacity = Math.max(0, 0.8 - impactProgress);

        // Crater glow cools down over time
        const glowFade = Math.max(0, 1 - impactProgress * 0.7);
        bowlMat.emissiveIntensity = 0.8 * glowFade;
        glowMat.opacity = glowFade;
        glowMesh.scale.setScalar(1 + impactProgress * 0.3);
        scorchMat.opacity = 0.9 - impactProgress * 0.3;

        // Debris flies outward
        debrisParticles.forEach((d) => {
          d.mesh.position.x += d.vx;
          d.mesh.position.y += d.vy;
          d.mesh.position.z += d.vz;
          d.vy -= 0.005; // gravity pulls debris back
          d.mesh.rotation.x += 0.05;
          d.mesh.rotation.z += 0.03;
        });

        // Camera zoom toward crater (starts after 1s, takes 2s to complete)
        const zoomDelay = 1000;
        const zoomDuration = 2000;
        if (impactElapsed > zoomDelay) {
          const zoomT = Math.min((impactElapsed - zoomDelay) / zoomDuration, 1);
          // Ease-out for smooth deceleration
          const ease = 1 - Math.pow(1 - zoomT, 3);

          // Target: looking down at the crater from above and slightly to the side
          const craterPos = new THREE.Vector3(0, earthRadius, 0);
          const zoomCamPos = new THREE.Vector3(3, earthRadius + 8, 10);

          // Disable orbit controls during zoom
          controls.enabled = false;

          // Lerp camera position and look target toward crater
          camera.position.lerpVectors(impactCamPos, zoomCamPos, ease);
          controls.target.lerpVectors(impactCamTarget, craterPos, ease);
          camera.lookAt(controls.target);
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // ─── Resize ───
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // ─── Cleanup ───
    return () => {
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [asteroidDiameter, fallDuration]);

  return <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />;
}
