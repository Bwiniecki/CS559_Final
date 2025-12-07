import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================================
// GAME CONFIGURATION
// ============================================================================
const CONFIG = {
    // Player settings
    playerSpeed: 0.22,
    playerBounds: 14,
    playerZ: 5,
    
    // Bullet settings
    bulletSpeed: 0.6,
    bulletRadius: 0.2,
    bulletColor: 0xff6600,
    shootCooldown: 238, // milliseconds (5% faster)
    
    // Alien grid settings
    alienBaseCount: 12, // Starting number of aliens
    alienSpacingX: 4,
    alienSpacingZ: 5,
    alienStartZ: -25,
    alienStartY: 0,
    alienSpeed: 0.054, // Speed aliens move toward player
    alienRandomOffset: 1.5, // Random position offset for uneven look
    alienHitDistance: 1.5, // How close alien needs to be to hit player
    alienHitRadius: 1.8, // Radius for bullet collision detection
    aliensPerWaveMin: 1, // Min extra aliens per wave
    aliensPerWaveMax: 1, // Max extra aliens per wave (always 1)
    
    // Player lives
    maxLives: 5,
    
    // Scoring
    pointsPerAlien: 100,
    
    // Starfield
    starCount: 2000,
    starFieldRadius: 100
};

// ============================================================================
// GAME STATE
// ============================================================================
let scene, camera, renderer;
let playerShip = null;
let aliens = [];
let bullets = [];
let shootingStars = [];
let score = 0;
let wave = 1;
let lives = 5;
let lastShootTime = 0;
let waveTransitioning = false;
let gameOver = false;
let gameStarted = false;

// Game mode: 'prototype' or 'full'
let gameMode = 'prototype';

// Laser state
let laserAvailable = false;
let laserActive = false;
let laserBeam = null;
let laserLastUsedWave = 0; // Track when laser was last used
const LASER_INTERVAL = 5; // Available every 5 waves
const LASER_DURATION = 1500; // 1.5 seconds

// Input state
const keys = {
    left: false,
    right: false,
    shoot: false,
    laser: false
};

// Loaders
const gltfLoader = new GLTFLoader();

// Model templates (loaded once, cloned for instances)
let alienModel = null;
let chargerAlienModel = null;

// ============================================================================
// INITIALIZATION
// ============================================================================
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011);
    
    // Create camera - positioned behind and above the player
    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 8, 12);
    camera.lookAt(0, 0, -5);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-container').appendChild(renderer.domElement);
    
    // Setup lighting
    setupLighting();
    
    // Create starfield background
    createStarfield();
    
    // Load models and start game
    loadModels();
    
    // Setup input handlers
    setupInputHandlers();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

// ============================================================================
// LIGHTING SETUP
// ============================================================================
function setupLighting() {
    // Ambient light for overall visibility
    const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambientLight);
    
    // Main directional light (sun-like)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    
    // Accent light from below (space glow effect)
    const bottomLight = new THREE.DirectionalLight(0x4444ff, 0.3);
    bottomLight.position.set(0, -5, 0);
    scene.add(bottomLight);
    
    // Point light following player (will be updated in game loop)
    const playerLight = new THREE.PointLight(0x00ff88, 0.5, 10);
    playerLight.position.set(0, 2, 5);
    scene.add(playerLight);
}

// ============================================================================
// STARFIELD BACKGROUND
// ============================================================================
function createStarfield() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(CONFIG.starCount * 3);
    const colors = new Float32Array(CONFIG.starCount * 3);
    
    for (let i = 0; i < CONFIG.starCount; i++) {
        // Random position on a sphere
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const radius = CONFIG.starFieldRadius + Math.random() * 50;
        
        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = radius * Math.cos(phi);
        
        // Varying star colors (white to blue-ish)
        const colorVariation = Math.random();
        colors[i * 3] = 0.8 + colorVariation * 0.2;
        colors[i * 3 + 1] = 0.8 + colorVariation * 0.2;
        colors[i * 3 + 2] = 1.0;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.PointsMaterial({
        size: 0.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true
    });
    
    const starfield = new THREE.Points(geometry, material);
    scene.add(starfield);
    
    // Start spawning shooting stars
    spawnShootingStar();
    setInterval(spawnShootingStar, 2000 + Math.random() * 3000); // Spawn every 2-5 seconds
}

// ============================================================================
// SHOOTING STARS
// ============================================================================
function spawnShootingStar() {
    // Shooting stars appear even on start screen for ambiance
    
    // Start from left or right side of screen
    const startFromLeft = Math.random() > 0.5;
    const startX = startFromLeft ? -25 : 25;
    const startY = 5 + Math.random() * 8; // Random height
    const startZ = -15 - Math.random() * 10; // Behind camera
    
    // Speed and angle for horizontal movement
    const speed = 0.4 + Math.random() * 0.3;
    const slantAngle = -0.3 - Math.random() * 0.2; // Downward slant (negative Y)
    
    // Create shooting star with trail
    const starGroup = new THREE.Group();
    
    // Main bright star
    const starGeometry = new THREE.SphereGeometry(0.15, 6, 6);
    const starMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 2
    });
    const star = new THREE.Mesh(starGeometry, starMaterial);
    starGroup.add(star);
    
    // Trail - long glowing line (horizontal/slanted)
    const trailLength = 4;
    const trailGeometry = new THREE.CylinderGeometry(0.02, 0.05, trailLength, 6);
    const trailMaterial = new THREE.MeshBasicMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.7,
        emissive: 0x88ccff
    });
    const trail = new THREE.Mesh(trailGeometry, trailMaterial);
    // Rotate trail to follow horizontal movement direction
    // Trail extends behind the star in the direction it came from
    trail.rotation.y = Math.PI / 2; // Horizontal
    trail.rotation.x = -slantAngle; // Match the downward slant
    trail.position.x = startFromLeft ? -trailLength / 2 : trailLength / 2;
    trail.position.y = trailLength * Math.sin(slantAngle) * 0.2;
    starGroup.add(trail);
    
    // Outer glow
    const glowGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.3,
        emissive: 0x88ccff
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    starGroup.add(glow);
    
    starGroup.position.set(startX, startY, startZ);
    
    // Calculate velocity - primarily horizontal with slight downward slant
    const horizontalDir = startFromLeft ? 1 : -1; // Left to right or right to left
    const velocity = new THREE.Vector3(
        horizontalDir * speed, // Main horizontal movement
        slantAngle * speed,     // Slight downward slant
        speed * 0.1             // Minimal forward movement
    );
    
    scene.add(starGroup);
    
    shootingStars.push({
        mesh: starGroup,
        velocity: velocity,
        life: 1.0
    });
}

