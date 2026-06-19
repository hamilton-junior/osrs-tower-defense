import type { GameEngine } from './engine';

/**
 * All Canvas 2D drawing for a game frame. Holds a reference to the owning
 * {@link GameEngine} and reads its state through `this.e` — the renderer keeps
 * no game state of its own, so swapping render backends never touches game logic.
 */
export class GameRenderer {
  constructor(private e: GameEngine) {}

  drawPath() {
    if (!this.e.ctx) return;
    this.e.ctx.beginPath();
    if (this.e.theme === 'sand') this.e.ctx.strokeStyle = '#8d7b4f';
    else if (this.e.theme === 'dark') this.e.ctx.strokeStyle = '#000000';
    else this.e.ctx.strokeStyle = '#3d2b1f';
    this.e.ctx.lineWidth = 46;
    if (this.e.path.length > 0) {
      this.e.ctx.moveTo(this.e.path[0].x, this.e.path[0].y);
      for (let i = 1; i < this.e.path.length; i++) this.e.ctx.lineTo(this.e.path[i].x, this.e.path[i].y);
    }
    this.e.ctx.stroke();

    this.e.ctx.beginPath();
    if (this.e.theme === 'sand') this.e.ctx.strokeStyle = '#a69466';
    else if (this.e.theme === 'dark') this.e.ctx.strokeStyle = '#222222';
    else this.e.ctx.strokeStyle = '#5d4037';
    this.e.ctx.lineWidth = 40;
    if (this.e.path.length > 0) {
      this.e.ctx.moveTo(this.e.path[0].x, this.e.path[0].y);
      for (let i = 1; i < this.e.path.length; i++) this.e.ctx.lineTo(this.e.path[i].x, this.e.path[i].y);
    }
    this.e.ctx.stroke();

    this.e.ctx.beginPath();
    if (this.e.theme === 'sand') this.e.ctx.strokeStyle = '#b8a473';
    else if (this.e.theme === 'dark') this.e.ctx.strokeStyle = '#331111';
    else this.e.ctx.strokeStyle = '#795548';
    this.e.ctx.lineWidth = 32;
    if (this.e.path.length > 0) {
      this.e.ctx.moveTo(this.e.path[0].x, this.e.path[0].y);
      for (let i = 1; i < this.e.path.length; i++) this.e.ctx.lineTo(this.e.path[i].x, this.e.path[i].y);
    }
    this.e.ctx.stroke();
  }

  drawAmbientEffects() {
    if (this.e.currentRegion === 'morytania') {
       this.e.ctx.fillStyle = 'rgba(0, 20, 20, 0.2)';
       this.e.ctx.fillRect(0, 0, this.e.LOGIC_WIDTH, this.e.LOGIC_HEIGHT);
    } else if (this.e.currentRegion === 'wilderness') {
       this.e.ctx.fillStyle = 'rgba(50, 0, 0, 0.1)';
       this.e.ctx.fillRect(0, 0, this.e.LOGIC_WIDTH, this.e.LOGIC_HEIGHT);
    } else if (this.e.currentRegion === 'karamja') {
       this.e.ctx.fillStyle = 'rgba(255, 255, 0, 0.05)';
       this.e.ctx.fillRect(0, 0, this.e.LOGIC_WIDTH, this.e.LOGIC_HEIGHT);
    }
  }

