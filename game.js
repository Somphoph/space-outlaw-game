/**
 * Space Outlaw - Alien Survival
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const xpFill = document.getElementById('xp-bar-fill');
const healthFill = document.getElementById('health-bar-fill');
const healthBar = document.getElementById('health-bar-container');
const dashFill = document.getElementById('dash-bar-fill');
const levelText = document.getElementById('level-text');
const scoreText = document.getElementById('score-text');
const waveText = document.getElementById('wave-text');
const comboText = document.getElementById('combo-text');
const killsText = document.getElementById('kills-text');
const timeText = document.getElementById('time-text');
const hiscoreText = document.getElementById('hiscore-text');
const hud = document.getElementById('hud');
const upgradeMenu = document.getElementById('upgrade-menu');
const upgradeOptions = document.getElementById('upgrade-options');
const startScreen = document.getElementById('start-screen');
const pauseMenu = document.getElementById('pause-menu');
const gameOverScreen = document.getElementById('game-over');
const waveBanner = document.getElementById('wave-banner');
const HISCORE_KEY = 'space-outlaw-hiscore';

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const CONFIG = {
    PLAYER: {
        BASE_SPEED: 5,
        BASE_DAMAGE: 10,
        PROJECTILE_SPEED: 9,
        FIRE_RATE: 280,
        RADIUS: 18,
        MAX_HP: 100,
        PICKUP_RANGE: 110,
        SHIELD_RECHARGE: 26000,
        DASH_DURATION: 180,
        DASH_COOLDOWN: 1600,
        DASH_SPEED: 14
    },
    ENEMY: {
        SPAWN_RATE_START: 1600,
        SPAWN_RATE_MIN: 280
    },
    COLORS: {
        PLAYER_BLUE: '#00f3ff',
        PLAYER_PURPLE: '#bc13fe',
        PLAYER_GOLD: '#ffdf00',
        ENEMY: '#bc13fe',
        CRIT: '#ffdf00',
        PIERCING: '#ff00ff'
    }
};

const ENEMY_TYPES = {
    grunt: { radius: 15, speed: 2.05, hp: 22, xp: 18, score: 100, color: '#bc13fe', damage: 10 },
    scout: { radius: 11, speed: 3.35, hp: 12, xp: 14, score: 80, color: '#3dffc2', damage: 8 },
    brute: { radius: 24, speed: 1.15, hp: 90, xp: 40, score: 220, color: '#ff3355', damage: 18 },
    spitter: { radius: 16, speed: 1.45, hp: 34, xp: 28, score: 150, color: '#ff9d00', damage: 10, shoot: true },
    elite: { radius: 32, speed: 1.7, hp: 260, xp: 120, score: 800, color: '#ffdf00', damage: 24 }
};

const GAME = {
    mode: 'menu',
    score: 0,
    highScore: Number(localStorage.getItem(HISCORE_KEY) || 0),
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    kills: 0,
    wave: 1,
    elapsed: 0,
    spawnTimer: 0,
    spawnRate: CONFIG.ENEMY.SPAWN_RATE_START,
    waveTimer: 0,
    waveLength: 22000,
    restTimer: 0,
    combo: 1,
    comboTimer: 0,
    nextEnemyId: 1,
    nextShotId: 1,
    pendingLevelUps: 0,
    entities: {
        enemies: [],
        projectiles: [],
        enemyShots: [],
        particles: [],
        xpOrbs: [],
        blackHoles: [],
        powerups: [],
        floaters: []
    }
};

const camera = { x: 0, y: 0, trauma: 0 };
const keys = {};
const mouse = { x: 0, y: 0 };

window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
    }
    if (e.code === 'Escape') togglePause();
    if (e.code === 'Enter' && GAME.mode === 'menu') startGame();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});

const AudioFX = {
    ctx: null,
    enabled: true,
    init() {
        if (this.ctx) return;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
    },
    tone(freq, duration, type = 'square', volume = 0.05, slide = 0) {
        if (!this.ctx || !this.enabled) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), this.ctx.currentTime + duration);
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    shoot() { this.tone(920, 0.045, 'square', 0.035, -420); },
    missile() { this.tone(240, 0.12, 'sawtooth', 0.04, 180); },
    hit() { this.tone(140, 0.08, 'sawtooth', 0.06, -80); },
    dash() { this.tone(180, 0.14, 'triangle', 0.05, 520); },
    pickup() { this.tone(880, 0.08, 'sine', 0.05, 400); },
    explode() { this.tone(90, 0.18, 'sawtooth', 0.07, -50); },
    level() {
        this.tone(520, 0.12, 'sine', 0.06, 0);
        setTimeout(() => this.tone(780, 0.16, 'sine', 0.06, 0), 90);
    },
    wave() { this.tone(300, 0.2, 'triangle', 0.05, 200); },
    power() { this.tone(640, 0.16, 'square', 0.05, 300); }
};

function rand(min, max) {
    return min + Math.random() * (max - min);
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function addScore(base) {
    const gained = Math.round(base * GAME.combo);
    GAME.score += gained;
    if (GAME.score > GAME.highScore) {
        GAME.highScore = GAME.score;
        localStorage.setItem(HISCORE_KEY, String(GAME.highScore));
    }
    return gained;
}

function bumpCombo() {
    GAME.combo = Math.min(8, GAME.combo + 0.25);
    GAME.comboTimer = 2200;
}

function shake(amount) {
    camera.trauma = Math.min(18, camera.trauma + amount);
}

function spawnFloater(x, y, text, color) {
    GAME.entities.floaters.push(new Floater(x, y, text, color));
}

function createExplosion(x, y, color, count = 14) {
    const max = 420;
    const room = max - GAME.entities.particles.length;
    const n = Math.min(count, Math.max(0, room));
    for (let i = 0; i < n; i++) {
        GAME.entities.particles.push(new Particle(x, y, color));
    }
}

const SKILLS = [
    { id: 'fireRate', name: 'Hyper-Reflex Trigger', desc: 'Increase attack speed by 20%', tier: 1, maxLevel: 5, effect: (p) => { p.fireRate *= 0.8; p.skillLevels.fireRate++; } },
    { id: 'damage', name: 'Singularity Cores', desc: 'Increase damage by 5', tier: 1, maxLevel: 5, effect: (p) => { p.damage += 5; p.skillLevels.damage++; } },
    { id: 'speed', name: 'Ion Drive', desc: 'Increase movement speed by 10%', tier: 1, maxLevel: 5, effect: (p) => { p.speed *= 1.1; p.skillLevels.speed++; } },
    { id: 'health', name: 'Nanotech Hull', desc: 'Max HP +20 and repair 30% of Max HP', tier: 1, maxLevel: 5, effect: (p) => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3); p.skillLevels.health++; } },
    { id: 'multiShot', name: 'Split-Fire Module', desc: 'Add one extra projectile', tier: 1, maxLevel: 3, effect: (p) => { p.multiShot += 1; p.skillLevels.multiShot++; } },
    { id: 'magnet', name: 'Flux Magnet', desc: 'Increase collection range by 25%', tier: 1, maxLevel: 3, effect: (p) => { p.pickupRange *= 1.25; p.skillLevels.magnet++; } },
    {
        id: 'wingCannons',
        name: 'Dual Wing Cannons',
        desc: 'Deploy side cannons that mimic your primary fire',
        tier: 2, maxLevel: 1,
        prereq: (p) => p.skillLevels.multiShot >= 3,
        effect: (p) => { p.wingCannons = true; p.skillLevels.wingCannons++; }
    },
    {
        id: 'plasmaBeam',
        name: 'Neutron Beam',
        desc: 'Primary fire becomes a piercing laser beam',
        tier: 2, maxLevel: 1,
        prereq: (p) => p.skillLevels.damage >= 3,
        effect: (p) => { p.plasmaBeam = true; p.skillLevels.plasmaBeam++; }
    },
    {
        id: 'shieldGen',
        name: 'Aegis Shield',
        desc: 'Generate a shield that absorbs one hit (26s recharge)',
        tier: 2, maxLevel: 1,
        prereq: (p) => p.skillLevels.health >= 3,
        effect: (p) => { p.shieldEnabled = true; p.skillLevels.shieldGen++; }
    },
    {
        id: 'critCore',
        name: 'Targeting Link',
        desc: 'Increase Critical Hit chance by 10% (2x damage)',
        tier: 2, maxLevel: 3,
        prereq: (p) => p.skillLevels.fireRate >= 3,
        effect: (p) => { p.critChance += 0.1; p.skillLevels.critCore++; }
    },
    {
        id: 'homing',
        name: 'Seeker Missiles',
        desc: 'Fire homing missiles every 3 seconds',
        tier: 2, maxLevel: 1,
        prereq: (p) => p.skillLevels.multiShot >= 2 && p.skillLevels.damage >= 2,
        effect: (p) => { p.homingEnabled = true; p.skillLevels.homing++; }
    },
    {
        id: 'backCannon',
        name: 'Stern Autocannon',
        desc: 'Mount a rear cannon that covers your six',
        tier: 2, maxLevel: 1,
        prereq: (p) => p.skillLevels.multiShot >= 2,
        effect: (p) => { p.backCannon = true; p.skillLevels.backCannon++; }
    },
    {
        id: 'dashMaster',
        name: 'Phase Afterburner',
        desc: 'Dash cooldown reduced by 30% and travel farther',
        tier: 2, maxLevel: 1,
        prereq: (p) => p.skillLevels.speed >= 2,
        effect: (p) => { p.dashCooldownMax *= 0.7; p.dashBoost = 1.25; p.skillLevels.dashMaster++; }
    },
    {
        id: 'overdrive',
        name: 'System Overdrive',
        desc: 'Double fire rate when HP is below 30%',
        tier: 3, maxLevel: 1,
        prereq: (p) => p.skillLevels.speed >= 5 && p.skillLevels.fireRate >= 5,
        effect: (p) => { p.overdrivePassive = true; p.skillLevels.overdrive++; }
    },
    {
        id: 'blackHole',
        name: 'Event Horizon',
        desc: 'Bullets have a chance to create mini-black holes',
        tier: 3, maxLevel: 1,
        prereq: (p) => p.skillLevels.plasmaBeam >= 1 && p.skillLevels.damage >= 5,
        effect: (p) => { p.blackHoleChance = 0.08; p.skillLevels.blackHole++; }
    },
    {
        id: 'phantom',
        name: 'Quantum Ghost',
        desc: '15% chance to dodge any incoming damage',
        tier: 3, maxLevel: 1,
        prereq: (p) => p.skillLevels.speed >= 5 && p.skillLevels.shieldGen >= 1,
        effect: (p) => { p.dodgeChance += 0.15; p.skillLevels.phantom++; }
    }
];

class Star {
    constructor(layer = 1) {
        this.layer = layer;
        this.reset(true);
    }
    reset(anywhere = false) {
        this.x = Math.random() * canvas.width;
        this.y = anywhere ? Math.random() * canvas.height : -2;
        this.size = this.layer * 0.7 + Math.random();
        this.speed = this.layer * 0.35 + Math.random() * 0.25;
        this.alpha = 0.25 + this.layer * 0.22;
    }
    update(dt) {
        this.y += this.speed * dt;
        if (this.y > canvas.height) this.reset(false);
    }
    draw() {
        ctx.fillStyle = `rgba(255,255,255,${this.alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 4 + 1.5;
        this.speedX = (Math.random() - 0.5) * 6;
        this.speedY = (Math.random() - 0.5) * 6;
        this.life = 1;
        this.decay = Math.random() * 0.05 + 0.02;
    }
    update(dt) {
        this.x += this.speedX * dt;
        this.y += this.speedY * dt;
        this.life -= this.decay * dt;
    }
    draw() {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

class Floater {
    constructor(x, y, text, color) {
        this.x = x + rand(-8, 8);
        this.y = y;
        this.text = text;
        this.color = color;
        this.life = 1;
        this.vy = -1.2;
    }
    update(dt) {
        this.y += this.vy * dt;
        this.life -= 0.018 * dt;
    }
    draw() {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.font = '700 13px "Space Grotesk", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y);
        ctx.globalAlpha = 1;
    }
}

class XPOrb {
    constructor(x, y, value) {
        this.x = x;
        this.y = y;
        this.value = value;
        this.radius = value >= 80 ? 8 : 5;
        this.color = value >= 80 ? CONFIG.COLORS.PLAYER_GOLD : CONFIG.COLORS.PLAYER_BLUE;
        this.speed = 0;
        this.maxSpeed = 12;
    }
    update(player, dt) {
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        if (dist < player.pickupRange || player.vacuumTimer > 0) {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            this.speed = Math.min(this.maxSpeed, this.speed + 0.7 * dt);
            this.x += Math.cos(angle) * this.speed * dt;
            this.y += Math.sin(angle) * this.speed * dt;
        }
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = this.color + '55';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

class PowerUp {
    constructor(x, y, kind) {
        this.x = x;
        this.y = y;
        this.kind = kind;
        this.radius = 12;
        this.life = 12000;
        this.bob = Math.random() * Math.PI * 2;
        const meta = {
            health: { color: '#3dff88', label: 'HP' },
            bomb: { color: '#ff5a36', label: 'NOVA' },
            magnet: { color: '#7ecbff', label: 'VAC' }
        }[kind];
        this.color = meta.color;
        this.label = meta.label;
    }
    update(dt) {
        this.life -= 16.67 * dt;
        this.bob += 0.08 * dt;
    }
    draw() {
        const pulse = 1 + Math.sin(this.bob) * 0.08;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * pulse, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life < 2500 ? 0.45 + Math.sin(this.bob * 6) * 0.25 : 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#041018';
        ctx.font = '700 9px "Space Grotesk", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.label, this.x, this.y);
        ctx.textBaseline = 'alphabetic';
    }
}

class Projectile {
    constructor(x, y, angle, speed, damage, isCrit = false) {
        this.id = GAME.nextShotId++;
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = speed;
        this.damage = isCrit ? damage * 2 : damage;
        this.radius = isCrit ? 6 : 4;
        this.isCrit = isCrit;
        this.piercing = false;
        this.hitIds = new Set();
        this.onHit = null;
        this.life = 1.6;
    }
    update(dt) {
        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;
    }
    draw() {
        let color = this.piercing ? CONFIG.COLORS.PIERCING : CONFIG.COLORS.PLAYER_BLUE;
        if (this.isCrit) color = CONFIG.COLORS.CRIT;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        if (this.piercing) {
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x - Math.cos(this.angle) * 36, this.y - Math.sin(this.angle) * 36);
            ctx.strokeStyle = color + '66';
            ctx.lineWidth = this.radius * 2;
            ctx.stroke();
        }
    }
}

class Missile extends Projectile {
    constructor(x, y, angle, speed, damage) {
        super(x, y, angle, speed, damage);
        this.target = null;
        this.turnSpeed = 0.12;
        this.radius = 5;
    }
    update(dt) {
        if (!this.target || !GAME.entities.enemies.includes(this.target)) {
            let minDist = Infinity;
            for (const e of GAME.entities.enemies) {
                const d = Math.hypot(e.x - this.x, e.y - this.y);
                if (d < minDist) {
                    minDist = d;
                    this.target = e;
                }
            }
        }
        if (this.target) {
            const desired = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            let diff = desired - this.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            this.angle += Math.sign(diff) * Math.min(Math.abs(diff), this.turnSpeed * dt);
        }
        super.update(dt);
        if (Math.random() > 0.4) {
            GAME.entities.particles.push(new Particle(
                this.x - Math.cos(this.angle) * 6,
                this.y - Math.sin(this.angle) * 6,
                '#ffb347'
            ));
        }
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#ffb347';
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-8, 4);
        ctx.lineTo(-8, -4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

class EnemyShot {
    constructor(x, y, angle, speed = 3.4, damage = 8) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = speed;
        this.damage = damage;
        this.radius = 5;
    }
    update(dt) {
        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ff9d00';
        ctx.fill();
    }
}

class BlackHole {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.life = 180;
        this.pullForce = 2.2;
        this.dps = 28;
    }
    update(dt) {
        this.life -= dt;
        if (this.life > 150) this.radius = Math.min(62, this.radius + 2 * dt);
        if (this.life < 30) this.radius = Math.max(0, this.radius - 2 * dt);

        for (let i = GAME.entities.enemies.length - 1; i >= 0; i--) {
            const e = GAME.entities.enemies[i];
            const dist = Math.hypot(this.x - e.x, this.y - e.y);
            if (dist < 170) {
                const angle = Math.atan2(this.y - e.y, this.x - e.x);
                e.x += Math.cos(angle) * this.pullForce * dt;
                e.y += Math.sin(angle) * this.pullForce * dt;
            }
            if (dist < Math.max(18, this.radius * 0.85)) {
                damageEnemy(e, this.dps * 0.01667 * dt, false);
            }
        }
    }
    draw() {
        if (this.radius <= 0) return;
        const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
        grad.addColorStop(0, 'black');
        grad.addColorStop(0.7, CONFIG.COLORS.PLAYER_PURPLE);
        grad.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
    }
}

class Enemy {
    constructor(x, y, type = 'grunt', scale = 1) {
        const spec = ENEMY_TYPES[type];
        this.id = GAME.nextEnemyId++;
        this.x = x;
        this.y = y;
        this.type = type;
        this.radius = spec.radius;
        this.speed = spec.speed * (0.92 + Math.random() * 0.16);
        this.hp = Math.round(spec.hp * scale);
        this.maxHp = this.hp;
        this.color = spec.color;
        this.xpValue = Math.round(spec.xp * Math.sqrt(scale));
        this.scoreValue = spec.score;
        this.contactDamage = spec.damage;
        this.canShoot = !!spec.shoot;
        this.angle = 0;
        this.passThroughTimer = 0;
        this.shootTimer = rand(700, 1600);
        this.hitFlash = 0;
    }
    update(player, dt) {
        this.hitFlash = Math.max(0, this.hitFlash - dt);
        if (this.passThroughTimer > 0) {
            this.x += Math.cos(this.angle) * this.speed * 1.7 * dt;
            this.y += Math.sin(this.angle) * this.speed * 1.7 * dt;
            this.passThroughTimer -= dt;
            return;
        }

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy) || 1;
        this.angle = Math.atan2(dy, dx);

        if (this.canShoot && dist < 420) {
            this.shootTimer -= 16.67 * dt;
            if (this.shootTimer <= 0) {
                GAME.entities.enemyShots.push(new EnemyShot(this.x, this.y, this.angle, 3.2 + GAME.wave * 0.05, 9));
                this.shootTimer = Math.max(700, 1500 - GAME.wave * 40);
            }
            if (dist < 220) {
                this.x -= Math.cos(this.angle) * this.speed * 0.55 * dt;
                this.y -= Math.sin(this.angle) * this.speed * 0.55 * dt;
                return;
            }
        }

        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.beginPath();
        if (this.type === 'brute') {
            ctx.moveTo(this.radius + 4, 0);
            ctx.lineTo(8, this.radius);
            ctx.lineTo(-this.radius, this.radius * 0.7);
            ctx.lineTo(-this.radius * 0.6, 0);
            ctx.lineTo(-this.radius, -this.radius * 0.7);
            ctx.lineTo(8, -this.radius);
        } else if (this.type === 'scout') {
            ctx.moveTo(this.radius + 6, 0);
            ctx.lineTo(-this.radius, this.radius * 0.7);
            ctx.lineTo(-this.radius * 0.4, 0);
            ctx.lineTo(-this.radius, -this.radius * 0.7);
        } else if (this.type === 'elite') {
            ctx.moveTo(this.radius + 6, 0);
            ctx.lineTo(10, this.radius);
            ctx.lineTo(-this.radius, this.radius * 0.5);
            ctx.lineTo(-this.radius * 0.4, 0);
            ctx.lineTo(-this.radius, -this.radius * 0.5);
            ctx.lineTo(10, -this.radius);
        } else {
            ctx.moveTo(this.radius, 0);
            ctx.lineTo(5, this.radius * 0.8);
            ctx.lineTo(-this.radius, this.radius * 0.5);
            ctx.lineTo(-this.radius, -this.radius * 0.5);
            ctx.lineTo(5, -this.radius * 0.8);
        }
        ctx.closePath();
        ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : this.color;
        ctx.fill();
        ctx.restore();

        if (this.hp < this.maxHp && (this.type === 'brute' || this.type === 'elite' || this.hp / this.maxHp < 0.5)) {
            const w = this.radius * 2;
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillRect(this.x - w / 2, this.y - this.radius - 10, w, 4);
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x - w / 2, this.y - this.radius - 10, w * clamp(this.hp / this.maxHp, 0, 1), 4);
        }
    }
}

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
        this.skillLevels = {
            fireRate: 0, damage: 0, speed: 0, health: 0, multiShot: 0,
            magnet: 0, wingCannons: 0, plasmaBeam: 0, shieldGen: 0,
            critCore: 0, homing: 0, overdrive: 0, blackHole: 0, phantom: 0,
            backCannon: 0, dashMaster: 0
        };
        this.wingCannons = false;
        this.plasmaBeam = false;
        this.backCannon = false;
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
        this.dashTimer = 0;
        this.dashCooldown = 0;
        this.dashCooldownMax = CONFIG.PLAYER.DASH_COOLDOWN;
        this.dashBoost = 1;
        this.dashDirX = 0;
        this.dashDirY = 0;
        this.invulnerable = 0;
        this.flash = 0;
        this.vacuumTimer = 0;
        this.moveX = 0;
        this.moveY = 0;
    }
    update(now, dt) {
        this.handleShield(dt);
        this.handleInput(dt);
        this.handleCombat(now);
        this.flash = Math.max(0, this.flash - dt);
        this.invulnerable = Math.max(0, this.invulnerable - 16.67 * dt);
        this.vacuumTimer = Math.max(0, this.vacuumTimer - 16.67 * dt);
        if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - 16.67 * dt);
        if (this.dashTimer > 0) this.dashTimer = Math.max(0, this.dashTimer - 16.67 * dt);
    }
    handleShield(dt) {
        if (this.shieldEnabled && !this.shieldActive && this.shieldCooldown <= 0) {
            this.shieldActive = true;
        }
        if (this.shieldCooldown > 0) this.shieldCooldown -= 16.67 * dt;
    }
    handleInput(dt) {
        this.angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
        let dx = 0;
        let dy = 0;
        if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) dx += 1;

        if (dx !== 0 || dy !== 0) {
            const mag = Math.hypot(dx, dy);
            dx /= mag;
            dy /= mag;
        }

        if (keys['Space'] && this.dashCooldown <= 0 && this.dashTimer <= 0) {
            this.dashTimer = CONFIG.PLAYER.DASH_DURATION;
            this.dashCooldown = this.dashCooldownMax;
            this.invulnerable = CONFIG.PLAYER.DASH_DURATION + 80;
            if (dx !== 0 || dy !== 0) {
                this.dashDirX = dx;
                this.dashDirY = dy;
            } else {
                this.dashDirX = Math.cos(this.angle);
                this.dashDirY = Math.sin(this.angle);
            }
            AudioFX.dash();
            createExplosion(this.x, this.y, CONFIG.COLORS.PLAYER_BLUE, 10);
        }

        if (this.dashTimer > 0) {
            dx = this.dashDirX;
            dy = this.dashDirY;
        }

        this.moveX = dx;
        this.moveY = dy;

        const dashing = this.dashTimer > 0;
        const speed = dashing ? CONFIG.PLAYER.DASH_SPEED * this.dashBoost : this.speed;
        if (dx !== 0 || dy !== 0) {
            this.x += dx * speed * dt;
            this.y += dy * speed * dt;
            if (Math.random() > (dashing ? 0.15 : 0.45)) {
                GAME.entities.particles.push(new Particle(
                    this.x - Math.cos(this.angle) * 15,
                    this.y - Math.sin(this.angle) * 15,
                    dashing ? 'rgba(255,255,255,0.8)' : 'rgba(0, 243, 255, 0.5)'
                ));
            }
        }

        this.x = clamp(this.x, this.radius, canvas.width - this.radius);
        this.y = clamp(this.y, this.radius, canvas.height - this.radius);
    }
    handleCombat(now) {
        let currentFireRate = this.fireRate;
        if (this.overdrivePassive && this.hp < this.maxHp * 0.3) currentFireRate *= 0.5;
        if (now - this.lastShot > currentFireRate) {
            this.shoot();
            this.lastShot = now;
            AudioFX.shoot();
        }
        if (this.homingEnabled && now - this.lastHomingMissile > 3000) {
            GAME.entities.projectiles.push(new Missile(this.x, this.y, this.angle, 6.5, this.damage * 1.6));
            this.lastHomingMissile = now;
            AudioFX.missile();
        }
    }
    shoot() {
        const fire = (angle, offsetX = 0, offsetY = 0) => {
            const s = Math.sin(this.angle);
            const c = Math.cos(this.angle);
            const rx = this.x + (offsetX * c - offsetY * s);
            const ry = this.y + (offsetX * s + offsetY * c);
            const isCrit = Math.random() < this.critChance;
            const isBlackHole = Math.random() < this.blackHoleChance;
            const spawn = (shotAngle, dmg) => {
                const proj = new Projectile(rx, ry, shotAngle, this.projectileSpeed, dmg, isCrit);
                if (isBlackHole) proj.onHit = (hx, hy) => GAME.entities.blackHoles.push(new BlackHole(hx, hy));
                if (this.plasmaBeam) proj.piercing = true;
                GAME.entities.projectiles.push(proj);
            };
            spawn(angle, this.damage);
            for (let i = 1; i <= this.multiShot; i++) {
                const side = i % 2 === 0 ? 1 : -1;
                const spread = Math.ceil(i / 2) * 0.16 * side;
                spawn(angle + spread, this.damage * 0.8);
            }
        };
        fire(this.angle, 20, 0);
        if (this.wingCannons) {
            fire(this.angle, 5, 20);
            fire(this.angle, 5, -20);
        }
        if (this.backCannon) fire(this.angle + Math.PI, -15, 0);
    }
    tryHurt(amount, source) {
        if (this.invulnerable > 0) return false;
        if (this.shieldActive) {
            this.shieldActive = false;
            this.shieldCooldown = this.shieldMaxCooldown;
            this.invulnerable = 250;
            spawnFloater(this.x, this.y - 24, 'SHIELD', CONFIG.COLORS.PLAYER_BLUE);
            AudioFX.hit();
            if (source) source.passThroughTimer = 45;
            return false;
        }
        if (Math.random() < this.dodgeChance) {
            this.invulnerable = 200;
            spawnFloater(this.x, this.y - 24, 'DODGE', CONFIG.COLORS.PLAYER_GOLD);
            if (source) source.passThroughTimer = 45;
            return false;
        }
        this.hp -= amount;
        this.flash = 8;
        this.invulnerable = 320;
        shake(10);
        AudioFX.hit();
        if (source) source.passThroughTimer = 50;
        if (this.hp <= 0) {
            this.hp = 0;
            endGame();
        }
        return true;
    }
    collectPower(kind) {
        AudioFX.power();
        if (kind === 'health') {
            const heal = Math.round(this.maxHp * 0.35);
            this.hp = Math.min(this.maxHp, this.hp + heal);
            spawnFloater(this.x, this.y - 20, `+${heal} HP`, '#3dff88');
        } else if (kind === 'bomb') {
            spawnFloater(this.x, this.y - 20, 'NOVA', '#ff5a36');
            shake(14);
            for (let i = GAME.entities.enemies.length - 1; i >= 0; i--) {
                const e = GAME.entities.enemies[i];
                if (Math.hypot(e.x - this.x, e.y - this.y) < 280) {
                    damageEnemy(e, 55 + this.damage * 2, true);
                }
            }
            GAME.entities.enemyShots.length = 0;
            createExplosion(this.x, this.y, '#ff5a36', 28);
        } else if (kind === 'magnet') {
            this.vacuumTimer = 2200;
            spawnFloater(this.x, this.y - 20, 'VACUUM', '#7ecbff');
        }
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        let shipColor = CONFIG.COLORS.PLAYER_BLUE;
        if (this.skillLevels.overdrive > 0 || this.skillLevels.blackHole > 0 || this.skillLevels.phantom > 0) {
            shipColor = CONFIG.COLORS.PLAYER_GOLD;
        } else if (this.wingCannons || this.plasmaBeam || this.shieldEnabled || this.backCannon) {
            shipColor = CONFIG.COLORS.PLAYER_PURPLE;
        }
        if (this.flash > 0) shipColor = '#ffffff';

        if (this.wingCannons) {
            ctx.fillStyle = shipColor;
            ctx.fillRect(0, 15, 10, 5);
            ctx.fillRect(0, -20, 10, 5);
        }
        if (this.backCannon) {
            ctx.fillStyle = CONFIG.COLORS.PLAYER_BLUE;
            ctx.fillRect(-18, -3, 12, 6);
        }
        const moving = this.moveX !== 0 || this.moveY !== 0 || this.dashTimer > 0;
        if (moving) {
            ctx.beginPath();
            ctx.moveTo(-15, 0);
            ctx.lineTo(-28 - Math.random() * 12, 0);
            ctx.strokeStyle = this.dashTimer > 0 ? '#ffffff' : CONFIG.COLORS.PLAYER_BLUE;
            ctx.lineWidth = this.dashTimer > 0 ? 6 : 4;
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.lineTo(-15, -15);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-15, 15);
        ctx.closePath();
        ctx.fillStyle = shipColor;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(4, 0, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#041018';
        ctx.fill();
        ctx.restore();

        if (this.shieldActive) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 12, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 243, 255, 0.7)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = 'rgba(0, 243, 255, 0.08)';
            ctx.fill();
        }
        if (this.overdrivePassive && this.hp < this.maxHp * 0.3) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 18, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 223, 0, 0.35)';
            ctx.stroke();
        }
    }
}

const player = new Player();
const stars = [
    ...Array.from({ length: 70 }, () => new Star(1)),
    ...Array.from({ length: 50 }, () => new Star(2)),
    ...Array.from({ length: 30 }, () => new Star(3))
];

function pickEnemyType(wave) {
    const roll = Math.random();
    if (wave >= 8 && roll > 0.97) return 'elite';
    if (wave >= 4 && roll > 0.82) return 'brute';
    if (wave >= 3 && roll > 0.62) return 'spitter';
    if (wave >= 2 && roll > 0.38) return 'scout';
    return 'grunt';
}

function spawnEnemy(type = pickEnemyType(GAME.wave)) {
    const side = Math.floor(Math.random() * 4);
    let x;
    let y;
    if (side === 0) { x = Math.random() * canvas.width; y = -50; }
    else if (side === 1) { x = canvas.width + 50; y = Math.random() * canvas.height; }
    else if (side === 2) { x = Math.random() * canvas.width; y = canvas.height + 50; }
    else { x = -50; y = Math.random() * canvas.height; }
    if (GAME.entities.enemies.length >= 90) return;
    const scale = 1 + (GAME.wave - 1) * 0.16;
    GAME.entities.enemies.push(new Enemy(x, y, type, scale));
}

function maybeDropPowerup(x, y) {
    if (Math.random() > 0.11) return;
    const kinds = ['health', 'bomb', 'magnet'];
    GAME.entities.powerups.push(new PowerUp(x, y, kinds[Math.floor(Math.random() * kinds.length)]));
}

function damageEnemy(enemy, amount, isCrit) {
    enemy.hp -= amount;
    enemy.hitFlash = 4;
    spawnFloater(enemy.x, enemy.y - enemy.radius, String(Math.round(amount)), isCrit ? CONFIG.COLORS.CRIT : '#ffffff');
    if (enemy.hp > 0) return false;
    GAME.kills += 1;
    bumpCombo();
    const gained = addScore(enemy.scoreValue);
    spawnFloater(enemy.x, enemy.y, `+${gained}`, CONFIG.COLORS.PLAYER_GOLD);
    GAME.entities.xpOrbs.push(new XPOrb(enemy.x, enemy.y, enemy.xpValue));
    maybeDropPowerup(enemy.x, enemy.y);
    createExplosion(enemy.x, enemy.y, enemy.color, enemy.type === 'elite' ? 28 : 14);
    AudioFX.explode();
    const idx = GAME.entities.enemies.indexOf(enemy);
    if (idx !== -1) GAME.entities.enemies.splice(idx, 1);
    return true;
}

function grantXp(value) {
    GAME.xp += value;
    while (GAME.xp >= GAME.xpToNextLevel) {
        GAME.xp -= GAME.xpToNextLevel;
        GAME.level += 1;
        GAME.xpToNextLevel = Math.floor(GAME.xpToNextLevel * 1.45);
        GAME.pendingLevelUps += 1;
    }
    if (GAME.pendingLevelUps > 0 && GAME.mode === 'playing') {
        UIManager.showUpgradeMenu();
    }
}

const EntityManager = {
    update(dt) {
        const { projectiles, enemies, particles, blackHoles, xpOrbs, enemyShots, powerups, floaters } = GAME.entities;
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            p.update(dt);
            if (p.x < -60 || p.x > canvas.width + 60 || p.y < -60 || p.y > canvas.height + 60) {
                projectiles.splice(i, 1);
            }
        }
        for (const e of enemies) e.update(player, dt);
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update(dt);
            if (particles[i].life <= 0) particles.splice(i, 1);
        }
        for (let i = blackHoles.length - 1; i >= 0; i--) {
            blackHoles[i].update(dt);
            if (blackHoles[i].life <= 0) blackHoles.splice(i, 1);
        }
        for (const orb of xpOrbs) orb.update(player, dt);
        for (let i = enemyShots.length - 1; i >= 0; i--) {
            const shot = enemyShots[i];
            shot.update(dt);
            if (shot.x < -40 || shot.x > canvas.width + 40 || shot.y < -40 || shot.y > canvas.height + 40) {
                enemyShots.splice(i, 1);
            }
        }
        for (let i = powerups.length - 1; i >= 0; i--) {
            powerups[i].update(dt);
            if (powerups[i].life <= 0) powerups.splice(i, 1);
        }
        for (let i = floaters.length - 1; i >= 0; i--) {
            floaters[i].update(dt);
            if (floaters[i].life <= 0) floaters.splice(i, 1);
        }
        this.checkCollisions();
    },
    draw() {
        const { particles, blackHoles, xpOrbs, projectiles, enemies, enemyShots, powerups, floaters } = GAME.entities;
        particles.forEach((p) => p.draw());
        blackHoles.forEach((bh) => bh.draw());
        xpOrbs.forEach((orb) => orb.draw());
        powerups.forEach((p) => p.draw());
        enemyShots.forEach((s) => s.draw());
        projectiles.forEach((p) => p.draw());
        enemies.forEach((e) => e.draw());
        player.draw();
        floaters.forEach((f) => f.draw());
    },
    checkCollisions() {
        const { projectiles, enemies, xpOrbs, enemyShots, powerups } = GAME.entities;

        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            let hit = false;
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j];
                if (p.hitIds.has(e.id)) continue;
                if (Math.hypot(p.x - e.x, p.y - e.y) < p.radius + e.radius) {
                    p.hitIds.add(e.id);
                    if (p.onHit) p.onHit(p.x, p.y);
                    damageEnemy(e, p.damage, p.isCrit);
                    if (!p.piercing) {
                        hit = true;
                        break;
                    }
                }
            }
            if (hit) projectiles.splice(i, 1);
        }

        for (let i = xpOrbs.length - 1; i >= 0; i--) {
            const orb = xpOrbs[i];
            if (Math.hypot(player.x - orb.x, player.y - orb.y) < player.radius + orb.radius + 4) {
                grantXp(orb.value);
                AudioFX.pickup();
                xpOrbs.splice(i, 1);
            }
        }

        for (let i = powerups.length - 1; i >= 0; i--) {
            const item = powerups[i];
            if (Math.hypot(player.x - item.x, player.y - item.y) < player.radius + item.radius + 6) {
                player.collectPower(item.kind);
                powerups.splice(i, 1);
            }
        }

        for (let i = enemyShots.length - 1; i >= 0; i--) {
            const shot = enemyShots[i];
            if (Math.hypot(player.x - shot.x, player.y - shot.y) < player.radius + shot.radius) {
                player.tryHurt(shot.damage);
                enemyShots.splice(i, 1);
            }
        }

        for (const e of enemies) {
            if (e.passThroughTimer > 0) continue;
            if (Math.hypot(player.x - e.x, player.y - e.y) < player.radius + e.radius) {
                player.tryHurt(e.contactDamage, e);
            }
        }
    }
};

function showWaveBanner(title, sub) {
    document.getElementById('wave-banner-title').textContent = title;
    document.getElementById('wave-banner-sub').textContent = sub;
    waveBanner.classList.remove('hidden');
    waveBanner.style.animation = 'none';
    void waveBanner.offsetWidth;
    waveBanner.style.animation = '';
    setTimeout(() => waveBanner.classList.add('hidden'), 2200);
}

function beginWave(wave) {
    GAME.wave = wave;
    GAME.waveTimer = 0;
    GAME.restTimer = 0;
    GAME.spawnRate = Math.max(CONFIG.ENEMY.SPAWN_RATE_MIN, CONFIG.ENEMY.SPAWN_RATE_START * Math.pow(0.92, wave - 1));
    GAME.waveLength = 18000 + wave * 1600;
    const elite = wave % 5 === 0;
    showWaveBanner(`WAVE ${wave}`, elite ? 'Elite signature detected' : 'Hold the sector');
    AudioFX.wave();
    if (elite) spawnEnemy('elite');
}

const UIManager = {
    update() {
        scoreText.textContent = GAME.score.toLocaleString();
        levelText.textContent = `LVL ${GAME.level}`;
        waveText.textContent = `WAVE ${GAME.wave}`;
        killsText.textContent = `${GAME.kills} KILLS`;
        timeText.textContent = formatTime(GAME.elapsed);
        hiscoreText.textContent = `BEST ${GAME.highScore.toLocaleString()}`;
        xpFill.style.width = `${clamp((GAME.xp / GAME.xpToNextLevel) * 100, 0, 100)}%`;
        healthFill.style.width = `${clamp((player.hp / player.maxHp) * 100, 0, 100)}%`;
        dashFill.style.width = `${clamp((1 - player.dashCooldown / player.dashCooldownMax) * 100, 0, 100)}%`;
        document.getElementById('health-text').textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
        healthBar.classList.toggle('overdrive', player.overdrivePassive && player.hp < player.maxHp * 0.3);
        if (GAME.combo >= 1.5 && GAME.comboTimer > 0) {
            comboText.classList.remove('hidden');
            comboText.textContent = `COMBO x${GAME.combo.toFixed(2)}`;
        } else {
            comboText.classList.add('hidden');
        }
        document.getElementById('menu-hiscore').textContent = `BEST SCORE ${GAME.highScore.toLocaleString()}`;
    },
    showUpgradeMenu() {
        if (GAME.mode !== 'playing' && GAME.mode !== 'upgrade') return;
        GAME.mode = 'upgrade';
        GAME.pendingLevelUps = Math.max(0, GAME.pendingLevelUps - 1);
        upgradeMenu.classList.remove('hidden');
        upgradeOptions.innerHTML = '';
        AudioFX.level();

        const available = SKILLS.filter((s) => {
            const current = player.skillLevels[s.id] || 0;
            if (current >= s.maxLevel) return false;
            if (s.prereq && !s.prereq(player)) return false;
            return true;
        });

        if (available.length === 0) {
            player.maxHp += 15;
            player.hp = Math.min(player.maxHp, player.hp + 25);
            player.damage += 2;
            spawnFloater(player.x, player.y - 30, 'OVERCLOCK +HP/DMG', CONFIG.COLORS.PLAYER_GOLD);
            this.closeUpgradeMenu();
            return;
        }

        const selected = [...available].sort(() => 0.5 - Math.random()).slice(0, 3);
        selected.forEach((skill) => {
            const level = (player.skillLevels[skill.id] || 0) + 1;
            const btn = document.createElement('button');
            btn.className = 'upgrade-btn';
            btn.type = 'button';
            btn.dataset.tier = skill.tier;
            btn.innerHTML = `
                <div>
                    <div class="name">${skill.name} <span style="font-size: 0.8em; opacity: 0.6">Lv.${level}</span></div>
                    <div class="desc">${skill.desc}</div>
                </div>
                <div class="arrow">→</div>
            `;
            btn.onclick = () => {
                skill.effect(player);
                this.closeUpgradeMenu();
            };
            upgradeOptions.appendChild(btn);
        });
    },
    closeUpgradeMenu() {
        upgradeMenu.classList.add('hidden');
        if (GAME.pendingLevelUps > 0) {
            this.showUpgradeMenu();
            return;
        }
        if (GAME.mode === 'gameover') return;
        GAME.mode = 'playing';
    }
};

function clearEntities() {
    GAME.entities.enemies.length = 0;
    GAME.entities.projectiles.length = 0;
    GAME.entities.enemyShots.length = 0;
    GAME.entities.particles.length = 0;
    GAME.entities.xpOrbs.length = 0;
    GAME.entities.blackHoles.length = 0;
    GAME.entities.powerups.length = 0;
    GAME.entities.floaters.length = 0;
}

function resetRun() {
    GAME.score = 0;
    GAME.level = 1;
    GAME.xp = 0;
    GAME.xpToNextLevel = 100;
    GAME.kills = 0;
    GAME.wave = 1;
    GAME.elapsed = 0;
    GAME.spawnTimer = 0;
    GAME.spawnRate = CONFIG.ENEMY.SPAWN_RATE_START;
    GAME.combo = 1;
    GAME.comboTimer = 0;
    GAME.pendingLevelUps = 0;
    GAME.nextEnemyId = 1;
    camera.trauma = 0;
    clearEntities();
    player.reset();
}

function startGame() {
    AudioFX.init();
    if (AudioFX.ctx && AudioFX.ctx.state === 'suspended') AudioFX.ctx.resume();
    resetRun();
    GAME.mode = 'playing';
    startScreen.classList.add('hidden');
    pauseMenu.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    upgradeMenu.classList.add('hidden');
    hud.classList.remove('hidden');
    beginWave(1);
}

function returnToMenu() {
    GAME.mode = 'menu';
    clearEntities();
    hud.classList.add('hidden');
    pauseMenu.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    upgradeMenu.classList.add('hidden');
    waveBanner.classList.add('hidden');
    startScreen.classList.remove('hidden');
    UIManager.update();
}

function togglePause() {
    if (GAME.mode === 'playing') {
        GAME.mode = 'paused';
        pauseMenu.classList.remove('hidden');
    } else if (GAME.mode === 'paused') {
        GAME.mode = 'playing';
        pauseMenu.classList.add('hidden');
    }
}

function endGame() {
    GAME.mode = 'gameover';
    upgradeMenu.classList.add('hidden');
    pauseMenu.classList.add('hidden');
    createExplosion(player.x, player.y, CONFIG.COLORS.PLAYER_BLUE, 30);
    document.getElementById('final-score').textContent = `Score: ${GAME.score.toLocaleString()}`;
    document.getElementById('final-stats').innerHTML = `
        <span>WAVE ${GAME.wave}</span>
        <span>${GAME.kills} KILLS</span>
        <span>${formatTime(GAME.elapsed)}</span>
        <span>BEST ${GAME.highScore.toLocaleString()}</span>
    `;
    gameOverScreen.classList.remove('hidden');
    AudioFX.explode();
}

function updateWaves(dt) {
    if (GAME.restTimer > 0) {
        GAME.restTimer -= 16.67 * dt;
        if (GAME.restTimer <= 0) beginWave(GAME.wave + 1);
        return;
    }
    GAME.waveTimer += 16.67 * dt;
    GAME.spawnTimer += 16.67 * dt;
    if (GAME.spawnTimer > GAME.spawnRate) {
        const burst = GAME.wave >= 6 && Math.random() < 0.18 ? 2 : 1;
        for (let i = 0; i < burst; i++) spawnEnemy();
        GAME.spawnTimer = 0;
        GAME.spawnRate = Math.max(CONFIG.ENEMY.SPAWN_RATE_MIN, GAME.spawnRate * 0.992);
    }
    if (GAME.waveTimer >= GAME.waveLength && GAME.entities.enemies.length <= 6) {
        GAME.restTimer = 2400;
        showWaveBanner('SECTOR CLEAR', 'Weapons free — next wave inbound');
    }
}

function drawBackdrop() {
    ctx.fillStyle = '#05050c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const g = ctx.createRadialGradient(canvas.width * 0.7, canvas.height * 0.2, 20, canvas.width * 0.7, canvas.height * 0.2, 380);
    g.addColorStop(0, 'rgba(80, 20, 140, 0.18)');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

let lastTime = performance.now();
function gameLoop(now) {
    const raw = now - lastTime;
    lastTime = now;
    const dt = Math.min(2.2, raw / 16.67);

    drawBackdrop();
    stars.forEach((s) => {
        if (GAME.mode !== 'paused' && GAME.mode !== 'upgrade') s.update(dt);
        s.draw();
    });

    if (GAME.mode === 'playing') {
        GAME.elapsed += raw;
        if (GAME.comboTimer > 0) {
            GAME.comboTimer -= raw;
            if (GAME.comboTimer <= 0) GAME.combo = 1;
        }
        if (camera.trauma > 0) camera.trauma = Math.max(0, camera.trauma - 0.65 * dt);
        camera.x = (Math.random() - 0.5) * camera.trauma;
        camera.y = (Math.random() - 0.5) * camera.trauma;
        ctx.save();
        ctx.translate(camera.x, camera.y);
        updateWaves(dt);
        player.update(now, dt);
        EntityManager.update(dt);
        EntityManager.draw();
        ctx.restore();
    } else {
        camera.x = 0;
        camera.y = 0;
        if (GAME.mode === 'menu') {
            player.x = canvas.width / 2;
            player.y = canvas.height * 0.62;
            player.angle += 0.008 * dt;
            player.draw();
        } else {
            EntityManager.draw();
        }
    }

    if (GAME.mode !== 'menu') UIManager.update();
    requestAnimationFrame(gameLoop);
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('pause-restart-btn').addEventListener('click', returnToMenu);

UIManager.update();
requestAnimationFrame(gameLoop);