function updateShootingStars() {
    for (let i = shootingStars.length - 1; i >= 0; i--) {
        const shootingStar = shootingStars[i];
        const mesh = shootingStar.mesh;
        
        // Move shooting star
        mesh.position.add(shootingStar.velocity);
        
        // Fade out over time
        shootingStar.life -= 0.01;
        mesh.children.forEach((child) => {
            if (child.material) {
                child.material.opacity *= 0.99;
            }
        });
        
        // Remove if off screen or faded out
        if (mesh.position.y < -10 || 
            mesh.position.z > 20 || 
            shootingStar.life <= 0 ||
            Math.abs(mesh.position.x) > 30) { // Off screen horizontally
            scene.remove(mesh);
            shootingStars.splice(i, 1);
        }
    }
}

// ============================================================================
// MODEL LOADING
// ============================================================================
function loadModels() {
    if (gameMode === 'prototype') {
        // PROTOTYPE MODE: Use only primitive geometries
        createPlaceholderShip();
        createFallbackAlien();
        createChargerAlien();
    } else {
        // FULL MODE: Load GLB models
        let modelsLoaded = 0;
        const totalModels = 2;
        
        function onModelLoaded() {
            modelsLoaded++;
            if (modelsLoaded === totalModels) {
                // All models loaded
                setupStartButton();
                animate();
                return;
            }
        }
        
        // Load ship model
        gltfLoader.load(
            'models/ship.glb',
            (gltf) => {
                playerShip = gltf.scene;
                playerShip.position.set(0, 0, CONFIG.playerZ);
                playerShip.scale.set(1, 1, 1);
                playerShip.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                scene.add(playerShip);
                onModelLoaded();
            },
            undefined,
            (error) => {
                console.error('Error loading ship model:', error);
                // Fallback to placeholder if model fails
                createPlaceholderShip();
                onModelLoaded();
            }
        );
        
        // Load alien model
        gltfLoader.load(
            'models/Alien.glb',
            (gltf) => {
                alienModel = gltf.scene;
                alienModel.scale.set(1, 1, 1);
                // Create charger alien (always use primitive for charger)
                createChargerAlien();
                onModelLoaded();
            },
            undefined,
            (error) => {
                console.error('Error loading alien model:', error);
                // Fallback to placeholder if model fails
                createFallbackAlien();
                createChargerAlien(); // Use charger as fallback too
                onModelLoaded();
            }
        );
        
        return; // Don't continue with prototype setup
    }
    
    // Setup start button (for prototype mode)
    setupStartButton();
    
    // Start render loop (but game doesn't start until button clicked)
    animate();
}

function switchGameMode(mode) {
    if (gameMode === mode) return;
    
    gameMode = mode;
    
    // Clear current game state
    if (playerShip) {
        scene.remove(playerShip);
        playerShip = null;
    }
    aliens.forEach(alien => scene.remove(alien.mesh));
    aliens = [];
    bullets.forEach(bullet => scene.remove(bullet));
    bullets = [];
    if (laserBeam) {
        scene.remove(laserBeam);
        laserBeam = null;
    }
    
    // Reset game state
    score = 0;
    wave = 1;
    lives = CONFIG.maxLives;
    gameOver = false;
    gameStarted = false;
    laserAvailable = false;
    laserActive = false;
    laserLastUsedWave = 0;
    
    // Reload models in new mode
    loadModels();
    
    // Update UI
    updateScoreDisplay();
    updateWaveDisplay();
    updateLivesDisplay();
    updateLaserDisplay();
    document.getElementById('game-over').classList.remove('visible');
    document.getElementById('start-screen').classList.remove('hidden');
    
    // Update button states
    document.getElementById('prototype-btn').classList.toggle('active', mode === 'prototype');
    document.getElementById('full-btn').classList.toggle('active', mode === 'full');
}

// Placeholder ship geometry
function createPlaceholderShip() {
    playerShip = new THREE.Group();
    
    // Main body - sleek fuselage
    const bodyGeometry = new THREE.ConeGeometry(0.4, 2, 6);
    const bodyMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x2288ff,
        emissive: 0x112244,
        shininess: 100
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.x = Math.PI / 2;
    playerShip.add(body);
    
    // Cockpit
    const cockpitGeometry = new THREE.SphereGeometry(0.25, 8, 6);
    const cockpitMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x00ffff,
        emissive: 0x004444,
        transparent: true,
        opacity: 0.8
    });
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpit.position.set(0, 0.15, 0.3);
    cockpit.scale.set(1, 0.6, 1);
    playerShip.add(cockpit);
    
    // Left wing
    const wingGeometry = new THREE.BoxGeometry(1.5, 0.08, 0.6);
    const wingMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x1166dd,
        emissive: 0x0a2244
    });
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
    leftWing.position.set(-0.6, 0, 0.2);
    leftWing.rotation.z = -0.15;
    playerShip.add(leftWing);
    
    // Right wing
    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
    rightWing.position.set(0.6, 0, 0.2);
    rightWing.rotation.z = 0.15;
    playerShip.add(rightWing);
    
    // Engine glow left
    const engineGeometry = new THREE.CylinderGeometry(0.1, 0.15, 0.3, 8);
    const engineMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff4400
    });
    const leftEngine = new THREE.Mesh(engineGeometry, engineMaterial);
    leftEngine.position.set(-0.3, 0, 0.9);
    leftEngine.rotation.x = Math.PI / 2;
    playerShip.add(leftEngine);
    
    // Engine glow right
    const rightEngine = new THREE.Mesh(engineGeometry, engineMaterial);
    rightEngine.position.set(0.3, 0, 0.9);
    rightEngine.rotation.x = Math.PI / 2;
    playerShip.add(rightEngine);
    
    // Enable shadows
    playerShip.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    
    playerShip.position.set(0, 0, CONFIG.playerZ);
    scene.add(playerShip);
}