  draw() {
    if (!this.e.ctx || !this.e.canvas || this.e.canvas.width === 0 || this.e.canvas.height === 0) return;
    
    const w = this.e.LOGIC_WIDTH;
    const h = this.e.LOGIC_HEIGHT;
    
    try {
      this.e.ctx.save();
      
      // Scale everything to fit the logic dimensions into the actual canvas resolution
      const scaleX = this.e.canvas.width / w;
      const scaleY = this.e.canvas.height / h;
      this.e.ctx.scale(scaleX, scaleY);
      this.e.ctx.imageSmoothingEnabled = false;
      
      // Apply Shake
      if (this.e.shakeAmount > 0) {
        this.e.ctx.translate((Math.random() - 0.5) * this.e.shakeAmount, (Math.random() - 0.5) * this.e.shakeAmount);
      }

      // Draw Background Theme
      if (this.e.theme === 'grass') {
        this.e.ctx.fillStyle = '#2d4c1e'; // Dark grass
        this.e.ctx.fillRect(0, 0, w, h);
        
        // Grass tufts
        this.e.ctx.fillStyle = '#3a5f27';
        for (let i = 0; i < 100; i++) {
          const tx = (i * 137.5) % w;
          const ty = (i * 224.7) % h;
          this.e.ctx.fillRect(tx, ty, 2, 2);
          this.e.ctx.fillRect(tx + 2, ty + 2, 2, 4);
        }
      } else if (this.e.theme === 'sand') {
        this.e.ctx.fillStyle = '#c2ae78'; // Sand
        this.e.ctx.fillRect(0, 0, w, h);
        
        // Dunes/Sand ripples
        this.e.ctx.strokeStyle = '#b3a069';
        this.e.ctx.lineWidth = 1;
        for (let i = 0; i < 30; i++) {
          const ty = (i * 47.3) % h;
          this.e.ctx.beginPath();
          this.e.ctx.moveTo(0, ty);
          for (let x = 0; x < w; x += 20) {
            this.e.ctx.lineTo(x, ty + Math.sin(x * 0.05 + i) * 5);
          }
          this.e.ctx.stroke();
        }
      } else if (this.e.theme === 'dark') {
        this.e.ctx.fillStyle = '#1a1a1a'; // Dark/Wilderness
        this.e.ctx.fillRect(0, 0, w, h);
        
        // Cracks/Lava
        this.e.ctx.strokeStyle = '#331111';
        this.e.ctx.lineWidth = 2;
        for (let i = 0; i < 20; i++) {
          const tx = (i * 231.5) % w;
          const ty = (i * 157.7) % h;
          this.e.ctx.beginPath();
          this.e.ctx.moveTo(tx, ty);
          this.e.ctx.lineTo(tx + 40, ty + 30);
          this.e.ctx.lineTo(tx + 10, ty + 60);
          this.e.ctx.stroke();
        }
      }

      this.drawAmbientEffects();

      // Draw Grid
      this.e.ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      this.e.ctx.lineWidth = 1;
      const gridSize = 32;
      for (let x = 0; x < w; x += gridSize) {
        this.e.ctx.beginPath();
        this.e.ctx.moveTo(x, 0);
        this.e.ctx.lineTo(x, h);
        this.e.ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        this.e.ctx.beginPath();
        this.e.ctx.moveTo(0, y);
        this.e.ctx.lineTo(w, y);
        this.e.ctx.stroke();
      }

      // Set common styles
      this.e.ctx.lineCap = 'round';
      this.e.ctx.lineJoin = 'round';

      // Draw Spawn Portal
      if (this.e.path.length > 0) {
        const portalImg = this.e.imageCache.get('portal');
        if (this.e.isImageValid(portalImg, 'portal')) {
          try {
            this.e.ctx.drawImage(portalImg!, this.e.path[0].x - 30, this.e.path[0].y - 30, 60, 60);
          } catch (e) {
            this.e.brokenImages.add('portal');
          }
          // Swirl effect
          this.e.ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
          this.e.ctx.lineWidth = 2;
          this.e.ctx.beginPath();
          this.e.ctx.arc(this.e.path[0].x, this.e.path[0].y, 25 + Math.sin(this.e.gameTime/200) * 5, 0, Math.PI * 2);
          this.e.ctx.stroke();
        }
      }

    // Draw Path
    this.drawPath();
    
    // Draw Grid Indicator if a tower is selected
    if (this.e.selectedTowerType && this.e.mousePos) {
      const gridSize = 32;
      const snappedX = Math.round(this.e.mousePos.x / gridSize) * gridSize;
      const snappedY = Math.round(this.e.mousePos.y / gridSize) * gridSize;
      const isValid = this.e.isValidPlacement(snappedX, snappedY);
      
      this.e.ctx.fillStyle = isValid ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 0, 0.2)';
      this.e.ctx.fillRect(snappedX - gridSize/2, snappedY - gridSize/2, gridSize, gridSize);
      this.e.ctx.strokeStyle = isValid ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
      this.e.ctx.lineWidth = 1;
      this.e.ctx.strokeRect(snappedX - gridSize/2, snappedY - gridSize/2, gridSize, gridSize);
      
      // Draw ghost tower
      this.e.ctx.save();
      this.e.ctx.globalAlpha = 0.5;
      const imgKey = `${this.e.selectedTowerType}_1`;
      const img = this.e.imageCache.get(imgKey);
      if (this.e.isImageValid(img, imgKey)) {
        try {
          this.e.ctx.drawImage(img!, snappedX - 18, snappedY - 18, 36, 36);
        } catch (e) {
          this.e.brokenImages.add(imgKey);
        }
      } else {
        this.e.ctx.fillStyle = '#ffffff';
        this.e.ctx.beginPath();
        this.e.ctx.arc(snappedX, snappedY, 18, 0, Math.PI * 2);
        this.e.ctx.fill();
      }
      this.e.ctx.globalAlpha = 1.0;

      // Draw Range Preview
      let towerRange = 100;
      if (this.e.selectedTowerType === 'archer') towerRange = 7 * 25 * this.e.upgrades.archerRange;
      else if (this.e.selectedTowerType === 'wizard') towerRange = 7 * 25;
      else if (this.e.selectedTowerType === 'cannon') towerRange = 9 * 25;
      else if (this.e.selectedTowerType === 'tzhaar') towerRange = 2 * 25;
      else if (this.e.selectedTowerType === 'slayer') towerRange = 7 * 25;
      else if (this.e.selectedTowerType === 'toxic') towerRange = 5 * 25;

      this.e.ctx.beginPath();
      this.e.ctx.arc(snappedX, snappedY, towerRange, 0, Math.PI * 2);
      this.e.ctx.strokeStyle = isValid ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
      this.e.ctx.lineWidth = 1;
      this.e.ctx.setLineDash([5, 5]);
      this.e.ctx.stroke();
      this.e.ctx.setLineDash([]);
      this.e.ctx.fillStyle = isValid ? 'rgba(0, 255, 0, 0.05)' : 'rgba(255, 0, 0, 0.05)';
      this.e.ctx.fill();

      this.e.ctx.restore();
    }

    // Draw Pets
      if (this.e.pets.length > 0) {
        const time = this.e.gameTime / 1000;
        this.e.pets.forEach((pet, index) => {
          // Movement logic: wander around the entire map
          const speed = 0.3;
          
          // Use a pseudo-random wander based on index and time
          // This allows pets to roam freely
          const wanderX = (Math.sin(time * speed + index * 100) * 0.4 + 0.5) * this.e.LOGIC_WIDTH;
          const wanderY = (Math.cos(time * speed * 0.8 + index * 200) * 0.4 + 0.5) * this.e.LOGIC_HEIGHT;
          
          let x = wanderX;
          let y = wanderY;
          
          // Store position for tooltip detection
          pet.x = x;
          pet.y = y;

          const imgKey = pet.type; 
          const img = this.e.imageCache.get(imgKey);
          
          if (this.e.isImageValid(img, imgKey)) {
            try {
              this.e.ctx.drawImage(img!, x - 15, y - 15, 30, 30);
            } catch (e) {
              this.e.brokenImages.add(imgKey);
            }
          } else {
            this.e.ctx.font = '20px Arial';
            this.e.ctx.textAlign = 'center';
            this.e.ctx.fillText('🐾', x, y);
          }
          
          this.e.ctx.fillStyle = '#00ffff';
          this.e.ctx.font = 'bold 10px Arial';
          this.e.ctx.textAlign = 'center';
          this.e.ctx.fillText(pet.name, x, y + 20);
        });
      }

      // Draw Towers
      const now = this.e.gameTime;
      this.e.towers.forEach(tower => {
        if (isNaN(tower.x) || isNaN(tower.y)) return;
        
        // Animation: Bobbing (Uses real-time but clamped)
        const bob = Math.sin(now / 500 + tower.x) * 3;
        
        // Directional Recoil
        let recoilX = 0;
        let recoilY = 0;
        if (tower.recoil && tower.recoil > 0) {
          recoilX = Math.cos(tower.recoilAngle || 0) * tower.recoil;
          recoilY = Math.sin(tower.recoilAngle || 0) * tower.recoil;
        }
        
        // Targeting Feedback
        if (tower.targetId) {
          const target = this.e.enemies.find(e => e.id === tower.targetId);
          if (target) {
            const isSelected = tower.id === this.e.hoveredEntityId || tower.id === this.e.selectedEntityId;
            this.e.ctx.beginPath();
            this.e.ctx.moveTo(tower.x, tower.y);
            this.e.ctx.lineTo(target.x, target.y);
            this.e.ctx.strokeStyle = isSelected ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.15)';
            this.e.ctx.lineWidth = isSelected ? 2 : 1;
            if (!isSelected) this.e.ctx.setLineDash([2, 4]);
            this.e.ctx.stroke();
            this.e.ctx.setLineDash([]);
            
            // Draw a small reticle on the target if selected
            if (isSelected) {
              this.e.ctx.strokeStyle = '#ff0000';
              this.e.ctx.lineWidth = 1;
              this.e.ctx.beginPath();
              this.e.ctx.arc(target.x, target.y, 15 + Math.sin(now / 100) * 5, 0, Math.PI * 2);
              this.e.ctx.stroke();
            }
          }
        }
        
        let imgKey = `${tower.type}_${tower.level}`;
        if (tower.type === 'wizard') {
          if (tower.mageMode === 'elemental') {
            imgKey = `wizard_elemental_${tower.element || 'air'}`;
          } else if (tower.mageMode === 'ancients') {
            imgKey = `wizard_ancients`;
          } else if (tower.mageMode === 'utility') {
            imgKey = `wizard_utility`;
          } else {
            imgKey = `wizard_${tower.level}`;
          }
        }
        
        // Fallback to level-based key if specific one fails
        let img = this.e.imageCache.get(imgKey);
        if (!img || !img.complete || img.naturalWidth === 0 || this.e.brokenImages.has(imgKey)) {
          imgKey = `${tower.type}_1`;
          img = this.e.imageCache.get(imgKey);
        }
        
        this.e.ctx.save();
        this.e.ctx.translate(tower.x + recoilX, tower.y + bob + recoilY);
        
        // Rotate towards target if exists
        if (tower.targetId) {
          const target = this.e.enemies.find(e => e.id === tower.targetId);
          if (target) {
            const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
            this.e.ctx.rotate(angle + Math.PI / 2); // Images face up
          }
        }

        if (this.e.isImageValid(img, imgKey)) {
          const size = (tower.visualRadius || 18) * 2;
          try {
            this.e.ctx.drawImage(img!, -size/2, -size/2, size, size);
          } catch (e) {
            this.e.brokenImages.add(imgKey);
          }
        } else {
          this.e.ctx.fillStyle = tower.color;
          this.e.ctx.beginPath();
          this.e.ctx.arc(0, 0, tower.visualRadius || 18, 0, Math.PI * 2);
          this.e.ctx.fill();
        }
        this.e.ctx.restore();
        
        // Border for high level
        if (tower.level >= 3) {
          this.e.ctx.beginPath();
          this.e.ctx.arc(tower.x, tower.y, (tower.visualRadius || 18) + 2, 0, Math.PI * 2);
          this.e.ctx.strokeStyle = tower.level === 4 ? '#ff0000' : '#ffff00';
          this.e.ctx.lineWidth = 2;
          this.e.ctx.stroke();
        }

        // Draw Range if hovered, selected, or toggled
        if (tower.id === this.e.hoveredEntityId || tower.id === this.e.selectedEntityId || tower.showRange) {
          const stats = this.e.calculateTowerStats(tower);
          
          // Draw circle
          this.e.ctx.beginPath();
          this.e.ctx.strokeStyle = tower.showRange ? 'rgba(255, 255, 0, 0.4)' : 'rgba(255, 255, 255, 0.3)';
          this.e.ctx.lineWidth = 2;
          this.e.ctx.setLineDash([5, 5]);
          this.e.ctx.arc(tower.x, tower.y, stats.range, 0, Math.PI * 2);
          this.e.ctx.stroke();
          this.e.ctx.setLineDash([]);
          this.e.ctx.fillStyle = tower.showRange ? 'rgba(255, 255, 0, 0.08)' : 'rgba(255, 255, 255, 0.05)';
          this.e.ctx.fill();

          // OSRS-style grid overlay
          this.e.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          this.e.ctx.lineWidth = 1;
          const gridSize = 25;
          const startX = Math.floor((tower.x - stats.range) / gridSize) * gridSize;
          const startY = Math.floor((tower.y - stats.range) / gridSize) * gridSize;
          const endX = Math.ceil((tower.x + stats.range) / gridSize) * gridSize;
          const endY = Math.ceil((tower.y + stats.range) / gridSize) * gridSize;

          for (let x = startX; x <= endX; x += gridSize) {
            this.e.ctx.beginPath();
            this.e.ctx.moveTo(x, startY);
            this.e.ctx.lineTo(x, endY);
            this.e.ctx.stroke();
          }
          for (let y = startY; y <= endY; y += gridSize) {
            this.e.ctx.beginPath();
            this.e.ctx.moveTo(startX, y);
            this.e.ctx.lineTo(endX, y);
            this.e.ctx.stroke();
          }
        }

        // Disabled indicator (Boss attack)
        if (tower.disabledTimer > 0) {
          this.e.ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
          this.e.ctx.beginPath();
          this.e.ctx.arc(tower.x, tower.y, (tower.visualRadius || 18) + 2, 0, Math.PI * 2);
          this.e.ctx.fill();
          
          this.e.ctx.strokeStyle = '#00ff00';
          this.e.ctx.lineWidth = 2;
          this.e.ctx.setLineDash([5, 5]);
          this.e.ctx.stroke();
          this.e.ctx.setLineDash([]);
        }

        // Level indicator
        this.e.ctx.fillStyle = '#fff';
        this.e.ctx.font = 'bold 10px Arial';
        this.e.ctx.textAlign = 'center';
        this.e.ctx.fillText(tower.level.toString(), tower.x, tower.y + 4);
      });

