/**
 * Space Outlaw - Core Game Logic
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const xpFill = document.getElementById('xp-bar-fill');
const healthFill = document.getElementById('health-bar-fill');
const levelText = document.getElementById('level-text');
const scoreText = document.getElementById('score-text');
const upgradeMenu = document.getElementById('upgrade-menu');
const upgradeOptions = document.getElementById('upgrade-options');

// Resize handler
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Game Configuration
const CONFIG = {
    PLAYER: {
        BASE_SPEED: 5,
        BASE_DAMAGE: 10,
        PROJECTILE_SPEED: 8,
        FIRE_RATE: 300,
        RADIUS: 20,
        MAX_HP: 100,
        PICKUP_RANGE: 100,
        SHIELD_RECHARGE: 30000,
    },
    ENEMY: {
        BASE_HP: 20,
        BASE_SPEED: 2,
        XP_VALUE: 20,
        SPAWN_RATE_START: 2000,
        SPAWN_RATE_MIN: 500,
    },
    COLORS: {
        PLAYER_BLUE: '#00f3ff',
        PLAYER_PURPLE: '#bc13fe',
        PLAYER_GOLD: '#ffdf00',
        ENEMY: '#bc13fe',
        CRIT: '#ffdf00',
        PIERCING: '#ff00ff',
    }
};

// Game State
const GAME = {
    running: true,
    paused: false,
    score: 0,
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    enemySpawnTimer: 0,
    enemySpawnRate: CONFIG.ENEMY.SPAWN_RATE_START,

    // Entity Collections
    entities: {
        enemies: [],
        projectiles: [],
        particles: [],
        xpOrbs: [],
        blackHoles: []
    }
};

// Input Handling
const keys = {};
const mouse = { x: 0, y: 0 };
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

// Track mouse position
window.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});

const SKILLS = [
    // Tier 1 Skills
    { id: 'fireRate', name: 'Hyper-Reflex Trigger', desc: 'Increase attack speed by 20%', tier: 1, maxLevel: 5, effect: (p) => { p.fireRate *= 0.8; p.skillLevels.fireRate++; } },
    { id: 'damage', name: 'Singularity Cores', desc: 'Increase damage by 5', tier: 1, maxLevel: 5, effect: (p) => { p.damage += 5; p.skillLevels.damage++; } },
    { id: 'speed', name: 'Ion Drive', desc: 'Increase movement speed by 10%', tier: 1, maxLevel: 5, effect: (p) => { p.speed *= 1.1; p.skillLevels.speed++; } },
    { id: 'health', name: 'Nanotech Hull', desc: 'Max HP +20 and repair 30% of current Max HP', tier: 1, maxLevel: 5, effect: (p) => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3); p.skillLevels.health++; } },
    { id: 'multiShot', name: 'Split-Fire Module', desc: 'Add one extra projectile', tier: 1, maxLevel: 3, effect: (p) => { p.multiShot = (p.multiShot || 0) + 1; p.skillLevels.multiShot++; } },
    { id: 'magnet', name: 'Flux Magnet', desc: 'Increase collection range by 25%', tier: 1, maxLevel: 3, effect: (p) => { p.pickupRange *= 1.25; p.skillLevels.magnet++; } },

    // Tier 2 Skills (Prerequisites)
    {
        id: 'wingCannons',
        name: 'Dual Wing Cannons',
        desc: 'Deploy side cannons that mimic your primary fire',
        tier: 2,
        maxLevel: 1,
        prereq: (p) => p.skillLevels.multiShot >= 3,
        effect: (p) => { p.wingCannons = true; p.skillLevels.wingCannons++; }
    },
    {
        id: 'plasmaBeam',
        name: 'Neutron Beam',
        desc: 'Primary fire becomes a piercing laser beam',
        tier: 2,
        maxLevel: 1,
        prereq: (p) => p.skillLevels.damage >= 3,
        effect: (p) => { p.plasmaBeam = true; p.skillLevels.plasmaBeam++; }
    },
    {
        id: 'shieldGen',
        name: 'Aegis Shield',
        desc: 'Generate a shield that absorbs one hit (30s recharge)',
        tier: 2,
        maxLevel: 1,
        prereq: (p) => p.skillLevels.health >= 3,
        effect: (p) => { p.shieldEnabled = true; p.skillLevels.shieldGen++; }
    },
    {
        id: 'critCore',
        name: 'Targeting Link',
        desc: 'Increase Critical Hit chance by 10% (2x damage)',
        tier: 2,
        maxLevel: 3,
        prereq: (p) => p.skillLevels.fireRate >= 3,
        effect: (p) => { p.critChance += 0.1; p.skillLevels.critCore++; }
    },
    {
        id: 'homing',
        name: 'Seeker Missiles',
        desc: 'Fire homing missiles every 3 seconds',
        tier: 2,
        maxLevel: 1,
        prereq: (p) => p.skillLevels.multiShot >= 2 && p.skillLevels.damage >= 2,
        effect: (p) => { p.homingEnabled = true; p.skillLevels.homing++; }
    },

    // Tier 3 Skills
    {
        id: 'overdrive',
        name: 'System Overdrive',
        desc: 'Double fire rate when HP is below 30%',
        tier: 3,
        maxLevel: 1,
        prereq: (p) => p.skillLevels.speed >= 5 && p.skillLevels.fireRate >= 5,
        effect: (p) => { p.overdrivePassive = true; p.skillLevels.overdrive++; }
    },
    {
        id: 'blackHole',
        name: 'Event Horizon',
        desc: 'Bullets have chance to create mini-black holes',
        tier: 3,
        maxLevel: 1,
        prereq: (p) => p.skillLevels.plasmaBeam >= 1 && p.skillLevels.damage >= 5,
        effect: (p) => { p.blackHoleChance = 0.05; p.skillLevels.blackHole++; }
    },
    {
        id: 'phantom',
        name: 'Quantum Ghost',
        desc: '15% chance to dodge any incoming damage',
        tier: 3,
        maxLevel: 1,
        prereq: (p) => p.skillLevels.speed >= 5 && p.skillLevels.shieldGen >= 1,
        effect: (p) => { p.dodgeChance += 0.15; p.skillLevels.phantom++; }
    }
];

class Star {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2;
        this.speed = Math.random() * 0.5 + 0.1;
    }

    update() {
        this.y += this.speed;
        if (this.y > canvas.height) {
            this.y = 0;
            this.x = Math.random() * canvas.width;
        }
    }

    draw() {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

const stars = Array.from({ length: 150 }, () => new Star());

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 4 + 2;
        this.speedX = (Math.random() - 0.5) * 6;
        this.speedY = (Math.random() - 0.5) * 6;
        this.life = 1;
        this.decay = Math.random() * 0.05 + 0.02;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= this.decay;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }
}

class XPOrb {
    constructor(x, y, value) {
        this.x = x;
        this.y = y;
        this.value = value;
        this.radius = 5;
        this.color = CONFIG.COLORS.PLAYER_BLUE;
        this.speed = 0;
        this.maxSpeed = 10;
    }

    update(player) {
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        if (dist < player.pickupRange) {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            this.speed = Math.min(this.maxSpeed, this.speed + 0.5);
            this.x += Math.cos(angle) * this.speed;
            this.y += Math.sin(angle) * this.speed;
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
    }
}

// Projectile Class
class Projectile {
    constructor(x, y, angle, speed, damage, isCrit = false) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = speed;
        this.damage = isCrit ? damage * 2 : damage;
        this.radius = isCrit ? 6 : 4;
        this.isCrit = isCrit;
    }

    update() {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        let color = this.piercing ? CONFIG.COLORS.PIERCING : CONFIG.COLORS.PLAYER_BLUE;
        if (this.isCrit) color = CONFIG.COLORS.CRIT;
        ctx.fillStyle = color;
        ctx.shadowBlur = (this.piercing || this.isCrit) ? 20 : 10;
        ctx.shadowColor = color;
        ctx.fill();

        if (this.piercing) {
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x - Math.cos(this.angle) * 40, this.y - Math.sin(this.angle) * 40);
            ctx.strokeStyle = color + '66'; // 40% alpha
            ctx.lineWidth = this.radius * 2;
            ctx.stroke();
        }
    }
}

class Missile extends Projectile {
    constructor(x, y, angle, speed, damage) {
        super(x, y, angle, speed, damage);
        this.target = null;
        this.turnSpeed = 0.1;
    }

    update() {
        if (!this.target || !GAME.entities.enemies.includes(this.target)) {
            let minDist = Infinity;
            GAME.entities.enemies.forEach(e => {
                const d = Math.hypot(e.x - this.x, e.y - this.y);
                if (d < minDist) {
                    minDist = d;
                    this.target = e;
                }
            });
        }

        if (this.target) {
            const desiredAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            let diff = desiredAngle - this.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            this.angle += Math.sign(diff) * Math.min(Math.abs(diff), this.turnSpeed);
        }

        super.update();
    }
}

class BlackHole {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = 60;
        this.life = 180;
        this.pullForce = 2;
    }

    update() {
        this.life--;
        if (this.life > 150) this.radius += 2;
        if (this.life < 30) this.radius -= 2;

        GAME.entities.enemies.forEach(e => {
            const dist = Math.hypot(this.x - e.x, this.y - e.y);
            if (dist < 150) {
                const angle = Math.atan2(this.y - e.y, this.x - e.x);
                e.x += Math.cos(angle) * this.pullForce;
                e.y += Math.sin(angle) * this.pullForce;
            }
        });
    }

    draw() {
        ctx.save();
        ctx.beginPath();
        const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
        grad.addColorStop(0, 'black');
        grad.addColorStop(0.7, CONFIG.COLORS.PLAYER_PURPLE);
        grad.addColorStop(1, 'transparent');
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.shadowBlur = 20;
        ctx.shadowColor = CONFIG.COLORS.PLAYER_PURPLE;
        ctx.fill();
        ctx.restore();
    }
}

// Enemy Class
class Enemy {
    constructor(x, y, type = 'grunt') {
        this.x = x;
        this.y = y;
        this.type = type;
        this.radius = 15;
        this.speed = CONFIG.ENEMY.BASE_SPEED;
        this.hp = CONFIG.ENEMY.BASE_HP;
        this.maxHp = CONFIG.ENEMY.BASE_HP;
        this.color = CONFIG.COLORS.ENEMY;
        this.xpValue = CONFIG.ENEMY.XP_VALUE;
        this.angle = 0;
        this.passThroughTimer = 0;
    }

    update(player) {
        if (this.passThroughTimer > 0) {
            this.x += Math.cos(this.angle) * (this.speed * 1.5);
            this.y += Math.sin(this.angle) * (this.speed * 1.5);
            this.passThroughTimer--;
        } else {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const angle = Math.atan2(dy, dx);
            this.x += Math.cos(angle) * this.speed;
            this.y += Math.sin(angle) * this.speed;
            this.angle = angle;
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.beginPath();
        ctx.moveTo(15, 0); ctx.lineTo(5, 12); ctx.lineTo(-15, 8); ctx.lineTo(-15, -8); ctx.lineTo(5, -12);
        ctx.closePath();
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.restore();
    }
}

// Player Class
class Player {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        this.radius = CONFIG.PLAYER.RADIUS;
        this.speed = CONFIG.PLAYER.BASE_SPEED;
        this.angle = 0;
        this.hp = CONFIG.PLAYER.MAX_HP;
        this.maxHp = CONFIG.PLAYER.MAX_HP;
        this.fireRate = CONFIG.PLAYER.FIRE_RATE;
        this.lastShot = 0;
        this.projectileSpeed = CONFIG.PLAYER.PROJECTILE_SPEED;
        this.damage = CONFIG.PLAYER.BASE_DAMAGE;
        this.multiShot = 0;

        // Skill Tracking
        this.skillLevels = {
            fireRate: 0, damage: 0, speed: 0, health: 0, multiShot: 0,
            magnet: 0, wingCannons: 0, plasmaBeam: 0, shieldGen: 0,
            critCore: 0, homing: 0, overdrive: 0, blackHole: 0, phantom: 0
        };

        // Equipment & Mechanics
        this.wingCannons = false;
        this.plasmaBeam = false;
        this.pickupRange = CONFIG.PLAYER.PICKUP_RANGE;
        this.shieldEnabled = false;
        this.shieldActive = false;
        this.shieldCooldown = 0;
        this.shieldMaxCooldown = CONFIG.PLAYER.SHIELD_RECHARGE;
        this.critChance = 0;
        this.homingEnabled = false;
        this.lastHomingMissile = 0;
        this.overdrivePassive = false;
        this.blackHoleChance = 0;
        this.dodgeChance = 0;
    }

    update() {
        if (GAME.paused) return;

        this.handleShield();
        this.handleInput();
        this.handleCombat();
    }

    handleShield() {
        if (this.shieldEnabled && !this.shieldActive && this.shieldCooldown <= 0) {
            this.shieldActive = true;
        }
        if (this.shieldCooldown > 0) {
            this.shieldCooldown -= 16.67;
        }
    }

    handleInput() {
        // Aim towards mouse
        this.angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);

        let dx = 0, dy = 0;
        if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) dx += 1;

        if (dx !== 0 || dy !== 0) {
            const mag = Math.sqrt(dx * dx + dy * dy);
            this.x += (dx / mag) * this.speed;
            this.y += (dy / mag) * this.speed;

            if (Math.random() > 0.5) {
                const px = this.x - Math.cos(this.angle) * 15;
                const py = this.y - Math.sin(this.angle) * 15;
                GAME.entities.particles.push(new Particle(px, py, 'rgba(0, 243, 255, 0.5)'));
            }
        }

        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
    }

    handleCombat() {
        const now = Date.now();
        let currentFireRate = this.fireRate;
        if (this.overdrivePassive && this.hp < this.maxHp * 0.3) currentFireRate *= 0.5;

        if (now - this.lastShot > currentFireRate) {
            this.shoot();
            this.lastShot = now;
        }

        if (this.homingEnabled && now - this.lastHomingMissile > 3000) {
            GAME.entities.projectiles.push(new Missile(this.x, this.y, this.angle, 6, this.damage * 1.5));
            this.lastHomingMissile = now;
        }
    }

    shoot() {
        const fire = (angle, offsetX = 0, offsetY = 0) => {
            const s = Math.sin(this.angle), c = Math.cos(this.angle);
            const rx = this.x + (offsetX * c - offsetY * s);
            const ry = this.y + (offsetX * s + offsetY * c);

            const isCrit = Math.random() < this.critChance;
            const isBlackHole = Math.random() < this.blackHoleChance;

            // Multi-shot logic: 0 means 1 projectile, 1 means 3, 2 means 5, etc.
            // The loop should go from -multiShot to +multiShot, incrementing by 1
            // and then multiplying by 0.15 for the angle spread.
            // The original code had `for (let i = 1; i <= this.multiShot; i++) { angles.push(angle + (i * 0.15)); angles.push(angle - (i * 0.15)); }`
            // which creates 2*multiShot projectiles + 1 main.
            // The new code `for (let i = -this.multiShot; i <= this.multiShot; i += 2)` would create (multiShot/2)+1 projectiles.
            // Let's adjust to match the original intent of `1 + 2*multiShot` projectiles.
            // Main shot
            const mainProj = new Projectile(rx, ry, angle, this.projectileSpeed, this.damage, isCrit);
            if (isBlackHole) mainProj.onHit = (x, y) => GAME.entities.blackHoles.push(new BlackHole(x, y));
            if (this.plasmaBeam) mainProj.piercing = true;
            GAME.entities.projectiles.push(mainProj);

            // Extra shots - 1 per level, 20% damage penalty
            for (let i = 1; i <= this.multiShot; i++) {
                const side = i % 2 === 0 ? 1 : -1;
                const spread = Math.ceil(i / 2) * 0.15 * side;
                const extraProj = new Projectile(rx, ry, angle + spread, this.projectileSpeed, this.damage * 0.8, isCrit);
                if (isBlackHole) extraProj.onHit = (x, y) => GAME.entities.blackHoles.push(new BlackHole(x, y));
                if (this.plasmaBeam) extraProj.piercing = true;
                GAME.entities.projectiles.push(extraProj);
            }
        };

        fire(this.angle, 20, 0); // Main Cannon
        if (this.wingCannons) {
            fire(this.angle, 5, 20);
            fire(this.angle, 5, -20);
        }

        // Back Cannon
        if (this.backCannon) {
            fire(this.angle + Math.PI, -15, 0);
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        let shipColor = CONFIG.COLORS.PLAYER_BLUE;
        if (this.skillLevels.overdrive > 0 || this.skillLevels.blackHole > 0 || this.skillLevels.phantom > 0) shipColor = CONFIG.COLORS.PLAYER_GOLD;
        else if (this.wingCannons || this.plasmaBeam || this.shieldEnabled) shipColor = CONFIG.COLORS.PLAYER_PURPLE;

        // Wing Cannons Visual
        if (this.wingCannons) {
            ctx.fillStyle = shipColor;
            ctx.fillRect(0, 15, 10, 5);
            ctx.fillRect(0, -20, 10, 5);
        }

        // Back Cannon Visual
        if (this.backCannon) {
            ctx.fillStyle = CONFIG.COLORS.PLAYER_BLUE; // Assuming back cannon is always blue
            ctx.fillRect(-15, -3, 10, 6);
        }

        // Flame effect when moving
        if (keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'] || keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight']) {
            ctx.beginPath();
            ctx.moveTo(-15, 0);
            ctx.lineTo(-30 - Math.random() * 10, 0);
            ctx.strokeStyle = CONFIG.COLORS.PLAYER_BLUE; // Assuming engine flame is always blue
            ctx.lineWidth = 4;
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.lineTo(-15, -15);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-15, 15);
        ctx.closePath();

        ctx.fillStyle = shipColor;
        ctx.shadowBlur = 15;
        ctx.shadowColor = shipColor;
        ctx.fill();

        // Shield Visual
        if (this.shieldActive) {
            ctx.restore(); // Exit rotated context for easier circle drawing or stay in it
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 10, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 243, 255, 0.5)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = 'rgba(0, 243, 255, 0.1)';
            ctx.fill();
        }

        ctx.restore();
    }
}

const player = new Player();

const EntityManager = {
    update() {
        const { projectiles, enemies, particles, blackHoles, xpOrbs } = GAME.entities;

        // Update and filter projectiles
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            p.update();
            if (p.x < -50 || p.x > canvas.width + 50 || p.y < -50 || p.y > canvas.height + 50) {
                projectiles.splice(i, 1);
            }
        }

        // Update enemies
        enemies.forEach(e => e.update(player));

        // Update and filter particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.update();
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Update and filter black holes
        for (let i = blackHoles.length - 1; i >= 0; i--) {
            const bh = blackHoles[i];
            bh.update();
            if (bh.life <= 0) blackHoles.splice(i, 1);
        }

        // Update XP Orbs (player interaction is handled in collisions)
        xpOrbs.forEach(orb => orb.update(player));

        this.checkCollisions();
    },

    draw() {
        const { particles, blackHoles, xpOrbs, projectiles, enemies } = GAME.entities;
        particles.forEach(p => p.draw());
        blackHoles.forEach(bh => bh.draw());
        xpOrbs.forEach(orb => orb.draw());
        player.draw();
        projectiles.forEach(p => p.draw());
        enemies.forEach(e => e.draw());
    },

    checkCollisions() {
        const { projectiles, enemies, xpOrbs } = GAME.entities;

        // Projectiles vs Enemies
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            let projectileHit = false;
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j];
                const dist = Math.hypot(p.x - e.x, p.y - e.y);
                if (dist < p.radius + e.radius) {
                    e.hp -= p.damage;
                    if (p.onHit) p.onHit(p.x, p.y);

                    if (e.hp <= 0) {
                        GAME.score += 100;
                        xpOrbs.push(new XPOrb(e.x, e.y, e.xpValue));
                        createExplosion(e.x, e.y, e.color);
                        enemies.splice(j, 1);
                        checkLevelUp();
                    }

                    if (!p.piercing) {
                        projectileHit = true;
                        break; // Projectile hit, stop checking against other enemies
                    }
                }
            }
            if (projectileHit) {
                projectiles.splice(i, 1);
            }
        }

        // Player vs XP Orbs
        for (let i = xpOrbs.length - 1; i >= 0; i--) {
            const orb = xpOrbs[i];
            const dist = Math.hypot(player.x - orb.x, player.y - orb.y);
            if (dist < player.radius + orb.radius) {
                GAME.xp += orb.value;
                xpOrbs.splice(i, 1);
            }
        }

        // Player vs Enemies
        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (e.passThroughTimer > 0) continue; // Don't damage during pass-through phase

            const dist = Math.hypot(player.x - e.x, player.y - e.y);
            if (dist < player.radius + e.radius) {
                // Check Shield
                if (player.shieldActive) {
                    player.shieldActive = false;
                    player.shieldCooldown = player.shieldMaxCooldown;
                    e.passThroughTimer = 60;
                    continue;
                }

                // Check Dodge
                if (Math.random() < player.dodgeChance) {
                    e.passThroughTimer = 60;
                    continue;
                }

                player.hp -= 10; // Fixed chunk of damage
                e.passThroughTimer = 60; // 1 second of "pass-through"

                // Flash effect or similar can be added here
                if (player.hp <= 0) {
                    endGame();
                }
            }
        }
    }
};

const UIManager = {
    update() {
        scoreText.innerText = GAME.score.toLocaleString();
        levelText.innerText = `LVL ${GAME.level}`;
        xpFill.style.width = `${(GAME.xp / GAME.xpToNextLevel) * 100}%`;
        healthFill.style.width = `${(player.hp / player.maxHp) * 100}%`;

        const healthText = document.getElementById('health-text');
        if (healthText) {
            healthText.innerText = `${Math.ceil(player.hp)} / ${player.maxHp}`;
        }
    },

    showUpgradeMenu() {
        GAME.paused = true;
        upgradeMenu.classList.remove('hidden');
        upgradeOptions.innerHTML = '';

        // Filter skills by level and prereqs
        const availableSkills = SKILLS.filter(s => {
            const currentLevel = player.skillLevels[s.id] || 0;
            if (currentLevel >= s.maxLevel) return false;
            if (s.prereq && !s.prereq(player)) return false;
            return true;
        });

        const shuffled = [...availableSkills].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 3);

        selected.forEach(skill => {
            const level = (player.skillLevels[skill.id] || 0) + 1;
            const btn = document.createElement('button');
            btn.className = 'upgrade-btn';
            btn.dataset.tier = skill.tier; // Set tier for CSS styling
            btn.innerHTML = `
                <div>
                    <div class="name">${skill.name} <span style="font-size: 0.8em; opacity: 0.6">Lv.${level}</span></div>
                    <div class="desc">${skill.desc}</div>
                </div>
                <div class="arrow">→</div>
            `;
            btn.onclick = () => {
                skill.effect(player);
                GAME.paused = false;
                upgradeMenu.classList.add('hidden');
            };
            upgradeOptions.appendChild(btn);
        });
    }
};

function createExplosion(x, y, color) {
    for (let i = 0; i < 15; i++) {
        GAME.entities.particles.push(new Particle(x, y, color));
    }
}

function spawnEnemy() {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { x = Math.random() * canvas.width; y = -50; }
    else if (side === 1) { x = canvas.width + 50; y = Math.random() * canvas.height; }
    else if (side === 2) { x = Math.random() * canvas.width; y = canvas.height + 50; }
    else { x = -50; y = Math.random() * canvas.height; }

    GAME.entities.enemies.push(new Enemy(x, y));
}

function checkLevelUp() {
    if (GAME.xp >= GAME.xpToNextLevel) {
        GAME.level++;
        GAME.xp -= GAME.xpToNextLevel;
        GAME.xpToNextLevel = Math.floor(GAME.xpToNextLevel * 1.5);
        UIManager.showUpgradeMenu();
    }
}

function endGame() {
    GAME.running = false;
    upgradeMenu.classList.add('hidden'); // Fix: hide upgrade menu on death
    document.getElementById('game-over').classList.remove('hidden');
    document.getElementById('final-score').innerText = `Score: ${GAME.score}`;
}

// Main Game Loop
function gameLoop() {
    if (!GAME.running) return;

    // Background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Stars (Static layer)
    stars.forEach(s => {
        if (!GAME.paused) s.update();
        s.draw();
    });

    if (!GAME.paused) {
        // Spawning logic
        GAME.enemySpawnTimer += 16.67;
        if (GAME.enemySpawnTimer > GAME.enemySpawnRate) {
            spawnEnemy();
            GAME.enemySpawnTimer = 0;
            GAME.enemySpawnRate = Math.max(CONFIG.ENEMY.SPAWN_RATE_MIN, GAME.enemySpawnRate * 0.98);
        }

        player.update();
        EntityManager.update();
    }

    EntityManager.draw();
    UIManager.update();

    requestAnimationFrame(gameLoop);
}

gameLoop();