function createFallbackAlien() {
    alienModel = new THREE.Group();
    
    // Color palette - eerie green alien aesthetic
    const bodyColor = 0x44dd66;
    const bodyEmissive = 0x115522;
    const eyeColor = 0xff0044;
    const eyeEmissive = 0x660022;
    const darkColor = 0x227744;
    
    // Main body - bulbous head/torso
    const bodyGeometry = new THREE.SphereGeometry(0.6, 12, 10);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        emissive: bodyEmissive,
        roughness: 0.5,
        metalness: 0.2
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.scale.set(1, 0.8, 0.7);
    alienModel.add(body);
    
    // Forehead ridge / cranium bump
    const craniumGeometry = new THREE.SphereGeometry(0.4, 10, 8);
    const craniumMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        emissive: bodyEmissive,
        roughness: 0.5,
        metalness: 0.2
    });
    const cranium = new THREE.Mesh(craniumGeometry, craniumMaterial);
    cranium.position.set(0, 0.35, 0);
    cranium.scale.set(1.2, 0.6, 0.8);
    alienModel.add(cranium);
    
    // Left eye - large menacing
    const eyeGeometry = new THREE.SphereGeometry(0.18, 10, 10);
    const eyeMaterial = new THREE.MeshStandardMaterial({
        color: eyeColor,
        emissive: eyeEmissive,
        emissiveIntensity: 2,
        roughness: 0.3
    });
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.25, 0.1, 0.45);
    alienModel.add(leftEye);
    
    // Right eye
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial.clone());
    rightEye.position.set(0.25, 0.1, 0.45);
    alienModel.add(rightEye);
    
    // Eye pupils - dark centers
    const pupilGeometry = new THREE.SphereGeometry(0.08, 8, 8);
    const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    leftPupil.position.set(-0.25, 0.1, 0.55);
    alienModel.add(leftPupil);
    
    const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial.clone());
    rightPupil.position.set(0.25, 0.1, 0.55);
    alienModel.add(rightPupil);
    
    // Mouth - sinister slit
    const mouthGeometry = new THREE.BoxGeometry(0.3, 0.05, 0.1);
    const mouthMaterial = new THREE.MeshBasicMaterial({ color: 0x001100 });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.set(0, -0.2, 0.5);
    alienModel.add(mouth);
    
    // Left tentacle/arm
    const tentacleMaterial = new THREE.MeshStandardMaterial({
        color: darkColor,
        emissive: 0x0a2211,
        roughness: 0.6
    });
    
    const tentacleGeometry = new THREE.CylinderGeometry(0.08, 0.12, 0.6, 8);
    const leftTentacle = new THREE.Mesh(tentacleGeometry, tentacleMaterial);
    leftTentacle.position.set(-0.55, -0.25, 0);
    leftTentacle.rotation.z = 0.5;
    alienModel.add(leftTentacle);
    
    // Left tentacle claw
    const clawGeometry = new THREE.ConeGeometry(0.1, 0.25, 6);
    const leftClaw = new THREE.Mesh(clawGeometry, tentacleMaterial.clone());
    leftClaw.position.set(-0.75, -0.5, 0);
    leftClaw.rotation.z = 0.8;
    alienModel.add(leftClaw);
    
    // Right tentacle/arm
    const rightTentacle = new THREE.Mesh(tentacleGeometry, tentacleMaterial.clone());
    rightTentacle.position.set(0.55, -0.25, 0);
    rightTentacle.rotation.z = -0.5;
    alienModel.add(rightTentacle);
    
    // Right tentacle claw
    const rightClaw = new THREE.Mesh(clawGeometry, tentacleMaterial.clone());
    rightClaw.position.set(0.75, -0.5, 0);
    rightClaw.rotation.z = -0.8;
    alienModel.add(rightClaw);
    
    // Lower tentacles (dangling)
    const lowerTentacleGeometry = new THREE.CylinderGeometry(0.05, 0.08, 0.5, 6);
    
    const lowerLeft = new THREE.Mesh(lowerTentacleGeometry, tentacleMaterial.clone());
    lowerLeft.position.set(-0.25, -0.6, 0);
    lowerLeft.rotation.z = 0.2;
    alienModel.add(lowerLeft);
    
    const lowerRight = new THREE.Mesh(lowerTentacleGeometry, tentacleMaterial.clone());
    lowerRight.position.set(0.25, -0.6, 0);
    lowerRight.rotation.z = -0.2;
    alienModel.add(lowerRight);
    
    const lowerCenter = new THREE.Mesh(lowerTentacleGeometry, tentacleMaterial.clone());
    lowerCenter.position.set(0, -0.65, 0.1);
    alienModel.add(lowerCenter);
    
    // Antennae
    const antennaGeometry = new THREE.CylinderGeometry(0.02, 0.03, 0.4, 6);
    const antennaMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        emissive: bodyEmissive
    });
    
    const leftAntenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
    leftAntenna.position.set(-0.2, 0.65, 0);
    leftAntenna.rotation.z = 0.3;
    alienModel.add(leftAntenna);
    
    const rightAntenna = new THREE.Mesh(antennaGeometry, antennaMaterial.clone());
    rightAntenna.position.set(0.2, 0.65, 0);
    rightAntenna.rotation.z = -0.3;
    alienModel.add(rightAntenna);
    
    // Antenna tips - glowing orbs
    const antennaTipGeometry = new THREE.SphereGeometry(0.06, 8, 8);
    const antennaTipMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00
    });
    
    const leftTip = new THREE.Mesh(antennaTipGeometry, antennaTipMaterial);
    leftTip.position.set(-0.32, 0.82, 0);
    alienModel.add(leftTip);
    
    const rightTip = new THREE.Mesh(antennaTipGeometry, antennaTipMaterial.clone());
    rightTip.position.set(0.32, 0.82, 0);
    alienModel.add(rightTip);
    
    // Scale the whole alien
    alienModel.scale.set(1.2, 1.2, 1.2);
}