      // Draw Gathering Nodes
      this.e.nodes.forEach(n => {
        if (n.respawnTimer > 0) return;
        let imgKey = 'tree';
        if (n.type === 'ore') imgKey = 'ore_adamant';
        if (n.type === 'herb') imgKey = 'ranarr';
        
        const img = this.e.imageCache.get(imgKey);
        if (this.e.isImageValid(img, imgKey)) {
          try {
            this.e.ctx.drawImage(img!, n.x - 16, n.y - 16, 32, 32);
          } catch (e) {
            this.e.brokenImages.add(imgKey);
          }
        } else {
          this.e.ctx.fillStyle = n.type === 'tree' ? '#8B4513' : n.type === 'ore' ? '#555' : '#0f0';
          this.e.ctx.fillRect(n.x - 10, n.y - 10, 20, 20);
        }
        
        // Name tag
        this.e.ctx.fillStyle = '#ffff00';
        this.e.ctx.font = '8px Arial';
        this.e.ctx.textAlign = 'center';
        this.e.ctx.fillText(n.name, n.x, n.y - 18);
      });

      // Draw Enemies
      this.e.enemies.forEach(enemy => {
        if (isNaN(enemy.x) || isNaN(enemy.y)) return;

        const img = this.e.imageCache.get(enemy.type);
        const isBoss = enemy.type === 'vorkath' || enemy.type === 'zulrah' || enemy.type === 'jad';
        const size = isBoss ? 60 : 30;

        this.e.ctx.save();
        this.e.ctx.translate(enemy.x + (enemy.shakeX || 0), enemy.y + (enemy.shakeY || 0));
        
        // OSRS Rule #2: DO NOT rotate NPC images. They are sideways/front-facing in Wiki.
        // Rule Extension: Most face right. Mirror if moving left.
        const targetPoint = this.e.path[enemy.pathIndex + 1] || enemy;
        const movingLeft = targetPoint.x < enemy.x;
        
        if (this.e.isImageValid(img, enemy.type)) {
          if (movingLeft) this.e.ctx.scale(-1, 1);
          try {
            this.e.ctx.drawImage(img!, -size/2, -size/2, size, size);
          } catch (e) {
            this.e.brokenImages.add(enemy.type);
          }
        } else {
          this.e.ctx.fillStyle = enemy.color;
          this.e.ctx.beginPath();
          this.e.ctx.arc(0, 0, isBoss ? 20 : 10, 0, Math.PI * 2);
          this.e.ctx.fill();
        }
        this.e.ctx.restore();

        // Status effects
        if (enemy.slowTimer > 0) {
          this.e.ctx.strokeStyle = '#00ffff';
          this.e.ctx.lineWidth = 2;
          this.e.ctx.beginPath();
          this.e.ctx.arc(enemy.x, enemy.y, 12, 0, Math.PI * 2);
          this.e.ctx.stroke();
          this.e.ctx.font = '10px Arial';
          this.e.ctx.fillText('❄️', enemy.x - 15, enemy.y + 10);
        }
        if (enemy.stunTimer > 0) {
          // Frozen: icy blue ring + fill tint
          const pulseAlpha = 0.3 + 0.15 * Math.sin((this.e.gameTime / 1000) * 6);
          this.e.ctx.fillStyle = `rgba(100, 200, 255, ${pulseAlpha})`;
          this.e.ctx.beginPath();
          this.e.ctx.arc(enemy.x, enemy.y, (isBoss ? 20 : 10) + 4, 0, Math.PI * 2);
          this.e.ctx.fill();
          this.e.ctx.strokeStyle = '#00c8ff';
          this.e.ctx.lineWidth = 2.5;
          this.e.ctx.beginPath();
          this.e.ctx.arc(enemy.x, enemy.y, (isBoss ? 20 : 10) + 6, 0, Math.PI * 2);
          this.e.ctx.stroke();
          // Snowflake label
          this.e.ctx.font = `${isBoss ? 14 : 10}px Arial`;
          this.e.ctx.textAlign = 'center';
          this.e.ctx.fillStyle = '#ffffff';
          this.e.ctx.fillText('❄', enemy.x, enemy.y - (isBoss ? 28 : 20));
        }

        if ((enemy.burnTimer ?? 0) > 0) {
          // Fire particles or glow
          const pulse = 0.5 + 0.5 * Math.sin((this.e.gameTime / 1000) * 10);
          this.e.ctx.fillStyle = `rgba(255, 100, 0, ${0.3 * pulse})`;
          this.e.ctx.beginPath();
          this.e.ctx.arc(enemy.x, enemy.y, (isBoss ? 25 : 15), 0, Math.PI * 2);
          this.e.ctx.fill();
          this.e.ctx.font = '12px Arial';
          this.e.ctx.fillText('🔥', enemy.x + 10, enemy.y - 10);
        }

        if ((enemy.poisonTimer || 0) > 0 || (enemy.venomTimer && enemy.venomTimer > 0)) {
          // Poison green tint
          this.e.ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
          this.e.ctx.beginPath();
          this.e.ctx.arc(enemy.x, enemy.y, (isBoss ? 20 : 10), 0, Math.PI * 2);
          this.e.ctx.fill();
          this.e.ctx.font = '12px Arial';
          this.e.ctx.fillText('🧪', enemy.x - 10, enemy.y - 10);
        }

        // Health bar
        const barWidth = isBoss ? 60 : 30;
        const barHeight = isBoss ? 6 : 4;
        const barY = isBoss ? enemy.y - 40 : enemy.y - 20;

        this.e.ctx.fillStyle = '#ff0000';
        this.e.ctx.fillRect(enemy.x - barWidth/2, barY, barWidth, barHeight);
        this.e.ctx.fillStyle = '#00ff00';
        this.e.ctx.fillRect(enemy.x - barWidth/2, barY, barWidth * (enemy.hp / enemy.maxHp), barHeight);

        if (isBoss) {
          this.e.ctx.strokeStyle = '#fff';
          this.e.ctx.lineWidth = 1;
          this.e.ctx.strokeRect(enemy.x - barWidth/2, barY, barWidth, barHeight);
          
          this.e.ctx.fillStyle = '#fff';
          this.e.ctx.font = 'bold 12px Arial';
          this.e.ctx.textAlign = 'center';
          this.e.ctx.fillText(enemy.type.toUpperCase(), enemy.x, barY - 5);
        }
        if (enemy.tauntTimer > 0) {
          this.e.ctx.strokeStyle = '#ff0000';
          this.e.ctx.lineWidth = 1;
          this.e.ctx.beginPath();
          this.e.ctx.arc(enemy.x, enemy.y, 16, 0, Math.PI * 2);
          this.e.ctx.stroke();
        }
      });

