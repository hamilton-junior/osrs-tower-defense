
  damageEnemy(enemy: Enemy, damage: number, sourceTowerId?: string) {
    const actualDamage = Math.max(0, Math.floor(damage));
    enemy.hp -= actualDamage;
    this.playSound('hit');

    // Create damage number
    this.damageNumbers.push({
      x: enemy.x + (Math.random() - 0.5) * 15,
      y: enemy.y - 15,
      text: actualDamage > 0 ? actualDamage.toString() : '0',
      life: 0.8,
      color: actualDamage > 50 ? '#ff0000' : (actualDamage > 0 ? '#ffff00' : '#808080'),
      velocityY: -80,
      velocityX: (Math.random() - 0.5) * 40
    });
    
    // Award XP to tower
    if (sourceTowerId) {
      const tower = this.towers.find(t => t.id === sourceTowerId);
      if (tower) {
        this.awardTowerXP(tower, actualDamage);
      }
    }
    
    // Add hit particle
    this.particles.push({
      x: enemy.x + (Math.random() - 0.5) * 10,
      y: enemy.y + (Math.random() - 0.5) * 10,
      life: 0.3,
      color: '#ff0000'
    });

    if (enemy.hp <= 0) {
      const index = this.enemies.indexOf(enemy);
      if (index > -1) {
        const deathSound = enemy.deathSound || 'kill';
        this.playSound(deathSound);
        
        this.enemies.splice(index, 1);
        
        // Update Quests
        this.updateQuests('kill', 1, enemy.type);

        // Monster Loot
        if (Math.random() < 0.3) {
          const lootType = Math.random() > 0.8 ? 'essence' : 'money';
          this.loots.push({
            id: Math.random().toString(),
            x: enemy.x,
            y: enemy.y,
            type: lootType,
            data: lootType === 'money' ? Math.floor(enemy.reward * 0.5) : undefined,
            life: 10,
            size: 20
          });
        }

        // GP Reward
        let gpReward = enemy.reward * (this.upgrades.rewardMultiplier || 1);
        if (this.pets.some(p => p.name === 'Snakeling')) gpReward = Math.floor(gpReward * 1.1);
        this.money += Math.floor(gpReward);

        // Essence Bonus
        if (Math.random() < 0.1 * (this.upgrades.rewardMultiplier || 1)) {
          this.runeEssence += 1;
        }

        // Achievements
        if (enemy.type === 'jad') {
          const ach = this.achievements.find(a => a.id === 'boss_slayer');
          if (ach) ach.completed = true;
        } else if (enemy.type === 'vorkath') {
          const ach = this.achievements.find(a => a.id === 'vorkath_slayer');
          if (ach) ach.completed = true;
        } else if (enemy.type === 'zulrah') {
          const ach = this.achievements.find(a => a.id === 'zulrah_slayer');
          if (ach) ach.completed = true;
        }

        // Item Drop
        if (Math.random() < 0.05) {
          const tiers = [
            { id: 'bronze', name: 'Bronze Sword', bonus: { damage: 5 }, type: 'weapon' as const },
            { id: 'iron', name: 'Iron Sword', bonus: { damage: 10 }, type: 'weapon' as const },
            { id: 'steel', name: 'Steel Sword', bonus: { damage: 15 }, type: 'weapon' as const },
            { id: 'mithril', name: 'Mithril Sword', bonus: { damage: 25 }, type: 'weapon' as const },
            { id: 'adamant', name: 'Adamant Sword', bonus: { damage: 40 }, type: 'weapon' as const },
            { id: 'rune', name: 'Rune Sword', bonus: { damage: 60 }, type: 'weapon' as const },
            { id: 'dragon', name: 'Dragon Sword', bonus: { damage: 90 }, type: 'weapon' as const },
            { id: 'godsword', name: 'Godsword', bonus: { damage: 150 }, type: 'weapon' as const },
            { id: 'scythe', name: 'Scythe of Vitur', bonus: { damage: 250 }, type: 'weapon' as const }
          ];
          const maxTier = Math.min(tiers.length - 1, Math.floor(this.wave / 3));
          const drop = tiers[Math.floor(Math.random() * (maxTier + 1))];
          
          this.loots.push({
            id: Math.random().toString(),
            x: enemy.x + (Math.random()-0.5)*20,
            y: enemy.y + (Math.random()-0.5)*20,
            type: 'item',
            data: drop,
            life: 15,
            size: 25
          });
        }

        // Pet Drop
        const isBoss = enemy.type === 'vorkath' || enemy.type === 'zulrah' || enemy.type === 'jad';
        let dropChance = isBoss ? 0.5 : 0.01;
        if (this.pets.some(p => p.name === 'Baby Mole')) dropChance *= 1.5;

        if (Math.random() < dropChance) {
          const petTable: Partial<Record<string, { name: string, type: string, bonus: string }>> = {
            vorkath: { name: 'Vorki', type: 'vorki', bonus: 'Dragon Slayer: +15% DMG vs Dragons' },
            zulrah: { name: 'Snakeling', type: 'snakeling', bonus: 'Serpent Scale: +10% GP drops' },
            jad: { name: "TzRek-Jad", type: 'rift_guardian', bonus: 'Jad\'s Might: +20% fire damage' },
            green_dragon: { name: 'Prince Black Dragon', type: 'prince_black_dragon', bonus: 'Dragon Blood: +8% ATK vs Dragons' },
            blue_dragon: { name: 'Prince Black Dragon', type: 'prince_black_dragon', bonus: 'Dragon Blood: +8% ATK vs Dragons' },
            hydra: { name: 'Ikkle Hydra', type: 'heron', bonus: 'Hydra\'s Eye: +10% range' }
          };
          const petEntry = petTable[enemy.type];
          if (petEntry && !this.pets.find(p => p.name === petEntry.name)) {
            this.pets.push({ id: Math.random().toString(), ...petEntry });
            this.playSound('level_up');
          }
        }
        
        // Slayer Task
        if (this.slayerTask && this.slayerTask.type === enemy.type && this.slayerTask.count > 0) {
          this.slayerTask.count--;
          if (this.slayerTask.count === 0) {
            this.money += this.slayerTask.reward;
            this.playSound('task_assign');
            this.assignSlayerTask();
          }
        }

        this.onStateChange({ 
          money: this.money, 
          runeEssence: this.runeEssence, 
          pets: this.pets, 
          achievements: this.achievements,
          slayerTask: this.slayerTask,
          remainingEnemies: this.enemiesToSpawn.length + this.enemies.length
        });
      }
    }
  }

  awardTowerXP(tower: Tower, amount: number) {
    const xpGain = (amount / 2) * (this.upgrades.xpGainMultiplier || 1);
    let skillKey: keyof TowerSkills = 'attack';
    
    if (tower.type === 'archer') skillKey = 'ranged';
    else if (tower.type === 'wizard') skillKey = 'magic';
    else if (tower.type === 'cannon') skillKey = 'strength';
    else if (tower.type === 'tzhaar') skillKey = 'attack';

    const skill = tower.skills[skillKey];
    skill.xp += xpGain;
    
    const nextLevelXP = Math.pow(skill.level, 2) * 100;
    if (skill.xp >= nextLevelXP) {
      skill.level++;
      skill.xp -= nextLevelXP;
      this.playSound('level_up');
      this.addMessage(`Your ${tower.name} has reached level ${skill.level} in ${skillKey}!`);
      
      this.particles.push({ x: tower.x, y: tower.y - 20, life: 1, color: '#ffff00' });
      
      if (skillKey === 'ranged' || skillKey === 'magic' || skillKey === 'attack') {
        tower.damage += 2;
      }
      if (skillKey === 'strength') {
        tower.damage += 5;
      }
    }
  }

  updateQuests(type: Quest['objective']['type'], amount: number, enemyType?: EnemyType) {
    let changed = false;
    this.quests.forEach(quest => {
      if (quest.completed) return;
      
      if (quest.objective.type === type) {
        if (type === 'kill') {
          if (quest.objective.enemyType === enemyType) {
            quest.objective.current += amount;
          }
        } else {
          quest.objective.current = amount;
        }

        if (quest.objective.current >= quest.objective.target) {
          quest.objective.current = quest.objective.target;
          quest.completed = true;
          this.playSound('level_up');
          changed = true;
        }
      }
    });
    if (changed) this.onStateChange({ quests: this.quests });
  }

  claimQuestReward(questId: string) {
    const quest = this.quests.find(q => q.id === questId);
    if (quest && quest.completed && !quest.claimed) {
      quest.claimed = true;
      if (quest.reward.money) this.money += quest.reward.money;
      if (quest.reward.essence) this.runeEssence += quest.reward.essence;
      if (quest.reward.item) this.inventory.push(quest.reward.item);
      
      this.playSound('upgrade');
      this.onStateChange({ 
        money: this.money, 
        runeEssence: this.runeEssence, 
        inventory: this.inventory,
        quests: this.quests 
      });
    }
  }

  fireSpecialAttack(tower: Tower, primaryTarget: any, baseDamage: number) {
    this.playSound('special_attack');
    this.particles.push({ x: tower.x, y: tower.y, life: 1.5, color: '#ffffff' });

    switch (tower.type) {
      case 'archer': {
        if (tower.name === 'Magic Shortbow') {
          const dmg = Math.floor(baseDamage * 0.85);
          this.projectiles.push({ id: Math.random().toString(36).substr(2,9), x: tower.x, y: tower.y, targetId: primaryTarget.id, speed: 600, damage: dmg, color: '#00ff00', sourceTowerId: tower.id });
          setTimeout(() => {
            const t = this.enemies.find(e => e.id === primaryTarget.id);
            if (t) this.projectiles.push({ id: Math.random().toString(36).substr(2,9), x: tower.x, y: tower.y, targetId: t.id, speed: 600, damage: dmg, color: '#00ff00', sourceTowerId: tower.id });
          }, 100);
        } else if (tower.name === 'Bow of Faerdhinen') {
          for (let i = 0; i < 3; i++) {
            setTimeout(() => {
              const target = this.enemies.find(e => e.id === primaryTarget.id);
              if (target) this.projectiles.push({ id: Math.random().toString(36).substr(2,9), x: tower.x, y: tower.y, targetId: target.id, speed: 550, damage: Math.floor(baseDamage), color: '#a020f0', sourceTowerId: tower.id });
            }, i * 120);
          }
        } else {
          this.damageEnemy(primaryTarget, Math.floor(baseDamage * 1.5), tower.id);
        }
        break;
      }
      case 'tzhaar': {
        if (tower.name === "Inquisitor's Mace") {
          const radius = 55;
          this.enemies.forEach(e => {
            const dx = e.x - primaryTarget.x; const dy = e.y - primaryTarget.y;
            if (Math.sqrt(dx*dx+dy*dy) <= radius) {
              this.damageEnemy(e, Math.floor(baseDamage * 1.25), tower.id);
              this.particles.push({ x: e.x, y: e.y, life: 0.8, color: '#ff4500' });
            }
          });
        } else if (tower.name === 'TzHaar-Ket-Om') {
          this.damageEnemy(primaryTarget, Math.floor(baseDamage * 1.2), tower.id);
          primaryTarget.stunTimer = 3.0;
        } else {
          this.damageEnemy(primaryTarget, Math.floor(baseDamage * 1.5), tower.id);
        }
        break;
      }
      case 'slayer': {
        if (tower.name === 'Zaryte Crossbow') {
          this.damageEnemy(primaryTarget, Math.floor(baseDamage * 1.5), tower.id);
          const nearby = this.enemies.find(e => e.id !== primaryTarget.id && Math.sqrt(Math.pow(e.x-primaryTarget.x,2)+Math.pow(e.y-primaryTarget.y,2)) < 40);
          if (nearby) this.damageEnemy(nearby, Math.floor(baseDamage * 0.75), tower.id);
        } else if (tower.name === 'Twisted Bow') {
          this.damageEnemy(primaryTarget, Math.floor(baseDamage), tower.id);
          this.damageEnemy(primaryTarget, Math.floor(baseDamage * 0.5), tower.id);
        } else {
          this.damageEnemy(primaryTarget, Math.floor(baseDamage * 1.2), tower.id);
        }
        break;
      }
      case 'toxic': {
        if (tower.name === 'Zulrah Alter') {
          const radius = 70;
          this.enemies.forEach(e => {
            const dx = e.x - tower.x; const dy = e.y - tower.y;
            if (Math.sqrt(dx*dx+dy*dy) <= radius) {
              this.applySlow(e);
              this.damageEnemy(e, Math.floor(baseDamage * 0.8), tower.id);
              this.particles.push({ x: e.x, y: e.y, life: 1, color: '#00cf9f' });
            }
          });
        } else {
          const dmg = Math.floor(baseDamage * 1.5);
          this.damageEnemy(primaryTarget, dmg, tower.id);
          this.money += Math.floor(dmg * 0.5);
          this.onStateChange({ money: this.money });
        }
        break;
      }
      case 'wizard': {
        const radius = 100;
        this.enemies.forEach(e => {
          const dx = e.x - tower.x; const dy = e.y - tower.y;
          if (Math.sqrt(dx*dx+dy*dy) <= radius) {
            this.applySlow(e);
            this.particles.push({ x: e.x, y: e.y, life: 1, color: '#ff00ff' });
          }
        });
        break;
      }
      case 'cannon': {
        this.enemies.forEach(e => {
          const dx = e.x - tower.x; const dy = e.y - tower.y;
          if (Math.sqrt(dx*dx+dy*dy) <= tower.range) {
            const dmg = Math.floor((tower.minDamage || 0) + Math.random() * ((tower.maxDamage || 0) - (tower.minDamage || 0)));
            this.damageEnemy(e, dmg, tower.id);
            this.particles.push({ x: e.x, y: e.y, life: 0.5, color: '#ff6600' });
          }
        });
        break;
      }
    }
  }

  buyAchievementUpgrade(upgradeId: string): boolean {
    const upgrades: { id: string, cost: number, apply: () => void }[] = [
      { id: 'extra_lives', cost: 50, apply: () => { this.lives = Math.min(100, this.lives + 5); this.onStateChange({ lives: this.lives }); } },
      { id: 'money_bonus', cost: 30, apply: () => { this.money += 500; this.onStateChange({ money: this.money }); } },
      { id: 'essence_bonus', cost: 20, apply: () => { this.runeEssence += 20; this.onStateChange({ runeEssence: this.runeEssence }); } },
      { id: 'prayer_bonus', cost: 25, apply: () => { this.maxPrayerPoints *= 1.5; this.prayerPoints = this.maxPrayerPoints; this.onStateChange({ prayerPoints: this.prayerPoints, maxPrayerPoints: this.maxPrayerPoints }); } },
      { id: 'reset_spec', cost: 10, apply: () => { this.towers.forEach(t => { t.specCharge = t.specMax || 100; }); } }
    ];
    const upgrade = upgrades.find(u => u.id === upgradeId);
    if (!upgrade || this.achievementPoints < upgrade.cost) return false;
    this.achievementPoints -= upgrade.cost;
    upgrade.apply();
    this.onStateChange({ achievementPoints: this.achievementPoints });
    return true;
  }

  toggleDevMode() {
    this.devMode = !this.devMode;
    this.onStateChange({ devMode: this.devMode });
  }

  applySlow(enemy: Enemy) {
    enemy.speed = enemy.baseSpeed * 0.5;
    enemy.slowTimer = 2.0;
  }

  applyStun(enemy: Enemy) {
    enemy.stunTimer = 1.0;
  }

  equipItem(towerId: string, itemId: string) {
    const tower = this.towers.find(t => t.id === towerId);
    const itemIndex = this.inventory.findIndex(i => i.id === itemId);
    if (!tower || itemIndex === -1) return;

    const item = this.inventory[itemIndex];
    const currentItem = tower.equipment[item.type];
    if (currentItem) {
      this.inventory.push(currentItem);
      if (currentItem.bonus.damage) tower.damage -= currentItem.bonus.damage;
      if (currentItem.bonus.range) tower.range -= currentItem.bonus.range;
      if (currentItem.bonus.cooldown) tower.cooldown += currentItem.bonus.cooldown;
    }

    tower.equipment[item.type] = item;
    this.inventory.splice(itemIndex, 1);

    if (item.bonus.damage) tower.damage += item.bonus.damage;
    if (item.bonus.range) tower.range += item.bonus.range;
    if (item.bonus.cooldown) tower.cooldown -= item.bonus.cooldown;

    this.playSound('upgrade');
    this.onStateChange({ inventory: this.inventory });
  }

  unequipItem(towerId: string, slot: 'weapon' | 'shield' | 'accessory') {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower) return;

    const item = tower.equipment[slot];
    if (item) {
      this.inventory.push(item);
      if (item.bonus.damage) tower.damage -= item.bonus.damage;
      if (item.bonus.range) tower.range -= item.bonus.range;
      if (item.bonus.cooldown) tower.cooldown += item.bonus.cooldown;
      
      tower.equipment[slot] = null;
      this.playSound('sell');
      this.onStateChange({ inventory: this.inventory });
    }
  }

  resetGame() {
    this.lives = 20;
    this.money = 150;
    this.wave = 1;
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.waveActive = false;
    this.onStateChange({ lives: 20, money: 150, wave: 1, isPlaying: false });
  }

  drawPath() {
    if (!this.ctx) return;
    this.ctx.beginPath();
    if (this.theme === 'sand') this.ctx.strokeStyle = '#8d7b4f';
    else if (this.theme === 'dark') this.ctx.strokeStyle = '#000000';
    else this.ctx.strokeStyle = '#3d2b1f';
    this.ctx.lineWidth = 46;
    if (this.path.length > 0) {
      this.ctx.moveTo(this.path[0].x, this.path[0].y);
      for (let i = 1; i < this.path.length; i++) this.ctx.lineTo(this.path[i].x, this.path[i].y);
    }
    this.ctx.stroke();

    this.ctx.beginPath();
    if (this.theme === 'sand') this.ctx.strokeStyle = '#a69466';
    else if (this.theme === 'dark') this.ctx.strokeStyle = '#222222';
    else this.ctx.strokeStyle = '#5d4037';
    this.ctx.lineWidth = 40;
    if (this.path.length > 0) {
      this.ctx.moveTo(this.path[0].x, this.path[0].y);
      for (let i = 1; i < this.path.length; i++) this.ctx.lineTo(this.path[i].x, this.path[i].y);
    }
    this.ctx.stroke();

    this.ctx.beginPath();
    if (this.theme === 'sand') this.ctx.strokeStyle = '#b8a473';
    else if (this.theme === 'dark') this.ctx.strokeStyle = '#331111';
    else this.ctx.strokeStyle = '#795548';
    this.ctx.lineWidth = 32;
    if (this.path.length > 0) {
      this.ctx.moveTo(this.path[0].x, this.path[0].y);
      for (let i = 1; i < this.path.length; i++) this.ctx.lineTo(this.path[i].x, this.path[i].y);
    }
    this.ctx.stroke();
  }