// Charger alien - red, angry, bigger, needs 2 hits
function createChargerAlien() {
    chargerAlienModel = new THREE.Group();
    
    // Color palette - angry red/purple
    const bodyColor = 0xcc2244;
    const bodyEmissive = 0x441122;
    const eyeColor = 0xffff00;
    const eyeEmissive = 0x666600;
    const darkColor = 0x881133;
    
    // Main body - bigger and more menacing
    const bodyGeometry = new THREE.SphereGeometry(0.75, 12, 10);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        emissive: bodyEmissive,
        roughness: 0.4,
        metalness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.scale.set(1.1, 0.9, 0.8);
    chargerAlienModel.add(body);
    
    // Armored head ridge
    const craniumGeometry = new THREE.SphereGeometry(0.5, 10, 8);
    const craniumMaterial = new THREE.MeshStandardMaterial({
        color: 0x661122,
        emissive: 0x220808,
        roughness: 0.3,
        metalness: 0.5
    });
    const cranium = new THREE.Mesh(craniumGeometry, craniumMaterial);
    cranium.position.set(0, 0.4, 0);
    cranium.scale.set(1.3, 0.5, 0.9);
    chargerAlienModel.add(cranium);
    
    // Angry eyes - yellow glowing
    const eyeGeometry = new THREE.SphereGeometry(0.22, 10, 10);
    const eyeMaterial = new THREE.MeshStandardMaterial({
        color: eyeColor,
        emissive: eyeEmissive,
        emissiveIntensity: 3,
        roughness: 0.2
    });
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.3, 0.15, 0.5);
    chargerAlienModel.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial.clone());
    rightEye.position.set(0.3, 0.15, 0.5);
    chargerAlienModel.add(rightEye);
    
    // Angry eyebrow ridges
    const browGeometry = new THREE.BoxGeometry(0.25, 0.08, 0.15);
    const browMaterial = new THREE.MeshStandardMaterial({ color: 0x440011 });
    const leftBrow = new THREE.Mesh(browGeometry, browMaterial);
    leftBrow.position.set(-0.3, 0.35, 0.5);
    leftBrow.rotation.z = 0.3;
    chargerAlienModel.add(leftBrow);
    
    const rightBrow = new THREE.Mesh(browGeometry, browMaterial.clone());
    rightBrow.position.set(0.3, 0.35, 0.5);
    rightBrow.rotation.z = -0.3;
    chargerAlienModel.add(rightBrow);
    
    // Snarling mouth
    const mouthGeometry = new THREE.BoxGeometry(0.4, 0.1, 0.15);
    const mouthMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.set(0, -0.25, 0.55);
    chargerAlienModel.add(mouth);
    
    // Teeth
    const toothGeometry = new THREE.ConeGeometry(0.04, 0.12, 4);
    const toothMaterial = new THREE.MeshBasicMaterial({ color: 0xffffcc });
    for (let i = 0; i < 5; i++) {
        const tooth = new THREE.Mesh(toothGeometry, toothMaterial.clone());
        tooth.position.set(-0.16 + i * 0.08, -0.22, 0.6);
        tooth.rotation.x = Math.PI;
        chargerAlienModel.add(tooth);
    }
    
    // Bigger claws
    const clawMaterial = new THREE.MeshStandardMaterial({
        color: darkColor,
        emissive: 0x220011,
        roughness: 0.5
    });
    
    const clawGeometry = new THREE.ConeGeometry(0.15, 0.5, 6);
    const leftClaw = new THREE.Mesh(clawGeometry, clawMaterial);
    leftClaw.position.set(-0.7, -0.3, 0.2);
    leftClaw.rotation.z = 0.8;
    leftClaw.rotation.x = -0.3;
    chargerAlienModel.add(leftClaw);
    
    const rightClaw = new THREE.Mesh(clawGeometry, clawMaterial.clone());
    rightClaw.position.set(0.7, -0.3, 0.2);
    rightClaw.rotation.z = -0.8;
    rightClaw.rotation.x = -0.3;
    chargerAlienModel.add(rightClaw);
    
    // Spiky horns
    const hornGeometry = new THREE.ConeGeometry(0.08, 0.4, 6);
    const hornMaterial = new THREE.MeshStandardMaterial({
        color: 0x331111,
        roughness: 0.3,
        metalness: 0.6
    });
    
    const leftHorn = new THREE.Mesh(hornGeometry, hornMaterial);
    leftHorn.position.set(-0.35, 0.7, 0);
    leftHorn.rotation.z = 0.4;
    chargerAlienModel.add(leftHorn);
    
    const rightHorn = new THREE.Mesh(hornGeometry, hornMaterial.clone());
    rightHorn.position.set(0.35, 0.7, 0);
    rightHorn.rotation.z = -0.4;
    chargerAlienModel.add(rightHorn);
    
    // Scale bigger than regular alien
    chargerAlienModel.scale.set(1.5, 1.5, 1.5);
}