      // Draw Projectiles
      this.e.projectiles.forEach(p => {
        if (isNaN(p.x) || isNaN(p.y)) return;
        
        const target = this.e.enemies.find(e => e.id === p.targetId);
        let angle = 0;
        if (target) {
          angle = Math.atan2(target.y - p.y, target.x - p.x);
        }

        this.e.ctx.save();
        this.e.ctx.translate(p.x, p.y);
        this.e.ctx.rotate(angle);
        
        if (p.type === 'cannonball') {
           this.e.ctx.rotate(-angle); // Cannonballs don't rotate
           this.e.ctx.fillStyle = '#333';
           this.e.ctx.beginPath();
           this.e.ctx.arc(0, 0, 4, 0, Math.PI * 2);
           this.e.ctx.fill();
           this.e.ctx.strokeStyle = '#000';
           this.e.ctx.stroke();
        } else if (p.type === 'spell') {
           this.e.ctx.rotate(-angle); // Spells are spheres usually
           const colors: Record<string, string> = { air: '#ffffff', water: '#0000ff', earth: '#8b4513', fire: '#ff0000' };
           this.e.ctx.fillStyle = colors[p.element || 'air'];
           this.e.ctx.shadowBlur = 10;
           this.e.ctx.shadowColor = this.e.ctx.fillStyle as string;
           this.e.ctx.beginPath();
           this.e.ctx.arc(0, 0, 5, 0, Math.PI * 2);
           this.e.ctx.fill();
         } else if (p.type.startsWith('ancient_')) {
            this.e.ctx.rotate(-angle);
            const ancColors: Record<string, string> = { ice: '#00ffff', smoke: '#555', shadow: '#440044', blood: '#ff0000' };
            const type = p.type.replace('ancient_', '');
            this.e.ctx.fillStyle = ancColors[type] || '#fff';
            this.e.ctx.shadowBlur = 15;
            this.e.ctx.shadowColor = this.e.ctx.fillStyle as string;
            this.e.ctx.beginPath();
            this.e.ctx.arc(0, 0, 6, 0, Math.PI * 2);
            this.e.ctx.fill();
         } else if (p.type === 'dart') {
           this.e.ctx.fillStyle = '#00ff00';
           this.e.ctx.fillRect(-6, -1.5, 12, 3);
        } else if (p.type === 'arrow' || p.type === 'bolt') {
           this.e.ctx.fillStyle = p.color;
           this.e.ctx.fillRect(-8, -1, 16, 2);
           // Fletching/Head
           this.e.ctx.fillStyle = '#fff';
           this.e.ctx.fillRect(-8, -2, 3, 4);
        } else {
           this.e.ctx.fillStyle = p.color;
           this.e.ctx.beginPath();
           this.e.ctx.arc(0, 0, 3, 0, Math.PI * 2);
           this.e.ctx.fill();
        }
        
        this.e.ctx.restore();
      });

