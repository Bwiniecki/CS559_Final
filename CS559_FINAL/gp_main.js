import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================================
// GAME CONFIGURATION
// ============================================================================
const CONFIG = {
    // Player settings
    playerSpeed: 0.15,
    playerBounds: 8,
    
    // Bullet settings
    bulletSpeed: 0.4,
    bulletRadius: 0.1,
    bulletColor: 0xff6600,
    shootCooldown: 200, // milliseconds
    
    // Alien grid settings
    alienRows: 4,
    alienCols: 5,
    alienSpacingX: 2.5,
    alienSpacingZ: 2,
    alienStartZ: -5,
    alienStartY: 2,
    
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
let score = 0;
let wave = 1;
let lastShootTime = 0;
let waveTransitioning = false;

// Input state
const keys = {
    left: false,
    right: false,
    shoot: false
};

// Loaders
const gltfLoader = new GLTFLoader();

// Model templates (loaded once, cloned for instances)
let alienModel = null;

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
}

// ============================================================================
// MODEL LOADING
// ============================================================================
function loadModels() {
    // Create placeholder ship
    createPlaceholderShip();
    
    // Create placeholder alien (using our custom design)
    createFallbackAlien();
    
    // Start the game immediately with placeholders
    spawnAlienGrid();
    showWaveAnnouncement();
    animate();
    
    /*
    // Uncomment this when you have working GLB models:
    let modelsLoaded = 0;
    const totalModels = 2;
    
    function onModelLoaded() {
        modelsLoaded++;
        if (modelsLoaded === totalModels) {
            spawnAlienGrid();
            showWaveAnnouncement();
            animate();
        }
    }
    
    gltfLoader.load(
        'models/ship.glb',
        (gltf) => {
            playerShip = gltf.scene;
            playerShip.position.set(0, 0, 5);
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
            createPlaceholderShip();
            onModelLoaded();
        }
    );
    
    gltfLoader.load(
        'models/Alien.glb',
        (gltf) => {
            alienModel = gltf.scene;
            alienModel.scale.set(1, 1, 1);
            onModelLoaded();
        },
        undefined,
        (error) => {
            console.error('Error loading alien model:', error);
            createFallbackAlien();
            onModelLoaded();
        }
    );
    */
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
    
    playerShip.position.set(0, 0, 5);
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

// ============================================================================
// ALIEN GRID SPAWNING
// ============================================================================
function spawnAlienGrid() {
    // Clear existing aliens
    aliens.forEach(alien => scene.remove(alien.mesh));
    aliens = [];
    
    const startX = -(CONFIG.alienCols - 1) * CONFIG.alienSpacingX / 2;
    
    for (let row = 0; row < CONFIG.alienRows; row++) {
        for (let col = 0; col < CONFIG.alienCols; col++) {
            const alienClone = alienModel.clone();
            
            const x = startX + col * CONFIG.alienSpacingX;
            const z = CONFIG.alienStartZ - row * CONFIG.alienSpacingZ;
            const y = CONFIG.alienStartY;
            
            alienClone.position.set(x, y, z);
            
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
                alive: true
            });
        }
    }
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
        }
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
// COLLISION DETECTION
// ============================================================================
function checkCollisions() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        const bulletPos = bullet.position;
        
        for (let j = aliens.length - 1; j >= 0; j--) {
            const alien = aliens[j];
            if (!alien.alive) continue;
            
            // Update bounding box to current position
            alien.boundingBox.setFromObject(alien.mesh);
            
            // Check if bullet is inside alien bounding box
            if (alien.boundingBox.containsPoint(bulletPos)) {
                // Hit! Remove bullet and alien
                scene.remove(bullet);
                bullets.splice(i, 1);
                
                // Create explosion effect
                createExplosion(alien.mesh.position.clone());
                
                scene.remove(alien.mesh);
                alien.alive = false;
                aliens.splice(j, 1);
                
                // Update score
                score += CONFIG.pointsPerAlien;
                updateScoreDisplay();
                
                break;
            }
        }
    }
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
// UI UPDATES
// ============================================================================
function updateScoreDisplay() {
    document.getElementById('score').textContent = score;
}

function updateWaveDisplay() {
    document.getElementById('wave').textContent = wave;
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
    
    // Update player
    updatePlayer();
    
    // Handle shooting
    if (keys.shoot) {
        shoot();
    }
    
    // Update bullets
    updateBullets();
    
    // Check collisions
    checkCollisions();
    
    // Check if wave complete
    checkWaveComplete();
    
    // Render
    renderer.render(scene, camera);
}

// ============================================================================
// START THE GAME
// ============================================================================
init();