// ============================================================================
// ALIEN GRID SPAWNING
// ============================================================================
function spawnAlienGrid() {
    // Check laser availability at start of new wave
    checkLaserAvailability();
    
    // Clear existing aliens
    aliens.forEach(alien => scene.remove(alien.mesh));
    aliens = [];
    
    // Calculate alien count for this wave (base + 1 extra per wave)
    const extraAliens = wave - 1; // Always add exactly 1 alien per wave
    const alienCount = CONFIG.alienBaseCount + extraAliens;
    
    // Calculate grid dimensions based on count
    const cols = Math.ceil(Math.sqrt(alienCount * 1.5)); // Wider than tall
    const rows = Math.ceil(alienCount / cols);
    
    const startX = -(cols - 1) * CONFIG.alienSpacingX / 2;
    const startZ = CONFIG.alienStartZ;
    
    let spawned = 0;
    
    for (let row = 0; row < rows && spawned < alienCount; row++) {
        for (let col = 0; col < cols && spawned < alienCount; col++) {
            const alienClone = alienModel.clone();
            
            // Clone materials so each alien has independent materials
            alienClone.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material = child.material.clone();
                }
            });
            
            // Base position
            const baseX = startX + col * CONFIG.alienSpacingX;
            const baseZ = startZ - row * CONFIG.alienSpacingZ;
            
            // Add random offset for uneven look
            const randomX = (Math.random() - 0.5) * CONFIG.alienRandomOffset * 2;
            const randomZ = (Math.random() - 0.5) * CONFIG.alienRandomOffset * 2;
            const randomY = (Math.random() - 0.5) * CONFIG.alienRandomOffset * 0.5;
            
            const x = baseX + randomX;
            const z = baseZ + randomZ;
            const y = CONFIG.alienStartY + randomY;
            
            alienClone.position.set(x, y, z);
            
            // Face forward (toward player)
            alienClone.rotation.y = 0;
            
            // Slight random scale variation
            const scaleVar = 0.9 + Math.random() * 0.2;
            alienClone.scale.multiplyScalar(scaleVar);
            
            // Enable shadows
            alienClone.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            scene.add(alienClone);
            
            // Create bounding box for collision detection
            const boundingBox = new THREE.Box3().setFromObject(alienClone);
            
            aliens.push({
                mesh: alienClone,
                boundingBox: boundingBox,
                alive: true,
                health: 1,
                type: 'normal',
                isCharging: false
            });
            
            spawned++;
        }
    }
    
    // Spawn charger aliens starting from wave 3
    // Wave 3: 1 charger, Wave 4: 1, Wave 5: 1, Wave 6: 2, Wave 7: 2, Wave 8: 2, Wave 9: 3, etc.
    if (wave >= 3 && chargerAlienModel) {
        const chargerCount = Math.floor((wave - 3) / 3) + 1;
        for (let i = 0; i < chargerCount; i++) {
            spawnChargerAlien(i);
        }
    }
}

function spawnChargerAlien(index = 0) {
    const chargerClone = chargerAlienModel.clone();
    
    // Clone materials so each charger has independent materials
    chargerClone.traverse((child) => {
        if (child.isMesh && child.material) {
            child.material = child.material.clone();
        }
    });
    
    // Spawn at spread X positions, far back
    const spreadX = (index - 0.5) * 6; // Spread chargers apart
    const x = spreadX + (Math.random() - 0.5) * 3;
    const z = CONFIG.alienStartZ - 8 - (index * 3);
    const y = CONFIG.alienStartY;
    
    chargerClone.position.set(x, y, z);
    chargerClone.rotation.y = 0;
    
    // Enable shadows
    chargerClone.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    
    scene.add(chargerClone);
    
    const boundingBox = new THREE.Box3().setFromObject(chargerClone);
    
    aliens.push({
        mesh: chargerClone,
        boundingBox: boundingBox,
        alive: true,
        health: 2,
        type: 'charger',
        isCharging: false,
        chargeSpeed: CONFIG.alienSpeed * 4 // 4x speed when charging
    });
}

// ============================================================================
// INPUT HANDLING
// ============================================================================
function setupInputHandlers() {
    document.addEventListener('keydown', (event) => {
        switch (event.code) {
            case 'ArrowLeft':
            case 'KeyA':
                keys.left = true;
                break;
            case 'ArrowRight':
            case 'KeyD':
                keys.right = true;
                break;
            case 'Space':
                event.preventDefault();
                keys.shoot = true;
                break;
            case 'KeyQ':
                event.preventDefault();
                keys.laser = true;
                break;
        }
    });
    
    document.addEventListener('keyup', (event) => {
        switch (event.code) {
            case 'ArrowLeft':
            case 'KeyA':
                keys.left = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                keys.right = false;
                break;
            case 'Space':
                keys.shoot = false;
                break;
            case 'KeyQ':
                keys.laser = false;
                break;
        }
    });
    
    // Mobile touch controls
    setupMobileControls();
    
    // Mode toggle buttons
    setupModeToggle();
}

function setupMobileControls() {
    const leftBtn = document.getElementById('left-btn');
    const rightBtn = document.getElementById('right-btn');
    const shootBtn = document.getElementById('shoot-btn');
    
    // Left button
    leftBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        keys.left = true;
    });
    leftBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        keys.left = false;
    });
    leftBtn.addEventListener('mousedown', () => keys.left = true);
    leftBtn.addEventListener('mouseup', () => keys.left = false);
    leftBtn.addEventListener('mouseleave', () => keys.left = false);
    
    // Right button
    rightBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        keys.right = true;
    });
    rightBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        keys.right = false;
    });
    rightBtn.addEventListener('mousedown', () => keys.right = true);
    rightBtn.addEventListener('mouseup', () => keys.right = false);
    rightBtn.addEventListener('mouseleave', () => keys.right = false);
    
    // Shoot button
    shootBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        keys.shoot = true;
    });
    shootBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        keys.shoot = false;
    });
    shootBtn.addEventListener('mousedown', () => keys.shoot = true);
    shootBtn.addEventListener('mouseup', () => keys.shoot = false);
    shootBtn.addEventListener('mouseleave', () => keys.shoot = false);
}

function setupModeToggle() {
    document.getElementById('prototype-btn').addEventListener('click', () => {
        switchGameMode('prototype');
    });
    
    document.getElementById('full-btn').addEventListener('click', () => {
        switchGameMode('full');
    });
}