      // Draw Particles
      this.e.particles.forEach(p => {
        this.e.ctx.fillStyle = p.color;
        this.e.ctx.globalAlpha = p.life / 0.3;
        this.e.ctx.beginPath();
        this.e.ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        this.e.ctx.fill();
        this.e.ctx.globalAlpha = 1.0;
      });

      // Draw Hitsplats
      this.e.hitsplats.forEach(hs => {
        const splatType = hs.type === 'melee' ? 'hit_splat' : `${hs.type}_hit_splat`;
        const splatImg = this.e.imageCache.get(splatType);
        
        if (this.e.isImageValid(splatImg, splatType)) {
          try {
            this.e.ctx.globalAlpha = hs.life;
            this.e.ctx.drawImage(splatImg!, hs.x - 15, hs.y - 15, 30, 30);
            this.e.ctx.globalAlpha = 1.0;
          } catch (e) {
            this.e.brokenImages.add(splatType);
          }
        }
      });

      // Draw Damage Numbers
      this.e.damageNumbers.forEach(dn => {
        this.e.ctx.fillStyle = dn.color;
        this.e.ctx.globalAlpha = dn.life;
        this.e.ctx.font = `bold ${Math.floor(12 + dn.life * 4)}px 'RuneScape', Arial`;
        this.e.ctx.textAlign = 'center';
        this.e.ctx.fillText(dn.text, dn.x, dn.y + 5);
        this.e.ctx.globalAlpha = 1.0;
      });