// ============================================================================
// PLAYER MOVEMENT
// ============================================================================
function updatePlayer() {
    if (!playerShip) return;
    
    if (keys.left) {
        playerShip.position.x -= CONFIG.playerSpeed;
    }
    if (keys.right) {
        playerShip.position.x += CONFIG.playerSpeed;
    }
    
    // Constrain to bounds
    playerShip.position.x = Math.max(-CONFIG.playerBounds, Math.min(CONFIG.playerBounds, playerShip.position.x));
}

// ============================================================================
// SHOOTING SYSTEM
// ============================================================================
function shoot() {
    if (!playerShip) return;
    
    const now = Date.now();
    if (now - lastShootTime < CONFIG.shootCooldown) return;
    lastShootTime = now;
    
    // Create bullet
    const bulletGeometry = new THREE.SphereGeometry(CONFIG.bulletRadius, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({
        color: CONFIG.bulletColor,
        emissive: CONFIG.bulletColor
    });
    
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    bullet.position.copy(playerShip.position);
    bullet.position.y += 0.5;
    bullet.position.z -= 1;
    
    // Add glow effect
    const glowGeometry = new THREE.SphereGeometry(CONFIG.bulletRadius * 2, 8, 8);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: CONFIG.bulletColor,
        transparent: true,
        opacity: 0.3
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    bullet.add(glow);
    
    scene.add(bullet);
    bullets.push(bullet);
}

function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.position.z -= CONFIG.bulletSpeed;
        
        // Remove if off screen
        if (bullet.position.z < -30) {
            scene.remove(bullet);
            bullets.splice(i, 1);
        }
    }
}

// ============================================================================
// LASER SYSTEM
// ============================================================================
function checkLaserAvailability() {
    // Laser becomes available at wave 5, 10, 15, etc.
    // Only becomes available at exact intervals, and only if not used in current cycle
    if (!laserActive) {
        // Check if current wave is an exact interval (5, 10, 15, etc.)
        if (wave >= LASER_INTERVAL && wave % LASER_INTERVAL === 0) {
            // Calculate which cycle we're in (wave 5 = cycle 1, wave 10 = cycle 2, etc.)
            const currentCycle = wave / LASER_INTERVAL;
            
            // Calculate which cycle laser was last used in
            const lastUsedCycle = laserLastUsedWave > 0 ? laserLastUsedWave / LASER_INTERVAL : 0;
            
            // Only make available if we're in a NEW cycle (not used yet this cycle)
            // e.g., if used at wave 5 (cycle 1), only available again at wave 10 (cycle 2)
            if (currentCycle > lastUsedCycle) {
                laserAvailable = true;
                updateLaserDisplay();
            } else {
                laserAvailable = false;
                updateLaserDisplay();
            }
        } else {
            // Not at an interval wave, laser not available
            laserAvailable = false;
            updateLaserDisplay();
        }
    }
}

function updateLaserDisplay() {
    const laserDisplay = document.getElementById('laser-display');
    if (laserAvailable && !laserActive) {
        laserDisplay.classList.add('available');
        laserDisplay.classList.remove('charging');
        laserDisplay.textContent = '[Q] LASER READY ⚡';
    } else if (laserActive) {
        laserDisplay.classList.add('available');
        laserDisplay.classList.remove('charging');
        laserDisplay.textContent = '>>> FIRING LASER <<<';
    } else {
        laserDisplay.classList.remove('available');
        laserDisplay.classList.add('charging');
        const nextWave = (Math.floor(wave / LASER_INTERVAL) + 1) * LASER_INTERVAL;
        laserDisplay.textContent = `[Q] LASER (Wave ${nextWave})`;
    }
}

function fireLaser() {
    if (!laserAvailable || laserActive || !playerShip) return;
    
    laserAvailable = false;
    laserActive = true;
    laserLastUsedWave = wave;
    updateLaserDisplay();
    
    // Create laser beam
    const laserGeometry = new THREE.BoxGeometry(0.3, 0.3, 100);
    const laserMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.8
    });
    
    laserBeam = new THREE.Group();
    
    // Core beam
    const core = new THREE.Mesh(laserGeometry, laserMaterial);
    core.position.z = -50;
    laserBeam.add(core);
    
    // Outer glow
    const glowGeometry = new THREE.BoxGeometry(0.8, 0.8, 100);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.3
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.z = -50;
    laserBeam.add(glow);
    
    // Outer glow 2
    const glow2Geometry = new THREE.BoxGeometry(1.5, 1.5, 100);
    const glow2Material = new THREE.MeshBasicMaterial({
        color: 0x00aaff,
        transparent: true,
        opacity: 0.15
    });
    const glow2 = new THREE.Mesh(glow2Geometry, glow2Material);
    glow2.position.z = -50;
    laserBeam.add(glow2);
    
    laserBeam.position.copy(playerShip.position);
    laserBeam.position.y += 0.5;
    
    scene.add(laserBeam);
    
    // End laser after duration
    setTimeout(() => {
        endLaser();
    }, LASER_DURATION);
}

function updateLaser() {
    if (!laserActive || !laserBeam || !playerShip) return;
    
    // Follow player X position
    laserBeam.position.x = playerShip.position.x;
    
    // Pulsing effect
    const pulse = 0.8 + Math.sin(Date.now() * 0.01) * 0.2;
    laserBeam.children.forEach((child, i) => {
        if (child.material) {
            child.material.opacity = (i === 0 ? 0.8 : i === 1 ? 0.3 : 0.15) * pulse;
        }
    });
    
    // Check collision with all aliens
    checkLaserCollisions();
}

function checkLaserCollisions() {
    if (!laserBeam) return;
    
    const laserX = laserBeam.position.x;
    const laserHitWidth = 1.0; // How wide the laser hit area is
    
    for (let i = aliens.length - 1; i >= 0; i--) {
        const alien = aliens[i];
        if (!alien.alive) continue;
        
        const alienX = alien.mesh.position.x;
        
        // Check if alien is within laser's X range
        if (Math.abs(alienX - laserX) < laserHitWidth) {
            // Instant kill - reduce health to 0
            alien.health = 0;
            alien.alive = false;
            destroyAlien(alien, i);
            
            // Points
            const points = alien.type === 'charger' ? CONFIG.pointsPerAlien * 3 : CONFIG.pointsPerAlien;
            score += points;
            updateScoreDisplay();
        }
    }
}

function endLaser() {
    if (laserBeam) {
        scene.remove(laserBeam);
        laserBeam = null;
    }
    laserActive = false;
    updateLaserDisplay();
}

// ============================================================================
// COLLISION DETECTION
// ============================================================================
function checkCollisions() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        const bulletPos = bullet.position;
        
        for (let j = aliens.length - 1; j >= 0; j--) {
            const alien = aliens[j];
            if (!alien.alive) continue;
            
            const alienPos = alien.mesh.position;
            
            // 2D distance on XZ plane (ignore Y height difference)
            const dx = bulletPos.x - alienPos.x;
            const dz = bulletPos.z - alienPos.z;
            const distance2D = Math.sqrt(dx * dx + dz * dz);
            
            // Larger hitbox for chargers
            const hitRadius = alien.type === 'charger' ? CONFIG.alienHitRadius * 1.3 : CONFIG.alienHitRadius;
            
            if (distance2D < hitRadius) {
                // Hit! Remove bullet
                scene.remove(bullet);
                bullets.splice(i, 1);
                
                // Reduce health
                alien.health--;
                
                if (alien.health <= 0) {
                    // Alien destroyed
                    alien.alive = false;
                    destroyAlien(alien, j);
                    
                    // Chargers give more points
                    const points = alien.type === 'charger' ? CONFIG.pointsPerAlien * 3 : CONFIG.pointsPerAlien;
                    score += points;
                    updateScoreDisplay();
                } else {
                    // Alien damaged but not dead - make it angry and charge!
                    damageAlien(alien);
                }
                
                break;
            }
        }
    }
}

// Visual effect when alien is damaged but not killed
function damageAlien(alien) {
    // Flash white
    alien.mesh.traverse((child) => {
        if (child.isMesh && child.material) {
            const originalColor = child.material.color.clone();
            child.material.emissive = new THREE.Color(0xffffff);
            child.material.emissiveIntensity = 2;
            
            setTimeout(() => {
                child.material.emissive = new THREE.Color(0xff0000);
                child.material.emissiveIntensity = 1;
            }, 100);
        }
    });
    
    // If charger, start charging!
    if (alien.type === 'charger') {
        alien.isCharging = true;
    }
    
    // Create small hit particles
    createHitParticles(alien.mesh.position.clone());
}

function createHitParticles(position) {
    for (let i = 0; i < 8; i++) {
        const geometry = new THREE.SphereGeometry(0.08, 4, 4);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 1
        });
        
        const particle = new THREE.Mesh(geometry, material);
        particle.position.copy(position);
        
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2
        );
        
        scene.add(particle);
        
        let life = 1.0;
        function animateParticle() {
            life -= 0.1;
            particle.position.add(velocity);
            particle.material.opacity = life;
            
            if (life > 0) {
                requestAnimationFrame(animateParticle);
            } else {
                scene.remove(particle);
            }
        }
        animateParticle();
    }
}

// Animated alien destruction
function destroyAlien(alien, index) {
    const mesh = alien.mesh;
    const startScale = mesh.scale.clone();
    const duration = 300; // milliseconds
    const startTime = Date.now();
    
    // Create explosion particles immediately
    createExplosion(mesh.position.clone());
    
    function animateDestruction() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Scale down and spin
        const scale = 1 - progress;
        mesh.scale.set(
            startScale.x * scale,
            startScale.y * scale,
            startScale.z * scale
        );
        mesh.rotation.y += 0.3;
        mesh.rotation.x += 0.1;
        
        // Fade out materials
        mesh.traverse((child) => {
            if (child.isMesh && child.material) {
                if (!child.material.transparent) {
                    child.material.transparent = true;
                }
                child.material.opacity = 1 - progress;
            }
        });
        
        if (progress < 1) {
            requestAnimationFrame(animateDestruction);
        } else {
            // Fully remove from scene
            scene.remove(mesh);
            // Remove from aliens array
            const idx = aliens.indexOf(alien);
            if (idx > -1) {
                aliens.splice(idx, 1);
            }
        }
    }
    
    animateDestruction();
}

// ============================================================================
// EXPLOSION EFFECT
// ============================================================================
function createExplosion(position) {
    const particleCount = 20;
    const particles = [];
    
    for (let i = 0; i < particleCount; i++) {
        const geometry = new THREE.SphereGeometry(0.1, 4, 4);
        const material = new THREE.MeshBasicMaterial({
            color: Math.random() > 0.5 ? 0xff6600 : 0xffff00,
            transparent: true,
            opacity: 1
        });
        
        const particle = new THREE.Mesh(geometry, material);
        particle.position.copy(position);
        
        // Random velocity
        particle.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3
        );
        particle.userData.life = 1.0;
        
        scene.add(particle);
        particles.push(particle);
    }
    
    // Animate particles
    function animateExplosion() {
        let allDead = true;
        
        particles.forEach((particle, index) => {
            if (particle.userData.life > 0) {
                allDead = false;
                particle.position.add(particle.userData.velocity);
                particle.userData.life -= 0.05;
                particle.material.opacity = particle.userData.life;
                particle.scale.multiplyScalar(0.95);
            } else if (particle.parent) {
                scene.remove(particle);
            }
        });
        
        if (!allDead) {
            requestAnimationFrame(animateExplosion);
        }
    }
    
    animateExplosion();
}

// ============================================================================
// ALIEN MOVEMENT
// ============================================================================
function getAlienSpeed() {
    // Every 3 waves, aliens get 10% faster
    const speedMultiplier = Math.pow(1.1, Math.floor((wave - 1) / 3));
    return CONFIG.alienSpeed * speedMultiplier;
}