      // Draw Death Animations
      this.e.deathAnimations.forEach(da => {
        const img = this.e.imageCache.get(da.type);
        if (this.e.isImageValid(img, da.type)) {
          this.e.ctx.globalAlpha = Math.min(1, da.life * 2);
          try {
            this.e.ctx.drawImage(img!, da.x - 15, da.y - 15, 30, 30);
          } catch (e) {
            this.e.brokenImages.add(da.type);
          }
          this.e.ctx.globalAlpha = 1.0;
        }
      });

      // Draw Floating Texts (Level ups, etc)
      this.e.floatingTexts.forEach(ft => {
        this.e.ctx.save();
        this.e.ctx.globalAlpha = Math.min(1, ft.life * 2);
        this.e.ctx.fillStyle = ft.color;
        this.e.ctx.shadowColor = '#000';
        this.e.ctx.shadowBlur = 4;
        this.e.ctx.shadowOffsetX = 1;
        this.e.ctx.shadowOffsetY = 1;

        if (ft.text.includes('XP')) {
            this.e.ctx.font = `bold 11px 'RuneScape', Arial`;
            this.e.ctx.textAlign = 'left';
            const textWidth = this.e.ctx.measureText(ft.text).width;
            
            if (ft.icon) {
              const iconKey = ft.icon.toLowerCase();
              const iconImg = this.e.imageCache.get(iconKey);
              if (this.e.isImageValid(iconImg, iconKey)) {
                try {
                  this.e.ctx.drawImage(iconImg!, ft.x - textWidth/2 - 12, ft.y - 10, 10, 10);
                } catch (e) {
                  this.e.brokenImages.add(iconKey);
                }
              }
            }
            this.e.ctx.fillText(ft.text, ft.x - textWidth/2 + 2, ft.y);
        } else {
            this.e.ctx.font = `bold 16px 'RuneScape', Arial`;
            this.e.ctx.textAlign = 'center';
            this.e.ctx.fillText(ft.text, ft.x, ft.y);
            
            if (ft.icon) {
              const iconKey = ft.icon.toLowerCase();
              const iconImg = this.e.imageCache.get(iconKey);
              if (this.e.isImageValid(iconImg, iconKey)) {
                try {
                  this.e.ctx.drawImage(iconImg!, ft.x - 10, ft.y - 35, 20, 20);
                } catch (e) {
                  this.e.brokenImages.add(iconKey);
                }
              }
            }
        }
        this.e.ctx.restore();
      });