function updateAliens() {
    const currentSpeed = getAlienSpeed();
    
    for (let i = aliens.length - 1; i >= 0; i--) {
        const alien = aliens[i];
        
        if (alien.type === 'charger' && alien.isCharging) {
            // Charger moves fast and toward player's X position
            const playerX = playerShip ? playerShip.position.x : 0;
            const dx = playerX - alien.mesh.position.x;
            
            // Move toward player X
            alien.mesh.position.x += Math.sign(dx) * currentSpeed * 2;
            
            // Move forward fast
            alien.mesh.position.z += alien.chargeSpeed;
            
            // Wobble aggressively while charging
            alien.mesh.rotation.z = Math.sin(Date.now() * 0.02) * 0.2;
        } else {
            // Normal movement toward player (positive Z direction)
            alien.mesh.position.z += currentSpeed;
        }
        
        // Check if alien reached the player
        if (alien.mesh.position.z >= CONFIG.playerZ - CONFIG.alienHitDistance) {
            // Alien hit the player!
            playerHit(alien, i);
        }
    }
}

function playerHit(alien, index) {
    // Remove the alien that hit the player
    createExplosion(alien.mesh.position.clone());
    scene.remove(alien.mesh);
    aliens.splice(index, 1);
    
    // Lose a life
    lives--;
    updateLivesDisplay();
    
    // Flash screen red
    flashDamage();
    
    // Check for game over
    if (lives <= 0) {
        triggerGameOver();
    }
}

function flashDamage() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 0, 0, 0.3);
        pointer-events: none;
        z-index: 100;
        animation: flashOut 0.3s ease-out forwards;
    `;
    
    // Add keyframe animation
    if (!document.getElementById('damage-flash-style')) {
        const style = document.createElement('style');
        style.id = 'damage-flash-style';
        style.textContent = `
            @keyframes flashOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 300);
}

function triggerGameOver() {
    gameOver = true;
    document.getElementById('final-score').textContent = score;
    document.getElementById('game-over').classList.add('visible');
    
    // Setup restart button
    document.getElementById('restart-btn').onclick = restartGame;
}

function restartGame() {
    // Reset game state
    score = 0;
    wave = 1;
    lives = CONFIG.maxLives;
    gameOver = false;
    gameStarted = true;
    waveTransitioning = false;
    
    // Reset laser state
    laserAvailable = false;
    laserActive = false;
    laserLastUsedWave = 0;
    if (laserBeam) {
        scene.remove(laserBeam);
        laserBeam = null;
    }
    
    // Clear all aliens and bullets
    aliens.forEach(alien => scene.remove(alien.mesh));
    aliens = [];
    bullets.forEach(bullet => scene.remove(bullet));
    bullets = [];
    
    // Reset player position
    if (playerShip) {
        playerShip.position.set(0, 0, CONFIG.playerZ);
    }
    
    // Update UI
    updateScoreDisplay();
    updateWaveDisplay();
    updateLivesDisplay();
    updateLaserDisplay();
    document.getElementById('game-over').classList.remove('visible');
    
    // Spawn new aliens
    spawnAlienGrid();
    showWaveAnnouncement();
}

function setupStartButton() {
    document.getElementById('start-btn').onclick = startGame;
}

function startGame() {
    if (gameStarted) return;
    
    gameStarted = true;
    
    // Hide start screen
    document.getElementById('start-screen').classList.add('hidden');
    
    // Initialize game state
    score = 0;
    wave = 1;
    lives = CONFIG.maxLives;
    gameOver = false;
    waveTransitioning = false;
    
    // Initialize laser state
    laserAvailable = false;
    laserActive = false;
    laserLastUsedWave = 0;
    
    // Update UI
    updateScoreDisplay();
    updateWaveDisplay();
    updateLivesDisplay();
    updateLaserDisplay();
    
    // Spawn aliens and start
    spawnAlienGrid();
    showWaveAnnouncement();
}

// ============================================================================
// UI UPDATES
// ============================================================================
function updateScoreDisplay() {
    document.getElementById('score').textContent = score;
}

function updateWaveDisplay() {
    document.getElementById('wave').textContent = wave;
}

function updateLivesDisplay() {
    const heartsString = '❤️'.repeat(lives) + '🖤'.repeat(CONFIG.maxLives - lives);
    document.getElementById('lives').textContent = heartsString;
}

function showWaveAnnouncement() {
    const announcement = document.getElementById('wave-announcement');
    announcement.textContent = `WAVE ${wave}`;
    announcement.classList.add('visible');
    
    setTimeout(() => {
        announcement.classList.remove('visible');
    }, 2000);
}

// ============================================================================
// WAVE MANAGEMENT
// ============================================================================
function checkWaveComplete() {
    if (aliens.length === 0 && !waveTransitioning) {
        waveTransitioning = true;
        wave++;
        updateWaveDisplay();
        showWaveAnnouncement();
        
        // Check if laser becomes available this wave
        checkLaserAvailability();
        
        // Small delay before spawning new wave
        setTimeout(() => {
            spawnAlienGrid();
            waveTransitioning = false;
        }, 1500);
    }
}

// ============================================================================
// WINDOW RESIZE
// ============================================================================
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================================
// GAME LOOP
// ============================================================================
function animate() {
    requestAnimationFrame(animate);
    
    // Update shooting stars (always, even on start screen)
    updateShootingStars();
    
    // Don't update game logic if game not started or game over
    if (gameStarted && !gameOver) {
        // Update player
        updatePlayer();
        
        // Handle shooting
        if (keys.shoot) {
            shoot();
        }
        
        // Handle laser
        if (keys.laser) {
            fireLaser();
            keys.laser = false; // Prevent multiple fires
        }
        
        // Update bullets
        updateBullets();
        
        // Update laser beam
        updateLaser();
        
        // Update aliens (move toward player)
        updateAliens();
        
        // Check bullet-alien collisions
        checkCollisions();
        
        // Check if wave complete
        checkWaveComplete();
    }
    
    // Render
    renderer.render(scene, camera);
}

// ============================================================================
// START THE GAME
// ============================================================================
init();