      // Draw Loots — all loots show as bones icon (OSRS style), click to collect
      const bonesImg = this.e.imageCache.get('bones_loot');
      this.e.loots.forEach(loot => {
        this.e.ctx.save();
        this.e.ctx.translate(loot.x, loot.y);
        const pulse = 1 + Math.sin(now / 300) * 0.15;
        this.e.ctx.scale(pulse, pulse);
        
        // Draw bones icon
        if (this.e.isImageValid(bonesImg, 'bones_loot')) {
          try {
            this.e.ctx.drawImage(bonesImg!, -12, -12, 24, 24);
          } catch (e) {
            this.e.brokenImages.add('bones_loot');
          }
        } else {
          this.e.ctx.font = '20px Arial';
          this.e.ctx.textAlign = 'center';
          this.e.ctx.fillText('🦴', 0, 8);
        }
        
        // Draw specific loot icon
        let iconKey = '';
        if (loot.type === 'money') iconKey = 'coins_icon';
        else if (loot.type === 'essence') iconKey = 'rune_essence_icon';
        else if (loot.type === 'item' && loot.data) iconKey = loot.data.id;

        if (iconKey) {
          const iconImg = this.e.imageCache.get(iconKey);
          if (this.e.isImageValid(iconImg, iconKey)) {
            try {
              this.e.ctx.drawImage(iconImg!, -12, -12, 24, 24);
            } catch (e) {
              this.e.brokenImages.add(iconKey);
            }
          }
        }
        
        // Tinted glow based on loot type
        if (loot.type !== 'bones') {
          const glowColor = loot.type === 'essence' ? '#00ffff' : loot.type === 'item' ? '#ff8000' : '#ffff00';
          this.e.ctx.globalAlpha = 0.25 + 0.15 * Math.sin(now / 150);
          this.e.ctx.fillStyle = glowColor;
          this.e.ctx.beginPath();
          this.e.ctx.arc(0, 0, 14, 0, Math.PI * 2);
          this.e.ctx.fill();
          this.e.ctx.globalAlpha = 1.0;
        }
        
        this.e.ctx.restore();
      });

    } catch (e) {
      console.error('Draw loop error:', e);
    } finally {
      this.e.ctx.restore();
    }
  }
}
